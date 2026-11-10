import { NextRequest, NextResponse } from "next/server";
import { readMatchSales } from "@/lib/ringside/store";
import { parseIds, pickSalesSeries } from "@/lib/ticketing-stadion/load";
import { readShareToken } from "@/lib/ticketing-stadion/share";

/** De verkoop per dag van eerdere thuiswedstrijden, voor de grafiek op een deellink. */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!readShareToken(req.nextUrl.searchParams.get("token"))) {
    return NextResponse.json({ error: "Deze link is ongeldig." }, { status: 404 });
  }
  try {
    const matches = pickSalesSeries(await readMatchSales(), parseIds(req.nextUrl.searchParams.get("ids")));
    return NextResponse.json({ matches }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ error: "De verkoop kon niet worden geladen." }, { status: 500 });
  }
}
