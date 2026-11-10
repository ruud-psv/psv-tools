/**
 * Het laden van de data van Ticketing Stadion: het overzicht en één
 * wedstrijd. Gedeeld door de pagina's, de openbare deellink en de chat, zodat
 * die allemaal precies dezelfde cijfers zien.
 *
 * Leest alleen wat de crons al hebben klaargezet; er gaat geen verzoek naar
 * Ringside. Geen persoonsgegevens: alleen aantallen en per stoel of hij vrij is.
 */

import { countFreeGroups } from "../aangrenzende-stoelen/neighbors";
import { buildSeatMaps, type SeatMaps } from "../aangrenzende-stoelen/seat-map";
import { todayInAmsterdam, toNeighborInput } from "../ringside/seat-state";
import { isSeatIngestLocked, readEventSeats, readSeatIndex, readSeatState } from "../ringside/seat-store";
import { readMatchSales, readState as readSalesState, type EventSales } from "../ringside/store";
import { buildStadionSummaryFromIndex, readStadionSummary } from "./store";
import {
  comparableMatches,
  compareMatch,
  daysUntil,
  freeSeatsFromMaps,
  isHomeMatchSales,
  isStadiumStand,
  salesPace,
  summarizeMatch,
} from "./summary";

export const EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function loadStadionOverview() {
  const [seatState, salesState, sales, stored] = await Promise.all([
    readSeatState(),
    readSalesState(),
    readMatchSales(),
    readStadionSummary(),
  ]);
  const summary = stored ?? (await buildStadionSummaryFromIndex(await readSeatIndex()));
  const today = todayInAmsterdam();

  const matches = Object.values(summary.matches)
    .map((match) => ({ match, daysOut: daysUntil(match.eventDate, today) }))
    .filter((entry): entry is { match: typeof entry.match; daysOut: number } => entry.daysOut !== null && entry.daysOut >= 0)
    .sort((a, b) => (a.match.eventDate ?? "").localeCompare(b.match.eventDate ?? ""))
    .map(({ match, daysOut }) => {
      const own = sales[match.eventId];
      return {
        eventId: match.eventId,
        name: match.name,
        eventDate: match.eventDate,
        daysOut,
        total: match.total,
        otherTotal: match.otherTotal,
        areas: match.areas,
        pace: own ? salesPace(own.perOffset, daysOut) : null,
        comparison: compareMatch(match, daysOut, sales),
      };
    });

  return {
    matches,
    summaryAt: summary.generatedAt,
    seats: {
      ready: seatState.manifestsComplete && seatState.salesComplete,
      capacityComplete: seatState.capacityComplete,
      reservationComplete: seatState.reservationComplete,
      caughtUpAt: seatState.caughtUpAt,
      running: isSeatIngestLocked(seatState),
      lastError: seatState.lastError,
    },
    sales: {
      complete: salesState.salesComplete,
      updatedAt: salesState.updatedAt || null,
      lastError: salesState.lastError,
    },
  };
}

export type StadionOverview = Awaited<ReturnType<typeof loadStadionOverview>>;

/** Eén wedstrijd, of `null` als er geen stoelstatus van is (gespeeld, of onbekend). */
export async function loadStadionMatch(eventId: string) {
  const [event, seatState, salesState, sales] = await Promise.all([
    readEventSeats(eventId),
    readSeatState(),
    readSalesState(),
    readMatchSales(),
  ]);
  if (!event) return null;

  const match = summarizeMatch(event);
  const daysOut = Math.max(daysUntil(match.eventDate, todayInAmsterdam()) ?? 0, 0);

  // Alle vakken op de plattegrond, ook die Aangrenzende stoelen uitsluit.
  const { seats, tickets } = toNeighborInput(event);
  const allMaps = buildSeatMaps(seats, tickets, [], { includeExcluded: true });
  const seatMaps: SeatMaps = {};
  for (const [area, rows] of Object.entries(allMaps)) if (isStadiumStand(area)) seatMaps[area] = rows;
  const freeGroups = countFreeGroups(freeSeatsFromMaps(seatMaps));

  const own = sales[eventId];
  return {
    match: { ...match, daysOut },
    seatMaps,
    freeGroups,
    sales: own ? { perOffset: own.perOffset, total: own.total, season: own.season } : null,
    pace: own ? salesPace(own.perOffset, daysOut) : null,
    comparison: compareMatch(match, daysOut, sales),
    comparable: comparableMatches(sales, eventId, match.eventDate ?? own?.eventDate ?? ""),
    seats: {
      capacityComplete: seatState.capacityComplete,
      reservationComplete: seatState.reservationComplete,
      caughtUpAt: seatState.caughtUpAt,
    },
    salesStatus: { complete: salesState.salesComplete, updatedAt: salesState.updatedAt || null },
  };
}

export type StadionMatchData = NonNullable<Awaited<ReturnType<typeof loadStadionMatch>>>;

/** Meer dan drie lijnen naast elkaar wordt onleesbaar. */
export const MAX_COMPARISONS = 3;

/** De verkoop per dag van een paar eerdere thuiswedstrijden, om naast een wedstrijd te leggen. */
export function pickSalesSeries(sales: Record<string, EventSales>, ids: string[]) {
  return ids
    .slice(0, MAX_COMPARISONS)
    .map((id) => sales[id])
    .filter((event): event is EventSales => Boolean(event) && isHomeMatchSales(event))
    .map(({ productId, name, eventDate, season, perOffset, total }) => ({
      productId,
      name,
      eventDate,
      season,
      perOffset,
      total,
    }));
}

/** `?ids=a,b,c` → opgeschoonde ids. */
export function parseIds(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, MAX_COMPARISONS);
}
