import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import {
  amsterdamDayBounds,
  dayCount,
  isValidDayKey,
  shiftDayKey,
} from "@/lib/fandesk";
import { readRange } from "@/lib/fandesk-store";
import { refreshPeriodSummary } from "@/lib/fandesk-summarize";
import { InsightAnalysisError, InsightConfigError } from "@/lib/insights/runner";

/**
 * Genereert de prozatekst over een periode op verzoek van de gebruiker. Dit is de
 * enige plek waar een klik een AI-call kost; de dagsamenvattingen en de heads-ups
 * komen uit de ingest en zijn er altijd al.
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get("psv_session")?.value;
  const authError = authorize(sessionCookie);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  let body: { from?: unknown; to?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  if (!isValidDayKey(body.from) || !isValidDayKey(body.to) || body.from > body.to) {
    return NextResponse.json({ error: "Ongeldige periode." }, { status: 400 });
  }
  const { from, to } = body;

  try {
    const span = dayCount(from, to);
    const prevTo = shiftDayKey(from, -1);
    const prevFrom = shiftDayKey(prevTo, -(span - 1));

    const current = amsterdamDayBounds(from, to);
    const previous = amsterdamDayBounds(prevFrom, prevTo);

    const [tickets, previousTickets] = await Promise.all([
      readRange(current.fromInstant, current.toInstant),
      readRange(previous.fromInstant, previous.toInstant),
    ]);

    const byCategory = { Tickets: 0, FANstore: 0, Wedstrijdinformatie: 0, Overig: 0 };
    for (const ticket of tickets) byCategory[ticket.category]++;

    const stored = await refreshPeriodSummary({
      from,
      to,
      total: tickets.length,
      byCategory,
      previousTotal: previousTickets.length,
    });

    if (!stored) {
      return NextResponse.json(
        {
          error:
            "Nog geen dagsamenvattingen in deze periode. Die verschijnen zodra n8n onderwerpregels meestuurt.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      summary: stored.result.summary,
      highlights: stored.result.highlights ?? [],
      recommendations: stored.result.recommendations ?? [],
      generatedAt: stored.generatedAt,
    });
  } catch (err) {
    if (err instanceof InsightConfigError) {
      console.error("[fandesk/summary]", err.message);
      return NextResponse.json({ error: "Server configuratie fout" }, { status: 500 });
    }
    if (err instanceof InsightAnalysisError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    return NextResponse.json(
      {
        error: "Analyse mislukt.",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
