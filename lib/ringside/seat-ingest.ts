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

import { readFeed, type FeedResult } from "./feed";
import { readKnownProducts } from "./store";
import { isPsvHomeMatch } from "../aangrenzende-stoelen/events";
import { recordStadionSupply, refreshStadionSummary } from "../ticketing-stadion/store";
import {
  applyManifestCapacity,
  applyManifestRow,
  applySalesReservation,
  applySalesDetails,
  applySalesResold,
  applySalesVenueResale,
  applySalesRow,
  localizeStoredEventDates,
  prunePastEvents,
  todayInAmsterdam,
  type EventSeatState,
  type EventStates,
  type ManifestFeedRow,
  type SalesFeedRow,
} from "./seat-state";
import {
  archiveEventSeats,
  isSeatIngestLocked,
  readAllEventSeats,
  readSeatIndex,
  readSeatState,
  writeEventSeats,
  writeSeatState,
  type SeatIngestState,
} from "./seat-store";


export interface SeatIngestResult {
  manifestsRead: number;
  salesRead: number;
  capacityRead: number;
  reservationRead: number;
  venueResaleRead: number;
  resoldRead: number;
  detailsRead: number;
  eventsChanged: number;
  events: number;
  resets: string[];
}

interface BackfillResult {
  cursor: string | null;
  rows: number;
  reachedEnd: boolean;
  failure: unknown;
}

/**
 * Een tweede ronde door een stroom die alleen iets aanvult op wat al bekend is.
 * Slaat over als `run` onwaar is of er minder dan 30 seconden over zijn. Een
 * fout komt terug in `failure`, zodat het gelezen werk eerst bewaard wordt.
 */
