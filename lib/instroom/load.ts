/**
 * Het laden van de instroom voor de pagina: hoe ver het inlezen is, en wat er
 * af te spelen valt. Leest alleen uit de eigen opslag; er gaat geen verzoek
 * naar Ringside.
 */

import { isPsvHomeMatch } from "../aangrenzende-stoelen/events";
import { todayInAmsterdam } from "../ringside/seat-state";
import { readEventSeats, readSeatIndex } from "../ringside/seat-store";
import { readKnownProducts } from "../ringside/store";
import { isStadiumStand } from "../ticketing-stadion/summary";
import { INSTROOM_SEASON, playedHomeMatches } from "./match";
import { layoutFromSeatState } from "./layout";
import { buildReplay, EMPTY_LAYOUT, eventDateToMs, type Replay, type StadiumLayout } from "./replay";
import { isInstroomLocked, readInstroomData, readInstroomState } from "./store";

/**
 * De stoelenkaart van het Philips Stadion. De stoelstatus bewaart alleen
 * komende wedstrijden, dus die van de eerstvolgende thuiswedstrijd van PSV 1:
 * dezelfde stoelen, alleen de blokkades kunnen anders zijn.
 */
async function loadStadiumLayout(): Promise<StadiumLayout> {
  const today = todayInAmsterdam();
  const upcoming = Object.values(await readSeatIndex())
    .filter((entry) => isPsvHomeMatch(entry.name) && entry.seats > 0 && (entry.eventDate ?? "").slice(0, 10) >= today)
    .sort((a, b) => (a.eventDate ?? "").localeCompare(b.eventDate ?? ""));

  for (const entry of upcoming.slice(0, 3)) {
    const event = await readEventSeats(entry.eventId);
    if (event && Object.keys(event.seats).length) return layoutFromSeatState(event);
  }
  return EMPTY_LAYOUT;
}

export interface InstroomMatchOption {
  productId: string;
  name: string;
  eventDate: string;
}

export interface InstroomStatus {
  /** De wedstrijd die is of wordt ingelezen; `null` als er nog geen gekozen is. */
  match: { productId: string; name: string; eventDate: string | null } | null;
  /** Waaruit je kunt kiezen: de gespeelde thuiswedstrijden van dit seizoen. */
  matches: InstroomMatchOption[];
  season: string;
  /** Hoeveel producten er uit Ringside bekend zijn; 0 als die lijst er nog niet is. */
  known: number;
  started: boolean;
  running: boolean;
  complete: boolean;
  salesComplete: boolean;
  attendanceComplete: boolean;
  salesRead: number;
  attendanceRead: number;
  tickets: number;
  scans: number;
  updatedAt: string | null;
  lastError: string | null;
}

/** Alleen hoe ver het inlezen is en waaruit je kunt kiezen; opent de data van de wedstrijd niet. */
export async function loadInstroomStatus(): Promise<InstroomStatus> {
  const [state, products] = await Promise.all([readInstroomState(), readKnownProducts()]);

  return {
    match: state.productId
      ? { productId: state.productId, name: state.name ?? "Onbekende wedstrijd", eventDate: state.eventDate }
      : null,
    matches: playedHomeMatches(products, todayInAmsterdam()).map(({ productId, name, eventDate }) => ({
      productId,
      name,
      eventDate,
    })),
    season: INSTROOM_SEASON,
    known: products.length,
    started: Boolean(state.productId),
    running: isInstroomLocked(state),
    complete: state.salesComplete && state.attendanceComplete,
    salesComplete: state.salesComplete,
    attendanceComplete: state.attendanceComplete,
    salesRead: state.salesRead,
    attendanceRead: state.attendanceRead,
    tickets: state.tickets,
    scans: state.scans,
    updatedAt: state.updatedAt || null,
    lastError: state.lastError,
  };
}

export async function loadInstroom(): Promise<{ status: InstroomStatus; replay: Replay | null }> {
  const status = await loadInstroomStatus();
  const match = status.match;
  if (!status.started || !match) return { status, replay: null };

  const [data, layout] = await Promise.all([readInstroomData(match.productId), loadStadiumLayout()]);
  const replay = buildReplay({
    match: { productId: match.productId, name: match.name, kickoffMs: eventDateToMs(match.eventDate) },
    layout,
    data,
    isStand: isStadiumStand,
  });
  return { status, replay };
}

export type InstroomPayload = Awaited<ReturnType<typeof loadInstroom>>;
