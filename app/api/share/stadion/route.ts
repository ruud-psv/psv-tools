import { NextRequest, NextResponse } from "next/server";
import { loadStadionMatch } from "@/lib/ticketing-stadion/load";
import { readShareToken } from "@/lib/ticketing-stadion/share";

/**
 * De wedstrijdpagina van Ticketing Stadion via een deellink: zonder login,
 * met een ondertekend token (`lib/ticketing-stadion/share.ts`). Dezelfde
 * cijfers als de pagina zelf; geen persoonsgegevens.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const eventId = readShareToken(req.nextUrl.searchParams.get("token"));
  if (!eventId) return NextResponse.json({ error: "Deze link is ongeldig." }, { status: 404 });

  try {
    const data = await loadStadionMatch(eventId);
    if (!data) {
      return NextResponse.json(
        { error: "Deze wedstrijd is niet meer beschikbaar. Waarschijnlijk is hij al gespeeld." },
        { status: 404 }
      );
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("[share/stadion] mislukt:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "De wedstrijd kon niet worden geladen." }, { status: 500 });
  }
}
