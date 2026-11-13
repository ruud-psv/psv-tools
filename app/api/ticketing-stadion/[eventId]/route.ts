import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { EVENT_ID, loadStadionMatch } from "@/lib/ticketing-stadion/load";

/**
 * Eén thuiswedstrijd voor Ticketing Stadion: bezetting per vak, de stoelen per
 * vak voor de plattegrond, groepjes vrije stoelen, het aanbod per dag en de
 * verkoop per dag. Zie `loadStadionMatch()`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const eventId = (await params).eventId.trim().toLowerCase();
  if (!EVENT_ID.test(eventId)) return NextResponse.json({ error: "Onbekende wedstrijd." }, { status: 400 });

  try {
    const data = await loadStadionMatch(eventId);
    if (!data) {
      return NextResponse.json(
        { error: "Voor deze wedstrijd is geen stoelstatus gevonden. Is hij al gespeeld?" },
        { status: 404 }
      );
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ticketing-stadion] wedstrijd mislukt:", message);
    return NextResponse.json({ error: `De wedstrijd kon niet worden geladen: ${message}` }, { status: 500 });
  }
}
