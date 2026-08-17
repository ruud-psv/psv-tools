import { put, get } from "@vercel/blob";
import type { AggregatedEvent } from "@/lib/ticket-sales-aggregate";

/**
 * Historische verkoopcijfers per wedstrijd, opgeslagen als **één** blob op
 * `ticket-history/historical-sales.json`.
 *
 * Eén bestand in plaats van één per wedstrijd: een upload is daarmee 1 read +
 * 1 write, en de dropdown en de grafiek lezen samen één blob in plaats van
 * tientallen — zelfde afweging als de maandledgers in `lib/fandesk-store.ts`.
 * De ruwe transactieregels komen hier nooit terecht; alleen aantallen per dag.
 */

const PATH = "ticket-history/historical-sales.json";

/** Wat er van een upload per seizoen wordt onthouden, puur ter verantwoording. */
export interface SeasonMeta {
  uploadedAt: string;
  rowsRead: number;
  rowsSkipped: number;
  eventCount: number;
}

/** Eén wedstrijd met de volledige dagreeks. */
export interface StoredEvent {
  id: string;
  name: string;
  /** `YYYY-MM-DDTHH:mm`, lokale tijd zoals in de export. */
  date: string;
  season: string;
  opponent: string;
  totalTickets: number;
  totalOrders: number;
  /**
   * Dagen-tot-event van de eerste verkoopdag; index 0 van `tickets`. Verder in
   * de array loopt de offset met 1 per stap terug (dus richting de eventdag).
   * Positief = vóór het event, negatief = erna.
   */
  firstOffset: number;
  /** Dicht: een 0 betekent "die dag niets verkocht", geen ontbrekende meting. */
  tickets: number[];
  orders: number[];
}

export interface HistoricalDataset {
  updatedAt: string;
  seasons: Record<string, SeasonMeta>;
  events: Record<string, StoredEvent>;
}

/** Wat de dropdown nodig heeft: alles behalve de dagreeksen. */
export interface HistoricalEventIndex {
  id: string;
  name: string;
  date: string;
  season: string;
  opponent: string;
  totalTickets: number;
  firstOffset: number;
  lastOffset: number;
}

export const EMPTY_DATASET: HistoricalDataset = {
  updatedAt: "",
  seasons: {},
  events: {},
};

function isStoredEvent(value: unknown): value is StoredEvent {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.name === "string" &&
    typeof e.date === "string" &&
    typeof e.season === "string" &&
    typeof e.firstOffset === "number" &&
    Array.isArray(e.tickets) &&
    e.tickets.every((t) => typeof t === "number")
  );
}

export async function readDataset(): Promise<HistoricalDataset> {
  const result = await get(PATH, { access: "private", useCache: false });
  if (!result || !result.stream) return EMPTY_DATASET;
  try {
    const parsed = JSON.parse(await new Response(result.stream).text()) as HistoricalDataset;
    if (!parsed || typeof parsed !== "object" || !parsed.events) return EMPTY_DATASET;
    // Alleen valide events overhouden: een half geschreven bestand mag de
    // grafiek niet onderuit halen.
    const events: Record<string, StoredEvent> = {};
    for (const [id, event] of Object.entries(parsed.events)) {
      if (isStoredEvent(event)) events[id] = event;
    }
    return {
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      seasons: parsed.seasons && typeof parsed.seasons === "object" ? parsed.seasons : {},
      events,
    };
  } catch {
    console.error("[historical-sales] dataset niet te lezen.");
    return EMPTY_DATASET;
  }
}

async function writeDataset(dataset: HistoricalDataset): Promise<void> {
  await put(PATH, JSON.stringify(dataset), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/**
 * Zet de events van één seizoen in de dataset en laat andere seizoenen staan.
 * Bestaande events van hetzelfde seizoen worden **vervangen**, niet aangevuld,
 * zodat een tweede upload van hetzelfde bestand niet dubbeltelt.
 */
export async function replaceSeason(
  season: string,
  events: AggregatedEvent[],
  meta: Omit<SeasonMeta, "uploadedAt" | "eventCount">
): Promise<{ eventCount: number; replaced: number }> {
  const dataset = await readDataset();

  const kept: Record<string, StoredEvent> = {};
  let replaced = 0;
  for (const [id, event] of Object.entries(dataset.events)) {
    if (event.season === season) replaced++;
    else kept[id] = event;
  }

  for (const event of events) {
    kept[event.id] = {
      id: event.id,
      name: event.name,
      date: event.date,
      season: event.season,
      opponent: event.opponent,
      totalTickets: event.totalTickets,
      totalOrders: event.totalOrders,
      firstOffset: event.firstOffset,
      tickets: event.tickets,
      orders: event.orders,
    };
  }

  const now = new Date().toISOString();
  await writeDataset({
    updatedAt: now,
    seasons: {
      ...dataset.seasons,
      [season]: { ...meta, uploadedAt: now, eventCount: events.length },
    },
    events: kept,
  });

  return { eventCount: events.length, replaced };
}

/** Haalt een seizoen weg — de weg terug na een verkeerde upload. */
export async function removeSeason(season: string): Promise<{ removed: number }> {
  const dataset = await readDataset();
  const events: Record<string, StoredEvent> = {};
  let removed = 0;
  for (const [id, event] of Object.entries(dataset.events)) {
    if (event.season === season) removed++;
    else events[id] = event;
  }
  if (removed === 0 && !dataset.seasons[season]) return { removed: 0 };

  const seasons = { ...dataset.seasons };
  delete seasons[season];
  await writeDataset({ updatedAt: new Date().toISOString(), seasons, events });
  return { removed };
}

export function lastOffsetOf(event: StoredEvent): number {
  return event.firstOffset - (event.tickets.length - 1);
}

/** Indexvorm voor de dropdown: nieuwste wedstrijd eerst. */
export function toIndex(dataset: HistoricalDataset): HistoricalEventIndex[] {
  return Object.values(dataset.events)
    .map((event) => ({
      id: event.id,
      name: event.name,
      date: event.date,
      season: event.season,
      opponent: event.opponent,
      totalTickets: event.totalTickets,
      firstOffset: event.firstOffset,
      lastOffset: lastOffsetOf(event),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Tickets per dagen-tot-event. Buiten het verkoopvenster staat er bewust geen
 * sleutel: in de grafiek is dat het verschil tussen "niemand kocht die dag" en
 * "stond toen niet in de verkoop".
 */
export function toOffsetMap(event: StoredEvent): Map<number, number> {
  const map = new Map<number, number>();
  for (let i = 0; i < event.tickets.length; i++) {
    map.set(event.firstOffset - i, event.tickets[i]);
  }
  return map;
}
