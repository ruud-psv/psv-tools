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
 *   niet elk groot bestand hoeft te openen;
 * - **een archief**: de eindstand van gespeelde thuiswedstrijden van PSV 1,
 *   voor de export van Ticketing Stadion. Zie `archiveEventSeats()`.
 */

import { gunzipSync, gzipSync } from "node:zlib";
import { put, del } from "@vercel/blob";
import { readPrivateBlob } from "../blob/read";
import { summarizeEvent, type EventSeatState, type EventStates } from "./seat-state";

const PREFIX = "ringside/stoelen";
const STATE_PATH = `${PREFIX}/state.json`;
const INDEX_PATH = `${PREFIX}/index.json`;
const ARCHIVE_INDEX_PATH = `${PREFIX}/archief/index.json`;

function eventPath(eventId: string): string {
  return `${PREFIX}/events/${eventId}.json.gz`;
}

function archivePath(eventId: string): string {
  return `${PREFIX}/archief/${eventId}.json.gz`;
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
   * En een derde ronde door `/v1/sales`, om aan te vullen welke tickets via de
   * resale gekocht zijn (`is_venue_resale`). Zie `applySalesVenueResale()`.
   */
  venueResaleCursor: string | null;
  venueResaleComplete: boolean;
  venueResaleRead: number;
  /**
   * En een vierde ronde door `/v1/sales`, voor de tickets die in de resale
   * doorverkocht zijn (`Resold - Refunded`). Zie `applySalesResold()`.
   */
  resoldCursor: string | null;
  resoldComplete: boolean;
  resoldRead: number;
  /**
   * En een vijfde ronde, voor de ruwe `sale_type` en `resale_status` van elk
   * ticket (de status in de export). Zie `applySalesDetails()`.
   */
  detailsCursor: string | null;
  detailsComplete: boolean;
  detailsRead: number;
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
  venueResaleCursor: null,
  venueResaleComplete: false,
  venueResaleRead: 0,
  resoldCursor: null,
  resoldComplete: false,
  resoldRead: 0,
  detailsCursor: null,
  detailsComplete: false,
  detailsRead: 0,
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

async function readJson<T>(path: string): Promise<T | null> {
  const bytes = await readPrivateBlob(path);
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
  const bytes = await readPrivateBlob(eventPath(eventId));
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

/* ---------- Archief ---------- */

export interface SeatArchiveEntry {
  eventId: string;
  name: string | null;
  eventDate: string | null;
  archivedAt: string;
}

export type SeatArchiveIndex = Record<string, SeatArchiveEntry>;

/** Welke gespeelde wedstrijden een eindstand in het archief hebben. */
export async function readSeatArchiveIndex(): Promise<SeatArchiveIndex> {
  return (await readJson<SeatArchiveIndex>(ARCHIVE_INDEX_PATH)) ?? {};
}

/** De eindstand van een gespeelde wedstrijd, of `null` als die niet bewaard is. */
export async function readArchivedEventSeats(eventId: string): Promise<EventSeatState | null> {
  const bytes = await readPrivateBlob(archivePath(eventId));
  if (!bytes) return null;
  try {
    return JSON.parse(gunzipSync(bytes).toString("utf8")) as EventSeatState;
  } catch {
    console.error(`[ringside/stoelen] eindstand van ${eventId} niet te lezen.`);
    return null;
  }
}

/** De stoelstatus van een komende wedstrijd, of anders de eindstand uit het archief. */
export async function readEventSeatsOrArchive(eventId: string): Promise<EventSeatState | null> {
  return (await readEventSeats(eventId)) ?? (await readArchivedEventSeats(eventId));
}

/**
 * Bewaart de eindstand van wedstrijden die voorbij zijn, vóórdat
 * `writeEventSeats()` hun bestand opruimt. Na de wedstrijddag komt er niets
 * meer bij (de ingest slaat regels van gespeelde wedstrijden over), dus de
 * laatste stand is de eindstand.
 *
 * Geeft de wedstrijden terug waarvan het bewaren mislukte. Hun bestand moet
 * blijven staan: dan vindt `readEventSeatsOrArchive()` het daar nog.
 */
export async function archiveEventSeats(events: EventSeatState[]): Promise<Set<string>> {
  const failed = new Set<string>();
  if (events.length === 0) return failed;

  // Een eindstand wordt één keer bewaard. Duikt een gespeelde wedstrijd toch
  // weer op (een losse regel uit de stroom), dan overschrijft die halve stand
  // de echte eindstand niet.
  let existing: SeatArchiveIndex;
  try {
    existing = await readSeatArchiveIndex();
  } catch (error) {
    console.error("[ringside/stoelen] archief-index niet te lezen:", error instanceof Error ? error.message : error);
    for (const event of events) failed.add(event.eventId);
    return failed;
  }
  const pending = events.filter((event) => !existing[event.eventId]);

  const results = await Promise.allSettled(
    pending.map((event) =>
      put(archivePath(event.eventId), gzipSync(JSON.stringify(event)), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/gzip",
      })
    )
  );
  const now = new Date().toISOString();
  const added: SeatArchiveIndex = {};
  results.forEach((result, i) => {
    const event = pending[i];
    if (result.status === "fulfilled") {
      added[event.eventId] = { eventId: event.eventId, name: event.name, eventDate: event.eventDate, archivedAt: now };
    } else {
      failed.add(event.eventId);
      console.error(
        `[ringside/stoelen] eindstand van ${event.eventId} bewaren mislukt:`,
        result.reason instanceof Error ? result.reason.message : result.reason
      );
    }
  });

  if (Object.keys(added).length) {
    try {
      await writeJson(ARCHIVE_INDEX_PATH, { ...existing, ...added });
    } catch (error) {
      // Het bestand zelf staat er; alleen de knop in het overzicht ontbreekt dan.
      console.error("[ringside/stoelen] archief-index bijwerken mislukt:", error instanceof Error ? error.message : error);
    }
  }
  return failed;
}
