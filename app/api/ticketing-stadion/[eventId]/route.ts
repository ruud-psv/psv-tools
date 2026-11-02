import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { countFreeGroups } from "@/lib/aangrenzende-stoelen/neighbors";
import { buildSeatMaps, type SeatMaps } from "@/lib/aangrenzende-stoelen/seat-map";
import { todayInAmsterdam, toNeighborInput } from "@/lib/ringside/seat-state";
import { readEventSeats, readSeatState } from "@/lib/ringside/seat-store";
import { readEventSales, readState as readSalesState } from "@/lib/ringside/store";
import {
  comparableMatches,
  compareMatch,
  daysUntil,
  freeSeatsFromMaps,
  isStadiumStand,
  salesPace,
  summarizeMatch,
} from "@/lib/ticketing-stadion/summary";

/**
 * Eén thuiswedstrijd voor Ticketing Stadion: bezetting per vak, de stoelen per
 * vak voor de plattegrond, groepjes vrije stoelen en de verkoop per dag.
 *
 * Leest één stoelenkaart en de verkoop per dag; er gaat geen verzoek naar
 * Ringside. Geen persoonsgegevens: per stoel alleen of hij vrij is.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const eventId = (await params).eventId.trim().toLowerCase();
  if (!UUID.test(eventId)) return NextResponse.json({ error: "Onbekende wedstrijd." }, { status: 400 });

  try {
    const [event, seatState, salesState, sales] = await Promise.all([
      readEventSeats(eventId),
      readSeatState(),
      readSalesState(),
      readEventSales(),
    ]);
    if (!event) {
      return NextResponse.json(
        { error: "Voor deze wedstrijd is geen stoelstatus gevonden. Is hij al gespeeld?" },
        { status: 404 }
      );
    }

    const match = summarizeMatch(event);
    const daysOut = Math.max(daysUntil(match.eventDate, todayInAmsterdam()) ?? 0, 0);

    // Alle vakken op de plattegrond, ook die Aangrenzende stoelen uitsluit.
    const { seats, tickets } = toNeighborInput(event);
    const allMaps = buildSeatMaps(seats, tickets, [], { includeExcluded: true });
    const seatMaps: SeatMaps = {};
    for (const [area, rows] of Object.entries(allMaps)) if (isStadiumStand(area)) seatMaps[area] = rows;
    const freeGroups = countFreeGroups(freeSeatsFromMaps(seatMaps));

    const own = sales[eventId];
    return NextResponse.json(
      {
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
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ticketing-stadion] wedstrijd mislukt:", message);
    return NextResponse.json({ error: `De wedstrijd kon niet worden geladen: ${message}` }, { status: 500 });
  }
}
