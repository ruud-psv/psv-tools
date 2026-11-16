import { NextRequest, NextResponse } from "next/server";
import { todayInAmsterdam } from "@/lib/ringside/seat-state";
import { readEventSales, readState } from "@/lib/ringside/store";
import { buildSeasonOverview } from "@/lib/ticketing-stadion/season";
import { readSeasonShareToken } from "@/lib/ticketing-stadion/share";

/**
 * Het seizoensoverzicht van Ticketing Stadion via een deellink: zonder login,
 * met een ondertekend token (`lib/ticketing-stadion/share.ts`). Alleen
 * aantallen verkochte tickets per wedstrijd; de wedstrijden die de maker van de
 * link heeft uitgezet, zitten er niet in.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const share = readSeasonShareToken(req.nextUrl.searchParams.get("token"));
  if (!share) return NextResponse.json({ error: "Deze link is ongeldig." }, { status: 404 });

  try {
    const [sales, state] = await Promise.all([readEventSales(), readState()]);
    const overview = buildSeasonOverview(Object.values(sales), share.season, todayInAmsterdam());
    const exclude = new Set(share.exclude);
    return NextResponse.json(
      {
        ...overview,
        // Andere seizoenen horen niet bij deze link.
        seasons: [share.season],
        matches: overview.matches.filter((match) => !exclude.has(match.eventId)),
        sales: { complete: state.salesComplete, caughtUpAt: state.caughtUpAt, lastError: null },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("[share/stadion/seizoen] mislukt:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Het overzicht kon niet worden geladen." }, { status: 500 });
  }
}
