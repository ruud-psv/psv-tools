import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { todayInAmsterdam } from "@/lib/ringside/seat-state";
import { isSeatIngestLocked, readSeatIndex, readSeatState } from "@/lib/ringside/seat-store";
import { readEventSales, readState as readSalesState } from "@/lib/ringside/store";
import { buildStadionSummaryFromIndex, readStadionSummary } from "@/lib/ticketing-stadion/store";
import { compareMatch, daysUntil, salesPace } from "@/lib/ticketing-stadion/summary";

/**
 * Overzicht voor Ticketing Stadion: de komende thuiswedstrijden van PSV 1 met
 * bezetting, tempo en een vergelijking met eerdere thuiswedstrijden.
 *
 * Leest alleen wat de crons al hebben klaargezet; er gaat geen verzoek naar
 * Ringside. Geen persoonsgegevens: alleen aantallen.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  try {
    const [seatState, salesState, sales, stored] = await Promise.all([
      readSeatState(),
      readSalesState(),
      readEventSales(),
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

    return NextResponse.json(
      {
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
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ticketing-stadion] overzicht mislukt:", message);
    return NextResponse.json({ error: `Het overzicht kon niet worden geladen: ${message}` }, { status: 500 });
  }
}
