import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { findNeighbors, toCsv } from "@/lib/aangrenzende-stoelen/neighbors";
import { CATCH_UP_SECONDS, INCLUDE_SEAT_COLUMNS } from "@/lib/aangrenzende-stoelen/settings";
import { readHolderList } from "@/lib/aangrenzende-stoelen/store";
import { isRingsideConfigured } from "@/lib/ringside/auth";
import { runLockedSeatIngest } from "@/lib/ringside/seat-ingest";
import { toNeighborInput } from "@/lib/ringside/seat-state";
import { readEventSeats, readSeatState } from "@/lib/ringside/seat-store";

/**
 * Maakt de lijst: welke seizoenkaarthouders zitten naast een vrije stoel.
 *
 * Eerst worden de nieuwste mutaties uit Ringside opgehaald, zodat de lijst zo
 * actueel is als Ringside zelf (meestal minder dan een minuut). Loopt er op dat
 * moment al een run, dan rekenen we met de stand van die vorige run en zeggen
 * we dat erbij.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const body = (await req.json().catch(() => ({}))) as { eventId?: unknown; maxSeatsPerRelation?: unknown };
  const eventId = typeof body.eventId === "string" ? body.eventId.trim().toLowerCase() : "";
  if (!UUID.test(eventId)) {
    return NextResponse.json({ error: "Kies een wedstrijd." }, { status: 400 });
  }
  const rawMax = Number(body.maxSeatsPerRelation);
  const maxSeatsPerRelation = Number.isInteger(rawMax) && rawMax > 0 ? rawMax : null;

  try {
    const before = await readSeatState();
    if (!before.manifestsComplete || !before.salesComplete) {
      return NextResponse.json(
        { error: "De stoelstatus wordt nog voor het eerst uit Ringside ingelezen. Probeer het later opnieuw." },
        { status: 409 }
      );
    }

    let catchUp: "bijgewerkt" | "overgeslagen" | "mislukt" = "overgeslagen";
    let dataAsOf = before.caughtUpAt;
    if (isRingsideConfigured()) {
      const outcome = await runLockedSeatIngest(CATCH_UP_SECONDS * 1000);
      if (outcome.ran) {
        catchUp = outcome.error ? "mislukt" : "bijgewerkt";
        dataAsOf = outcome.state.caughtUpAt;
      }
    }

    const [event, list] = await Promise.all([readEventSeats(eventId), readHolderList()]);
    if (!event) {
      return NextResponse.json({ error: "Voor deze wedstrijd is geen stoelstatus gevonden." }, { status: 404 });
    }
    if (!list) {
      return NextResponse.json(
        { error: "Er staat nog geen lijst seizoenkaarthouders. Upload die eerst op deze pagina." },
        { status: 409 }
      );
    }

    const { seats, tickets } = toNeighborInput(event);
    const result = findNeighbors(seats, tickets, list.holders, { maxSeatsPerRelation });

    return NextResponse.json(
      {
        event: { eventId: event.eventId, name: event.name, eventDate: event.eventDate },
        count: result.rows.length,
        stats: result.stats,
        csv: toCsv(result.rows, INCLUDE_SEAT_COLUMNS),
        includeSeatColumns: INCLUDE_SEAT_COLUMNS,
        maxSeatsPerRelation,
        dataAsOf,
        catchUp,
        listUploadedAt: list.meta.uploadedAt,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[aangrenzende-stoelen] lijst maken mislukt:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
