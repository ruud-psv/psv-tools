import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { parseIds, pickSalesSeries } from "@/lib/ticketing-stadion/load";
import { readMatchSales } from "@/lib/ringside/store";

/**
 * De verkoop per dag van een paar eerdere thuiswedstrijden, om in de grafiek
 * van Ticketing Stadion naast een wedstrijd te leggen. Alleen aantallen.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  try {
    const matches = pickSalesSeries(await readMatchSales(), parseIds(req.nextUrl.searchParams.get("ids")));
    return NextResponse.json({ matches }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `De verkoop kon niet worden geladen: ${message}` }, { status: 500 });
  }
}
