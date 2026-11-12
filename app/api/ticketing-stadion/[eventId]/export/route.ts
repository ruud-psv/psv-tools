import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { readEventSeats } from "@/lib/ringside/seat-store";
import { buildSalesExport, exportFileName } from "@/lib/ticketing-stadion/export";
import { EVENT_ID } from "@/lib/ticketing-stadion/load";

/**
 * De tickets van één thuiswedstrijd als CSV: wedstrijd, vak, rij, stoel en
 * sales type. Leest de stoelstatus die de wedstrijdpagina ook gebruikt; geen
 * verzoek naar Ringside. Zie `lib/ticketing-stadion/export.ts`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const eventId = (await params).eventId.trim().toLowerCase();
  if (!EVENT_ID.test(eventId)) return NextResponse.json({ error: "Onbekende wedstrijd." }, { status: 400 });

  try {
    const event = await readEventSeats(eventId);
    if (!event) {
      return NextResponse.json(
        { error: "Voor deze wedstrijd is geen stoelstatus gevonden. Is hij al gespeeld?" },
        { status: 404 }
      );
    }
    return new NextResponse(buildSalesExport(event), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFileName(event)}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ticketing-stadion] export mislukt:", message);
    return NextResponse.json({ error: `De export kon niet worden gemaakt: ${message}` }, { status: 500 });
  }
}
