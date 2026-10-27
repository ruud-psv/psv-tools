/**
 * Opslag van de stoelstatus in Vercel Blob.
 *
 * Per wedstrijd één bestand, gecomprimeerd: een stoelenkaart van het Philips
 * Stadion is ruim 35.000 stoelen plus evenveel tickets, en als JSON een paar
 * megabyte. Gzip maakt daar een fractie van. Een run schrijft alleen de
 * wedstrijden terug die veranderd zijn.
 *
 * Naast de bestanden per wedstrijd:
 *
 * - **de toestand van de ingest**: cursors, voortgang en het slot;
 * - **een index**: welke wedstrijden er zijn, met tellingen, zodat het overzicht
 *   niet elk groot bestand hoeft te openen.
 */

import { gunzipSync, gzipSync } from "node:zlib";
import { get, put, del } from "@vercel/blob";
import { summarizeEvent, type EventSeatState, type EventStates } from "./seat-state";

const PREFIX = "ringside/stoelen";
const STATE_PATH = `${PREFIX}/state.json`;
const INDEX_PATH = `${PREFIX}/index.json`;

function eventPath(eventId: string): string {
  return `${PREFIX}/events/${eventId}.json.gz`;
}

export interface SeatIngestState {
  /** Waar de volgende run verdergaat; `null` is het begin van de stroom. */
  manifestsCursor: string | null;
  salesCursor: string | null;
  /** `true` zodra de stroom één keer tot het eind gelezen is. */
  manifestsComplete: boolean;
  salesComplete: boolean;
  manifestsRead: number;
  salesRead: number;
  runs: number;
  updatedAt: string;
  lastError: string | null;
  /** Slot tegen twee runs tegelijk; zie `isSeatIngestLocked()`. */
  runningUntil: string | null;
  /**
   * Tweede ronde door `/v1/manifests` om de capaciteit aan te vullen, die eerst
   * niet bewaard werd (nodig voor staanvakken). Eenmalig: daarna houdt de
   * gewone stroom hem bij. Zie `applyManifestCapacity()`.
   */
  capacityCursor: string | null;
  capacityComplete: boolean;
  capacityRead: number;
  /**
   * Net zo een tweede ronde door `/v1/sales`, om aan te vullen welke tickets een
   * openstaande reservering zijn. Zie `applySalesReservation()`.
   */
  reservationCursor: string | null;
  reservationComplete: boolean;
  reservationRead: number;
  /**
   * Wanneer beide stromen voor het laatst tot het eind gelezen zijn. Zo actueel
   * is de stoelstatus: Ringside zelf loopt meestal minder dan een minuut achter.
   */
  caughtUpAt: string | null;
}

export const EMPTY_SEAT_STATE: SeatIngestState = {
  manifestsCursor: null,
  salesCursor: null,
  manifestsComplete: false,
  salesComplete: false,
  manifestsRead: 0,
  salesRead: 0,
  runs: 0,
  updatedAt: "",
  lastError: null,
  runningUntil: null,
  caughtUpAt: null,
  capacityCursor: null,
  capacityComplete: false,
  capacityRead: 0,
  reservationCursor: null,
  reservationComplete: false,
  reservationRead: 0,
};

export interface SeatIndexEntry {
  eventId: string;
  name: string | null;
  eventDate: string | null;
  seats: number;
  sellable: number;
  tickets: number;
  updatedAt: string;
}

export type SeatIndex = Record<string, SeatIndexEntry>;

/**
 * Of er een andere run bezig is. Twee runs tegelijk lezen dezelfde cursor en
 * schrijven daarna elkaars bestanden over. Een verlopen slot telt niet, zodat
 * een gecrashte run niets blokkeert.
 */
export function isSeatIngestLocked(state: SeatIngestState, now = Date.now()): boolean {
  if (!state.runningUntil) return false;
  const until = new Date(state.runningUntil).getTime();
  return Number.isFinite(until) && until > now;
}

async function readBytes(path: string): Promise<Buffer | null> {
  const result = await get(path, { access: "private", useCache: false });
  if (!result || !result.stream) return null;
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

async function readJson<T>(path: string): Promise<T | null> {
  const bytes = await readBytes(path);
  if (!bytes) return null;
  try {
    return JSON.parse(bytes.toString("utf8")) as T;
  } catch {
    console.error(`[ringside/stoelen] ${path} niet te lezen.`);
    return null;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await put(path, JSON.stringify(value), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function readSeatState(): Promise<SeatIngestState> {
  const state = await readJson<SeatIngestState>(STATE_PATH);
  return state ? { ...EMPTY_SEAT_STATE, ...state } : { ...EMPTY_SEAT_STATE };
}

export async function writeSeatState(state: SeatIngestState): Promise<void> {
  await writeJson(STATE_PATH, { ...state, updatedAt: new Date().toISOString() });
}

export async function readSeatIndex(): Promise<SeatIndex> {
  return (await readJson<SeatIndex>(INDEX_PATH)) ?? {};
}

export async function readEventSeats(eventId: string): Promise<EventSeatState | null> {
  const bytes = await readBytes(eventPath(eventId));
  if (!bytes) return null;
  try {
    return JSON.parse(gunzipSync(bytes).toString("utf8")) as EventSeatState;
  } catch {
    console.error(`[ringside/stoelen] stoelstatus van ${eventId} niet te lezen.`);
    return null;
  }
}

/** Laadt alle wedstrijden uit de index. */
export async function readAllEventSeats(index: SeatIndex): Promise<EventStates> {
  const events: EventStates = new Map();
  const loaded = await Promise.all(Object.keys(index).map((eventId) => readEventSeats(eventId)));
  for (const event of loaded) if (event) events.set(event.eventId, event);
  return events;
}

/**
 * Schrijft de gewijzigde wedstrijden en een nieuwe index.
 *
 * `removed` zijn wedstrijden die voorbij zijn; hun bestand wordt opgeruimd.
 */
export async function writeEventSeats(
  events: EventStates,
  changed: Set<string>,
  removed: string[]
): Promise<SeatIndex> {
  const now = new Date().toISOString();
  const previous = await readSeatIndex();

  await Promise.all(
    [...changed]
      .filter((eventId) => events.has(eventId))
      .map((eventId) =>
        put(eventPath(eventId), gzipSync(JSON.stringify(events.get(eventId))), {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "application/gzip",
        })
      )
  );

  if (removed.length) {
    await del(removed.map(eventPath)).catch((error) =>
      console.error("[ringside/stoelen] opruimen mislukt:", error instanceof Error ? error.message : error)
    );
  }

  const index: SeatIndex = {};
  for (const [eventId, event] of events) {
    index[eventId] = {
      eventId,
      name: event.name,
      eventDate: event.eventDate,
      ...summarizeEvent(event),
      updatedAt: changed.has(eventId) ? now : previous[eventId]?.updatedAt ?? now,
    };
  }
  await writeJson(INDEX_PATH, index);
  return index;
}
