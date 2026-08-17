import { amsterdamDayBounds, shiftDayKey, type FandeskCategory } from "@/lib/fandesk";
import { readRange } from "@/lib/fandesk-store";
import {
  aggregateThemes,
  ticketsSig,
  type DayHistoryEntry,
  type FandeskTheme,
} from "@/lib/fandesk-analysis";
import {
  analyzeFandeskDay,
  analyzeFandeskPeriod,
  type FandeskInsightResult,
} from "@/lib/insights/fandesk";
import {
  getDaySummaries,
  getDaySummary,
  savePeriodSummary,
  saveDaySummary,
  type StoredFandeskSummary,
} from "@/lib/fandesk-summary-store";

/**
 * Het bijwerken van de FANdesk-samenvattingen. De dagsamenvattingen worden
 * aangeroepen vanuit de ingest (na het antwoord aan n8n), de periodesamenvatting
 * vanuit de leesroute op verzoek van de gebruiker.
 */

/** Hoeveel voorgaande dagen het model als vergelijkingsmateriaal krijgt. */
const HISTORY_DAYS = 14;

/** Tickets van één Amsterdamse kalenderdag. */
async function ticketsForDay(day: string) {
  const { fromInstant, toInstant } = amsterdamDayBounds(day, day);
  return readRange(fromInstant, toInstant);
}

/** Alle dagsleutels in een bereik, inclusief begin- en einddag. */
export function dayKeysInRange(from: string, to: string): string[] {
  const days: string[] = [];
  let cursor = from;
  // Bovengrens tegen een onbedoeld enorme lus bij een rare invoer.
  for (let i = 0; i < 400 && cursor <= to; i++) {
    days.push(cursor);
    cursor = shiftDayKey(cursor, 1);
  }
  return days;
}

/** Compacte historie uit de al opgeslagen dagsamenvattingen. */
async function buildHistory(day: string): Promise<DayHistoryEntry[]> {
  const days: string[] = [];
  for (let i = 1; i <= HISTORY_DAYS; i++) days.push(shiftDayKey(day, -i));

  const stored = await getDaySummaries(days);
  const entries: DayHistoryEntry[] = [];
  for (const { day: historyDay, stored: summary } of stored) {
    if (!summary) continue;
    const themes = summary.result.themes ?? [];
    const total = themes.reduce((sum, t) => sum + (Number(t.count) || 0), 0);
    entries.push({ day: historyDay, total, themes });
  }
  return entries.sort((a, b) => b.day.localeCompare(a.day));
}

export type DayRefreshOutcome =
  | { day: string; status: "geanalyseerd" }
  | { day: string; status: "ongewijzigd" }
  | { day: string; status: "geen-inhoud" }
  | { day: string; status: "mislukt"; error: string };

/**
 * Werkt de samenvatting van één dag bij. Slaat over wanneer de data sinds de
 * vorige analyse niet is veranderd — dat maakt een uurlijkse ingest zonder nieuwe
 * tickets gratis. Gooit nooit; het resultaat vertelt wat er gebeurd is, zodat een
 * AI-storing de ingest niet kan raken.
 */
export async function refreshDaySummary(day: string): Promise<DayRefreshOutcome> {
  try {
    const tickets = await ticketsForDay(day);
    const withTopic = tickets.filter((t) => t.topic);

    // Zonder onderwerpregels valt er niets samen te vatten. Dat is de normale
    // situatie voor tickets van vóór deze functie.
    if (!withTopic.length) return { day, status: "geen-inhoud" };

    const sig = ticketsSig(tickets);
    const existing = await getDaySummary(day);
    if (existing && existing.sig === sig) return { day, status: "ongewijzigd" };

    const history = await buildHistory(day);
    const result = await analyzeFandeskDay({ day, tickets, history });

    const stored: StoredFandeskSummary = {
      result,
      sig,
      generatedAt: new Date().toISOString(),
    };
    await saveDaySummary(day, stored);
    return { day, status: "geanalyseerd" };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[fandesk-summarize] dag ${day} mislukt:`, error);
    return { day, status: "mislukt", error };
  }
}

/** Meerdere dagen achter elkaar, zodat de historie van de latere dagen klopt. */
export async function refreshDaySummaries(days: string[]): Promise<DayRefreshOutcome[]> {
  const outcomes: DayRefreshOutcome[] = [];
  for (const day of [...new Set(days)].sort()) {
    outcomes.push(await refreshDaySummary(day));
  }
  return outcomes;
}

/**
 * Bouwt de periodesamenvatting uit de al bestaande dagsamenvattingen. Eén
 * AI-call, en de tekst blijft consistent met wat per dag is vastgesteld.
 */
export async function refreshPeriodSummary(args: {
  from: string;
  to: string;
  total: number;
  byCategory: Record<FandeskCategory, number>;
  previousTotal: number;
}): Promise<StoredFandeskSummary | null> {
  const { from, to, total, byCategory, previousTotal } = args;

  const stored = await getDaySummaries(dayKeysInRange(from, to));
  const days = stored
    .filter((entry) => entry.stored !== null)
    .map(({ day, stored: summary }) => {
      const themes: FandeskTheme[] = summary!.result.themes ?? [];
      return {
        day,
        total: themes.reduce((sum, t) => sum + (Number(t.count) || 0), 0),
        summary: summary!.result.summary,
        themes,
      };
    });

  if (!days.length) return null;

  const result = await analyzeFandeskPeriod({
    from,
    to,
    total,
    byCategory,
    previousTotal,
    days,
  });

  // De thema's komen deterministisch uit de dagen, niet uit het model.
  const merged: FandeskInsightResult = {
    ...result,
    themes: aggregateThemes(days.map((d) => d.themes)),
    alerts: [],
  };

  const record: StoredFandeskSummary = {
    result: merged,
    sig: periodSig(days),
    generatedAt: new Date().toISOString(),
  };
  await savePeriodSummary(from, to, record);
  return record;
}

/**
 * Signatuur van een periode: verandert zodra een van de onderliggende dagen
 * opnieuw is geanalyseerd of er een dag bijkomt.
 */
export function periodSig(
  days: Array<{ day: string; total: number }>
): string {
  const total = days.reduce((sum, d) => sum + d.total, 0);
  return `fdp:${days.length}:${total}:${days.map((d) => d.day).sort().join(",").length}`;
}
