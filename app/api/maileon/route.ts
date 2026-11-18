import { NextRequest, NextResponse } from "next/server";
import { maileonAccessFor } from "@/lib/maileon/access";
import { clampToScope, matchesQueries } from "@/lib/dm-scope";
import { computeMailingTotals, fetchMailingSummaries, listSentMailings } from "@/lib/maileon/mailings";

// Nooit een antwoord cachen: wat je terugkrijgt hangt af van je sessie of
// deeltoken. Maileon zelf wordt wel kort gecachet (zie `lib/maileon/mailings.ts`).
export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * De verzonden mailings in een periode met hun resultaten. Met een sessie:
 * alle mailings. Met een deeltoken (`?token=`): alleen de periode en de
 * mailings van de gedeelde weergave (zie `lib/maileon/access.ts`).
 */
export async function GET(request: NextRequest) {
  const access = await maileonAccessFor(request);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const { searchParams } = request.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to || !DATE.test(from) || !DATE.test(to)) {
      return NextResponse.json(
        { error: "Parameters 'from' en 'to' zijn vereist (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // Een deeltoken ziet nooit meer dan zijn eigen periode.
    const range = access.scope ? clampToScope(from, to, access.scope) : { from, to };
    let mailings = range ? await listSentMailings(range.from, range.to) : [];
    if (access.scope) {
      const { queries } = access.scope;
      mailings = mailings.filter((m) => matchesQueries(m, queries));
    }

    const summaries = await fetchMailingSummaries(mailings);

    return NextResponse.json({
      mailings: summaries,
      totals: computeMailingTotals(summaries),
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[maileon] Data ophalen mislukt:", err);
    return NextResponse.json({ error: "Maileon data ophalen mislukt" }, { status: 502 });
  }
}
