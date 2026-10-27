import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { isSeatIngestLocked, readSeatIndex, readSeatState } from "@/lib/ringside/seat-store";
import { todayInAmsterdam } from "@/lib/ringside/seat-state";

/**
 * Overzicht voor de pagina Ticketing Herdgang: welke komende wedstrijden er
 * zijn en hoe ver de stoelstatus uit Ringside is. Dezelfde stoelstatus als
 * Aangrenzende stoelen; de keuze voor De Herdgang maakt de pagina.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  try {
    const [state, index] = await Promise.all([readSeatState(), readSeatIndex()]);
    const today = todayInAmsterdam();

    const events = Object.values(index)
      .filter((event) => event.eventDate && event.eventDate.slice(0, 10) >= today && event.seats > 0)
      .sort((a, b) => (a.eventDate ?? "").localeCompare(b.eventDate ?? ""));

    return NextResponse.json(
      {
        ingest: {
          manifestsComplete: state.manifestsComplete,
          salesComplete: state.salesComplete,
          capacityComplete: state.capacityComplete,
          caughtUpAt: state.caughtUpAt,
          running: isSeatIngestLocked(state),
          lastError: state.lastError,
        },
        events,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
