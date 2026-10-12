/**
 * Houdt de stoelstatus van komende wedstrijden bij uit Ringside.
 *
 * Twee stromen, tegelijk gelezen: `/v1/manifests` (de stoelen) en `/v1/sales`
 * (de tickets). Elke run werkt binnen een tijdsbudget en gaat verder waar de
 * vorige stopte. De eerste keer is dat de hele historie — uren werk, in een
 * ketting van runs. Daarna leest een run alleen de nieuwe mutaties, en is hij
 * binnen seconden bij.
 *
 * SeatGeek ververst af en toe een hele dataset (enkele keren per kwartaal). Dat
 * meldt Ringside met HTTP 205: dan beginnen we die stroom opnieuw en gooien we
 * weg wat er uit die stroom lag.
 */

import { ringsideFetch, RingsideRequestError, type RingsidePage } from "./client";
import { readEventSales } from "./store";
import {
  applyManifestRow,
  applySalesRow,
  prunePastEvents,
  todayInAmsterdam,
  type EventStates,
  type ManifestFeedRow,
  type SalesFeedRow,
} from "./seat-state";
import {
  isSeatIngestLocked,
  readAllEventSeats,
  readSeatIndex,
  readSeatState,
  writeEventSeats,
  writeSeatState,
  type SeatIngestState,
} from "./seat-store";

/** Een pagina mag niet eindeloos hangen; dan liever een fout en de volgende run. */
const PAGE_TIMEOUT_MS = 60_000;

/**
 * Wachttijden voor een nieuwe poging na een tijdelijke fout. Ringside gaf bij
 * de eerste vulling een `503 Connection reset by peer` op de allereerste pagina;
 * zoiets is meestal na een paar seconden voorbij.
 */
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000];

/** Tijdelijk: serverfouten, te veel verzoeken, of een verbinding die wegviel. */
function isTransient(status: number | null): boolean {
  return status === null || status === 429 || status >= 500;
}

/**
 * Haalt één pagina op, met een paar nieuwe pogingen bij een tijdelijke fout.
 * Geen nieuwe poging meer als de deadline daardoor overschreden zou worden.
 */
async function fetchPage(path: string, cursor: string | null, deadline: number): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    let failure: unknown = null;
    try {
      res = await ringsideFetch(path, {
        searchParams: cursor ? { cursor } : {},
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      });
    } catch (error) {
      failure = error;
    }

    if (res && (res.ok || res.status === 205 || !isTransient(res.status))) return res;

    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined || Date.now() + delay > deadline) {
      if (res) {
        const body = (await res.text()).slice(0, 500);
        throw new RingsideRequestError(`Ringside ${path} gaf ${res.status} ${res.statusText}`, res.status, body);
      }
      throw failure;
    }
    console.warn(
      `[ringside/stoelen] ${path}: ${res ? `${res.status} ${res.statusText}` : String(failure)}; nieuwe poging over ${delay / 1000}s`
    );
    await res?.body?.cancel().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

interface FeedResult {
  rows: number;
  /** Tot het eind van de stroom gekomen: de data is nu actueel. */
  reachedEnd: boolean;
  /** SeatGeek heeft de dataset ververst (HTTP 205): opnieuw beginnen. */
  reset: boolean;
}

/**
 * Leest pagina's vanaf `cursor` tot het eind of tot de deadline.
 *
 * Eigen lus in plaats van `ringsidePages()`: die gooit bij een 205 niet en
 * probeert er dan JSON uit te lezen. De cursor wordt na elke pagina doorgegeven
 * via `onCursor`, zodat een fout halverwege het al gelezen werk niet weggooit.
 */
