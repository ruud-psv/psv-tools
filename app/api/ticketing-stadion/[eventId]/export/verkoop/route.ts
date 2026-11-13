import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { readSalesData } from "@/lib/ringside/store";
import { exportFileName } from "@/lib/ticketing-stadion/export";
import { EVENT_ID } from "@/lib/ticketing-stadion/load";
import { buildDailySalesExport } from "@/lib/ticketing-stadion/sales-export";

/**
 * De verkoop per dag van één wedstrijd als CSV, per soort ticket. Werkt ook
 * voor gespeelde wedstrijden. Leest de verkoop per dag die de cron klaarzet;
 * geen verzoek naar Ringside. Zie `lib/ticketing-stadion/sales-export.ts`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const eventId = (await params).eventId.trim().toLowerCase();
  if (!EVENT_ID.test(eventId)) return NextResponse.json({ error: "Onbekende wedstrijd." }, { status: 400 });

  try {
    const event = (await readSalesData("live"))?.events[eventId];
    if (!event) {
      return NextResponse.json({ error: "Voor deze wedstrijd is geen verkoop per dag gevonden." }, { status: 404 });
    }
    return new NextResponse(buildDailySalesExport(event), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFileName(event, "verkoop-per-dag")}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ticketing-stadion] export verkoop per dag mislukt:", message);
    return NextResponse.json({ error: `De export kon niet worden gemaakt: ${message}` }, { status: 500 });
  }
}