async function backfill<T>(
  path: string,
  cursor: string | null,
  run: boolean,
  deadline: number,
  apply: (row: T) => string | null,
  changed: Set<string>
): Promise<BackfillResult> {
  const pass: BackfillResult = { cursor, rows: 0, reachedEnd: false, failure: null };
  if (!run || deadline - Date.now() <= 30_000) return pass;
  try {
    const result = await readFeed<T>(
      path,
      cursor,
      deadline,
      (rows) => {
        for (const row of rows) {
          const eventId = apply(row);
          if (eventId) changed.add(eventId);
        }
      },
      (next) => (pass.cursor = next)
    );
    pass.rows = result.rows;
    // Een ververste dataset pakt de gewone stroom op; daar komt alles dan mee.
    pass.reachedEnd = result.reachedEnd || result.reset;
  } catch (error) {
    pass.failure = error;
  }
  return pass;
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
  const [index, products] = await Promise.all([readSeatIndex(), readKnownProducts()]);
  const events: EventStates = await readAllEventSeats(index);

  // Wedstrijddatums uit de productenlijst van de verkoop-ingest. Daarmee vallen
  // verkoopregels van gespeelde wedstrijden meteen af, ook als de stoelenkaart
  // van die wedstrijd nooit langskwam.
  const productDates = new Map<string, string>();
  const productNames = new Map<string, string>();
  for (const product of products) {
    productDates.set(product.productId, product.eventDate);
    productNames.set(product.productId, product.name);
  }
  const isPast = (productId: string) => {
    const date = productDates.get(productId);
    return Boolean(date && date.slice(0, 10) < cutoff);
  };

  const changed = new Set<string>();
  // Tijden die nog in UTC staan, eenmalig omzetten. Vóór de nieuwe rijen: die
  // komen al omgezet binnen.
  for (const eventId of localizeStoredEventDates(events)) changed.add(eventId);
  const beforePrune = new Map(events);
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

  // Eenmalige extra rondes: capaciteit, reserveringen en resale-aankopen
  // aanvullen voor wat al bekend was. Alleen met de tijd die over is als beide
  // stromen bij zijn: actuele stoelen en tickets gaan voor. Niet in de korte run
  // van "Maak lijst" (25 seconden): die moet snel antwoord geven. Na een
  // ververste dataset leest de gewone stroom alles opnieuw, met alles erbij: dan
  // is de ronde niet meer nodig.
  const caughtUp = manifests.reachedEnd && sales.reachedEnd;
  const capacity = await backfill<ManifestFeedRow>(
    "/v1/manifests",
    state.capacityCursor,
    caughtUp && !state.capacityComplete && !manifests.reset,
    deadline,
    (row) => applyManifestCapacity(events, row),
    changed
  );
  const reservation = await backfill<SalesFeedRow>(
    "/v1/sales",
    state.reservationCursor,
    caughtUp && !state.reservationComplete && !sales.reset && !capacity.failure,
    deadline,
    (row) => applySalesReservation(events, row),
    changed
  );
  const venueResale = await backfill<SalesFeedRow>(
    "/v1/sales",
    state.venueResaleCursor,
    caughtUp && !state.venueResaleComplete && !sales.reset && !capacity.failure && !reservation.failure,
    deadline,
    (row) => applySalesVenueResale(events, row),
    changed
  );
  const resold = await backfill<SalesFeedRow>(
    "/v1/sales",
    state.resoldCursor,
    caughtUp && !state.resoldComplete && !sales.reset && !capacity.failure && !reservation.failure && !venueResale.failure,
    deadline,
    (row) => applySalesResold(events, row),
    changed
  );
  const details = await backfill<SalesFeedRow>(
    "/v1/sales",
    state.detailsCursor,
    caughtUp &&
      !state.detailsComplete &&
      !sales.reset &&
      !capacity.failure &&
      !reservation.failure &&
      !venueResale.failure &&
      !resold.failure,
    deadline,
    (row) => applySalesDetails(events, row),
    changed
  );

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
      event.resold = {};
      event.details = {};
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

  // De eindstand van gespeelde thuiswedstrijden bewaren voor de export van
  // Ticketing Stadion. Lukt dat niet, dan blijft het bestand gewoon staan.
  const archive = removed
    .map((eventId) => beforePrune.get(eventId))
    .filter((event): event is EventSeatState => event !== undefined && isPsvHomeMatch(event.name));
  const notArchived = await archiveEventSeats(archive);
  const toDelete = removed.filter((eventId) => !notArchived.has(eventId));

  if (changed.size || removed.length) await writeEventSeats(events, changed, toDelete);
  // Ticketing Stadion leest een kleine samenvatting in plaats van de stoelenkaarten.
  const summary = await refreshStadionSummary(events, changed, removed);
  if (summary) await recordStadionSupply(summary);

  // Pas nu de data veilig staat, mag de voortgang mee.
  state.manifestsCursor = cursors.manifests;
  state.salesCursor = cursors.sales;
  if (manifests.reset) state.manifestsComplete = false;
  else if (manifests.reachedEnd) state.manifestsComplete = true;
  if (sales.reset) state.salesComplete = false;
  else if (sales.reachedEnd) state.salesComplete = true;
  state.manifestsRead += manifests.rows;
  state.salesRead += sales.rows;
  state.capacityCursor = capacity.cursor;
  state.capacityRead += capacity.rows;
  if (capacity.reachedEnd || manifests.reset) state.capacityComplete = true;
  state.reservationCursor = reservation.cursor;
  state.reservationRead += reservation.rows;
  if (reservation.reachedEnd || sales.reset) state.reservationComplete = true;
  state.venueResaleCursor = venueResale.cursor;
  state.venueResaleRead += venueResale.rows;
  if (venueResale.reachedEnd || sales.reset) state.venueResaleComplete = true;
  state.resoldCursor = resold.cursor;
  state.resoldRead += resold.rows;
  if (resold.reachedEnd || sales.reset) state.resoldComplete = true;
  state.detailsCursor = details.cursor;
  state.detailsRead += details.rows;
  if (details.reachedEnd || sales.reset) state.detailsComplete = true;
  if (manifests.reachedEnd && sales.reachedEnd) state.caughtUpAt = new Date().toISOString();

  // Een fout in één van de stromen pas melden nu het gelezen werk bewaard is.
  for (const result of [manifestsResult, salesResult]) {
    if (result.status === "rejected") throw result.reason;
  }
  for (const pass of [capacity, reservation, venueResale, resold, details]) {
    if (pass.failure) throw pass.failure;
  }

  return {
    manifestsRead: manifests.rows,
    salesRead: sales.rows,
    capacityRead: capacity.rows,
    reservationRead: reservation.rows,
    venueResaleRead: venueResale.rows,
    resoldRead: resold.rows,
    detailsRead: details.rows,
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

  const readBefore = state.manifestsRead + state.salesRead + state.capacityRead + state.reservationRead + state.venueResaleRead + state.resoldRead + state.detailsRead;
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
  const readAfter = state.manifestsRead + state.salesRead + state.capacityRead + state.reservationRead + state.venueResaleRead + state.resoldRead + state.detailsRead;
  return { ran: true, state, result, error, progressed: readAfter > readBefore };
}

export type CatchUp = "bijgewerkt" | "overgeslagen" | "mislukt";

/**
 * Korte inhaalslag vóór het tonen van data, voor de knoppen "Maak lijst" en
 * "Toon bezetting". Gooit nooit: lukt het bijwerken niet — Ringside traag of
 * onbereikbaar, of een fout bij het opslaan — dan rekent de pagina met de
 * stoelstatus die er al lag, en zegt dat via `catchUp`.
 */
export async function catchUpSeatIngest(
  budgetMs: number
): Promise<{ catchUp: CatchUp; state: SeatIngestState | null }> {
  try {
    const outcome = await runLockedSeatIngest(budgetMs);
    if (!outcome.ran) return { catchUp: "overgeslagen", state: outcome.state };
    return { catchUp: outcome.error ? "mislukt" : "bijgewerkt", state: outcome.state };
  } catch (error) {
    console.error("[ringside/stoelen] inhaalslag mislukt:", error instanceof Error ? error.message : error);
    return { catchUp: "mislukt", state: null };
  }
}
