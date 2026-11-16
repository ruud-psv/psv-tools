import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { seasonOf } from "@/lib/ringside/daily-sales";
import { todayInAmsterdam } from "@/lib/ringside/seat-state";
import { readEventSales, readState } from "@/lib/ringside/store";
import { buildSeasonCsv, buildSeasonOverview } from "@/lib/ticketing-stadion/season";

/**
 * Vrije verkoop en resale van alle thuiswedstrijden van PSV 1 in een seizoen.
 * Uit de verkoop per dag die al per wedstrijd is opgeslagen; zie
 * `lib/ticketing-stadion/season.ts`.
 *
 * `?season=26/27` kiest het seizoen (standaard het lopende), `?format=csv`
 * geeft het als bestand.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  try {
    const today = todayInAmsterdam();
    const requested = req.nextUrl.searchParams.get("season") ?? "";
    const season = /^\d{2}\/\d{2}$/.test(requested) ? requested : seasonOf(today);
    const [sales, state] = await Promise.all([readEventSales(), readState()]);
    const overview = buildSeasonOverview(Object.values(sales), season, today);

    if (req.nextUrl.searchParams.get("format") === "csv") {
      return new NextResponse(buildSeasonCsv(overview), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="verkoop-thuiswedstrijden-${season.replace("/", "-")}.csv"`,
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }
    return NextResponse.json(
      { ...overview, sales: { complete: state.salesComplete, caughtUpAt: state.caughtUpAt, lastError: state.lastError } },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ticketing-stadion] seizoensoverzicht mislukt:", message);
    return NextResponse.json({ error: `Het seizoensoverzicht kon niet worden geladen: ${message}` }, { status: 500 });
  }
}