async function readFeed<T>(
  path: string,
  cursor: string | null,
  deadline: number,
  onRows: (rows: T[]) => void,
  onCursor: (cursor: string) => void
): Promise<FeedResult> {
  let rows = 0;
  let current = cursor;

  for (;;) {
    const res = await fetchPage(path, current, deadline);
    if (res.status === 205) return { rows, reachedEnd: false, reset: true };
    if (!res.ok) {
      const body = (await res.text()).slice(0, 500);
      throw new RingsideRequestError(`Ringside ${path} gaf ${res.status} ${res.statusText}`, res.status, body);
    }

    const page = (await res.json()) as RingsidePage<T>;
    onRows(page.data ?? []);
    rows += page.data?.length ?? 0;

    // Aan het eind van de stroom kan de cursor ontbreken. Dan blijft de vorige
    // staan: de volgende run leest de laatste pagina opnieuw, wat geen kwaad
    // kan omdat elke rij de vorige versie vervangt.
    const next = page.cursor || current;
    if (next) onCursor(next);
    if (!page.has_more || !page.cursor || page.cursor === current) {
      return { rows, reachedEnd: true, reset: false };
    }
    current = page.cursor;
    if (Date.now() > deadline) return { rows, reachedEnd: false, reset: false };
  }
}

export interface SeatIngestResult {
  manifestsRead: number;
  salesRead: number;
  eventsChanged: number;
  events: number;
  resets: string[];
}

/**
 * Eén run: laden, beide stromen lezen tot de deadline, opslaan.
 *
 * Past `state` aan maar slaat hem niet op — dat doet de aanroeper, die ook het
 * slot beheert.
 *
 * De cursors in `state` schuiven pas op nadat de stoelstatus is weggeschreven.
 * Gaat er onderweg iets mis, dan leest de volgende run hetzelfde stuk opnieuw;
 * dat kan geen kwaad, want elke rij vervangt alleen de vorige versie. Andersom —
 * een cursor die verder staat dan de opgeslagen data — zou stoelen of tickets
 * stilletjes laten verdwijnen.
 */
export async function runSeatIngest(state: SeatIngestState, deadline: number): Promise<SeatIngestResult> {
  const cutoff = todayInAmsterdam();
  const [index, products] = await Promise.all([readSeatIndex(), readEventSales()]);
  const events: EventStates = await readAllEventSeats(index);

  // Wedstrijddatums uit de productenlijst van de verkoop-ingest. Daarmee vallen
  // verkoopregels van gespeelde wedstrijden meteen af, ook als de stoelenkaart
  // van die wedstrijd nooit langskwam.
  const productDates = new Map<string, string>();
  const productNames = new Map<string, string>();
  for (const product of Object.values(products)) {
    productDates.set(product.productId, product.eventDate);
    productNames.set(product.productId, product.name);
  }
  const isPast = (productId: string) => {
    const date = productDates.get(productId);
    return Boolean(date && date.slice(0, 10) < cutoff);
  };

  const changed = new Set<string>();
  const removed = prunePastEvents(events, cutoff, productDates);
  const resets: string[] = [];
  const cursors = { manifests: state.manifestsCursor, sales: state.salesCursor };
  const empty: FeedResult = { rows: 0, reachedEnd: false, reset: false };

  // `allSettled` en niet `all`: faalt de ene stroom, dan moet de andere eerst
  // stoppen voordat we opslaan. Anders schrijft die nog door in `events`
  // terwijl wij al aan het wegschrijven zijn.
  const [manifestsResult, salesResult] = await Promise.allSettled([
    readFeed<ManifestFeedRow>(
      "/v1/manifests",
      cursors.manifests,
      deadline,
      (rows) => {
        for (const row of rows) {
          const eventId = applyManifestRow(events, row, cutoff);
          if (eventId) changed.add(eventId);
        }
      },
      (cursor) => (cursors.manifests = cursor)
    ),
    readFeed<SalesFeedRow>(
      "/v1/sales",
      cursors.sales,
      deadline,
      (rows) => {
        for (const row of rows) {
          const eventId = applySalesRow(events, row, isPast);
          if (eventId) changed.add(eventId);
        }
      },
      (cursor) => (cursors.sales = cursor)
    ),
  ]);
  const manifests = manifestsResult.status === "fulfilled" ? manifestsResult.value : empty;
  const sales = salesResult.status === "fulfilled" ? salesResult.value : empty;

  if (manifests.reset) {
    resets.push("manifests");
    cursors.manifests = null;
    for (const event of events.values()) {
      event.seats = {};
      changed.add(event.eventId);
    }
  }
  if (sales.reset) {
    resets.push("sales");
    cursors.sales = null;
    for (const event of events.values()) {
      event.tickets = {};
      changed.add(event.eventId);
    }
  }

  // Nette naam en datum uit de productenlijst, voor wedstrijden waar de
  // stoelenkaart ze nog niet gaf. Een dag na de wedstrijd ruimt de volgende run
  // hem op.
  for (const event of events.values()) {
    const name = productNames.get(event.eventId);
    if (name && event.name !== name) {
      event.name = name;
      changed.add(event.eventId);
    }
    if (!event.eventDate && productDates.has(event.eventId)) {
      event.eventDate = productDates.get(event.eventId) ?? null;
      changed.add(event.eventId);
    }
  }

  if (changed.size || removed.length) await writeEventSeats(events, changed, removed);

  // Pas nu de data veilig staat, mag de voortgang mee.
  state.manifestsCursor = cursors.manifests;
  state.salesCursor = cursors.sales;
  if (manifests.reset) state.manifestsComplete = false;
  else if (manifests.reachedEnd) state.manifestsComplete = true;
  if (sales.reset) state.salesComplete = false;
  else if (sales.reachedEnd) state.salesComplete = true;
  state.manifestsRead += manifests.rows;
  state.salesRead += sales.rows;
  if (manifests.reachedEnd && sales.reachedEnd) state.caughtUpAt = new Date().toISOString();

  // Een fout in één van de stromen pas melden nu het gelezen werk bewaard is.
  for (const result of [manifestsResult, salesResult]) {
    if (result.status === "rejected") throw result.reason;
  }

  return {
    manifestsRead: manifests.rows,
    salesRead: sales.rows,
    eventsChanged: changed.size,
    events: events.size,
    resets,
  };
}

