import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { CATCH_UP_SECONDS } from "@/lib/aangrenzende-stoelen/settings";
import { isRingsideConfigured } from "@/lib/ringside/auth";
import { runLockedSeatIngest } from "@/lib/ringside/seat-ingest";
import { readEventSeats, readSeatState } from "@/lib/ringside/seat-store";
import { occupancyByArea } from "@/lib/ticketing-herdgang/occupancy";

/**
 * Bezetting per vak van één wedstrijd. Haalt eerst de nieuwste mutaties uit
 * Ringside op, net als "Maak lijst" bij Aangrenzende stoelen. Geen
 * persoonsgegevens: alleen aantallen per vak.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  try {
    const body = (await req.json().catch(() => ({}))) as { eventId?: unknown };
    const eventId = typeof body.eventId === "string" ? body.eventId.trim().toLowerCase() : "";
    if (!UUID.test(eventId)) return NextResponse.json({ error: "Kies een wedstrijd." }, { status: 400 });

    const before = await readSeatState();
    if (!before.manifestsComplete || !before.salesComplete) {
      return NextResponse.json(
        { error: "De stoelstatus wordt nog voor het eerst uit Ringside ingelezen. Probeer het later opnieuw." },
        { status: 409 }
      );
    }

    let catchUp: "bijgewerkt" | "overgeslagen" | "mislukt" = "overgeslagen";
    let state = before;
    if (isRingsideConfigured()) {
      const outcome = await runLockedSeatIngest(CATCH_UP_SECONDS * 1000);
      state = outcome.state;
      if (outcome.ran) catchUp = outcome.error ? "mislukt" : "bijgewerkt";
    }

    const event = await readEventSeats(eventId);
    if (!event) return NextResponse.json({ error: "Voor deze wedstrijd is geen stoelstatus gevonden." }, { status: 404 });

    return NextResponse.json(
      {
        event: { eventId: event.eventId, name: event.name, eventDate: event.eventDate },
        ...occupancyByArea(event),
        capacityComplete: state.capacityComplete,
        dataAsOf: state.caughtUpAt,
        catchUp,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ticketing-herdgang] bezetting mislukt:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
