import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { readEventSales } from "@/lib/ringside/store";
import { isHomeMatchSales } from "@/lib/ticketing-stadion/summary";

/**
 * De verkoop per dag van een paar eerdere thuiswedstrijden, om in de grafiek
 * van Ticketing Stadion naast een wedstrijd te leggen. Alleen aantallen.
 */

export const dynamic = "force-dynamic";

/** Meer dan drie lijnen naast elkaar wordt onleesbaar. */
const MAX_IDS = 3;

export async function GET(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, MAX_IDS);

  try {
    const sales = await readEventSales();
    const matches = ids
      .map((id) => sales[id])
      .filter((event) => event && isHomeMatchSales(event))
      .map(({ productId, name, eventDate, season, perOffset, total }) => ({
        productId,
        name,
        eventDate,
        season,
        perOffset,
        total,
      }));
    return NextResponse.json({ matches }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `De verkoop kon niet worden geladen: ${message}` }, { status: 500 });
  }
}
