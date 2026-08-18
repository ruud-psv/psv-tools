import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import {
  amsterdamDayBounds,
  dayCount,
  emptyCategoryCounts,
  FandeskCategory,
  isValidDayKey,
  shiftDayKey,
  toAmsterdamParts,
} from "@/lib/fandesk";
import { readRange } from "@/lib/fandesk-store";
import { aggregateThemes, type FandeskTheme } from "@/lib/fandesk-analysis";
import { getDaySummaries, getPeriodSummary } from "@/lib/fandesk-summary-store";
import { dayKeysInRange, periodSig } from "@/lib/fandesk-summarize";
import type { FandeskAlert } from "@/lib/insights/fandesk";

/**
 * Leesroute voor het FANdesk dashboard. Aggregeert de opgeslagen tickets naar
 * uur-buckets, zodat de client vrij kan herbucketen naar dag/week/weekdag/uur
 * zonder opnieuw te fetchen.
 */

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 30;

export interface FandeskBucket {
  /** Begin van het uur, ISO-8601 in UTC. */
  ts: string;
  counts: Record<FandeskCategory, number>;
}

/** Samenvatting van één dag, zoals de ingest hem heeft laten maken. */
export interface FandeskDaySummary {
  day: string;
  summary: string;
  themes: FandeskTheme[];
  alerts: FandeskAlert[];
  generatedAt: string;
}

export interface FandeskData {
  from: string;
  to: string;
  buckets: FandeskBucket[];
  totals: { total: number; byCategory: Record<FandeskCategory, number> };
  previous: {
    from: string;
    to: string;
    total: number;
    byCategory: Record<FandeskCategory, number>;
  };
  lastTicketAt: string | null;
  generatedAt: string;
  /**
   * Alle velden hieronder zijn optioneel: de fallback onderaan deze route (voor
   * een ontbrekende blob-token) bouwt een FandeskData met de hand, en verplichte
   * velden zouden die laten breken.
   */
  daySummaries?: FandeskDaySummary[];
  /** Opgeteld uit de dagen — puur rekenwerk, dus werkt voor elk bereik. */
  topThemes?: FandeskTheme[];
  /** Prozatekst over de hele periode; null zolang die niet gegenereerd is. */
  periodSummary?: {
    summary: string;
    highlights: { type: string; text: string }[];
    recommendations: string[];
    generatedAt: string;
  } | null;
  /** True als de opgeslagen periodetekst niet meer bij de data past. */
  periodSummaryStale?: boolean;
  /** True zodra er ergens in het bereik onderwerpregels zijn aangeleverd. */
  hasTopics?: boolean;
}

function todayKey(): string {
  return toAmsterdamParts(new Date().toISOString())?.dayKey ?? new Date().toISOString().slice(0, 10);
}

function aggregate(
  tickets: Array<{ category: FandeskCategory; at: string }>
): { buckets: FandeskBucket[]; byCategory: Record<FandeskCategory, number>; total: number } {
  const byHour = new Map<string, Record<FandeskCategory, number>>();
  const byCategory = emptyCategoryCounts();

  for (const ticket of tickets) {
    // Uur-bucket in UTC; de client rekent voor weergave om naar Amsterdam.
    const ts = `${ticket.at.slice(0, 13)}:00:00.000Z`;
    let counts = byHour.get(ts);
    if (!counts) {
      counts = emptyCategoryCounts();
      byHour.set(ts, counts);
    }
    counts[ticket.category]++;
    byCategory[ticket.category]++;
  }

  const buckets = [...byHour.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ts, counts]) => ({ ts, counts }));

  return { buckets, byCategory, total: tickets.length };
}

export async function GET(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  const params = req.nextUrl.searchParams;
  const rawFrom = params.get("from");
  const rawTo = params.get("to");

  const to = isValidDayKey(rawTo) ? rawTo : todayKey();
  const from = isValidDayKey(rawFrom) ? rawFrom : shiftDayKey(to, -(DEFAULT_DAYS - 1));

  if (from > to) {
    return NextResponse.json(
      { error: "Ongeldige periode: 'from' ligt na 'to'." },
      { status: 400 }
    );
  }

  const span = dayCount(from, to);
  const prevTo = shiftDayKey(from, -1);
  const prevFrom = shiftDayKey(prevTo, -(span - 1));

  try {
    const current = amsterdamDayBounds(from, to);
    const previous = amsterdamDayBounds(prevFrom, prevTo);

    const [currentTickets, previousTickets, storedDays, storedPeriod] = await Promise.all([
      readRange(current.fromInstant, current.toInstant),
      readRange(previous.fromInstant, previous.toInstant),
      getDaySummaries(dayKeysInRange(from, to)),
      getPeriodSummary(from, to),
    ]);

    const now = aggregate(currentTickets);
    const before = aggregate(previousTickets);

    const daySummaries: FandeskDaySummary[] = storedDays
      .filter((entry) => entry.stored !== null)
      .map(({ day, stored }) => ({
        day,
        summary: stored!.result.summary,
        themes: stored!.result.themes ?? [],
        alerts: stored!.result.alerts ?? [],
        generatedAt: stored!.generatedAt,
      }))
      .sort((a, b) => b.day.localeCompare(a.day));

    // Thema's over de hele periode zijn puur rekenwerk uit de dagen — geen
    // AI-call, dus dit werkt ook voor een eigen datumbereik.
    const topThemes = aggregateThemes(daySummaries.map((d) => d.themes));

    // De periodetekst wordt hier nooit gegenereerd; dat kost geld en gebeurt
    // alleen op verzoek via /api/fandesk/summary. Wel bepalen of de opgeslagen
    // versie nog bij de data past.
    const currentPeriodSig = periodSig(
      daySummaries.map((d) => ({
        day: d.day,
        total: d.themes.reduce((sum, t) => sum + (Number(t.count) || 0), 0),
      }))
    );
    const periodCurrent = storedPeriod !== null && storedPeriod.sig === currentPeriodSig;

    const data: FandeskData = {
      from,
      to,
      buckets: now.buckets,
      totals: { total: now.total, byCategory: now.byCategory },
      previous: {
        from: prevFrom,
        to: prevTo,
        total: before.total,
        byCategory: before.byCategory,
      },
      lastTicketAt: currentTickets.length ? currentTickets[currentTickets.length - 1].at : null,
      generatedAt: new Date().toISOString(),
      daySummaries,
      topThemes,
      periodSummary:
        storedPeriod && periodCurrent
          ? {
              summary: storedPeriod.result.summary,
              highlights: storedPeriod.result.highlights ?? [],
              recommendations: storedPeriod.result.recommendations ?? [],
              generatedAt: storedPeriod.generatedAt,
            }
          : null,
      periodSummaryStale: daySummaries.length > 0 && !periodCurrent,
      hasTopics: currentTickets.some((t) => t.topic),
    };

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ophalen mislukt";
    console.error("[fandesk] GET mislukt:", message);
    // Zonder blob-token is er simpelweg nog geen data — geef een lege set terug
    // in plaats van een foutmelding waar de gebruiker niets mee kan.
    if (message.includes("BLOB_READ_WRITE_TOKEN")) {
      return NextResponse.json({
        from,
        to,
        buckets: [],
        totals: { total: 0, byCategory: emptyCategoryCounts() },
        previous: { from: prevFrom, to: prevTo, total: 0, byCategory: emptyCategoryCounts() },
        lastTicketAt: null,
        generatedAt: new Date().toISOString(),
      } satisfies FandeskData);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