export type LockedRunOutcome =
  | { ran: false; state: SeatIngestState }
  | {
      ran: true;
      state: SeatIngestState;
      result: SeatIngestResult | null;
      error: string | null;
      /**
       * Of deze run rijen heeft verwerkt, ook als één van de stromen een fout
       * gaf: dan is het werk van de andere stroom wel bewaard.
       */
      progressed: boolean;
    };

/**
 * Doet één run onder het slot en slaat de toestand op.
 *
 * Gedeeld door de cron-route en de knop "Maak lijst": die laatste haalt zo
 * vlak voor het rekenen de nieuwste mutaties op. Loopt er al een run, dan
 * gebeurt er niets (`ran: false`) — twee runs tegelijk zouden dezelfde cursor
 * lezen en elkaars bestanden overschrijven.
 */
export async function runLockedSeatIngest(budgetMs: number, force = false): Promise<LockedRunOutcome> {
  const state = await readSeatState();
  if (isSeatIngestLocked(state) && !force) return { ran: false, state };

  const deadline = Date.now() + budgetMs;
  // Slot meteen zetten, vóór het eerste leeswerk; ruim genoeg dat het opslaan
  // aan het eind er nog binnen valt.
  state.runningUntil = new Date(deadline + 60_000).toISOString();
  await writeSeatState(state);

  const readBefore = state.manifestsRead + state.salesRead;
  let result: SeatIngestResult | null = null;
  let error: string | null = null;
  try {
    result = await runSeatIngest(state, deadline);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
    console.error("[ringside/stoelen]", error);
  }

  state.runs += 1;
  state.lastError = error;
  state.runningUntil = null;
  await writeSeatState(state);
  return { ran: true, state, result, error, progressed: state.manifestsRead + state.salesRead > readBefore };
}
