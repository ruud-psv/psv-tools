/**
 * De verkoop per dag van een wedstrijd als staven: de laatste vier weken voor
 * de aftrap, met per dag één staaf per wedstrijd. Wat eerder verkocht is, doet
 * voor het sturen op een wedstrijd weinig; dat staat als één getal bij de grafiek.
 *
 * Puur, zodat het te testen is.
 */

/** Zoveel dagen voor de wedstrijddag begint de grafiek. */
export const DAILY_BARS_DAYS = 28;

export interface DailyBarsSeries {
  id: string;
  /** Verkocht per aantal dagen tot de wedstrijd; de sleutel is het getal als tekst. */
  perOffset: Record<string, number>;
  /**
   * Dagen tot de wedstrijd op dit moment, voor een wedstrijd die nog komt: de
   * dagen daarna zijn er nog niet en blijven leeg in plaats van nul.
   */
  daysOut?: number;
}

export interface DailyBarsRow {
  /** Dagen tot de wedstrijd: 28 tot en met 0 (de wedstrijddag). */
  offset: number;
  /** Per wedstrijd het aantal; `null` voor een dag die nog moet komen. */
  values: Record<string, number | null>;
}

export interface DailyBars {
  rows: DailyBarsRow[];
  /** Per wedstrijd wat er vóór de grafiek al verkocht was. */
  before: Record<string, number>;
  /** Per wedstrijd wat er in de grafiek staat. */
  inWindow: Record<string, number>;
}

export function buildDailyBars(series: readonly DailyBarsSeries[], days: number = DAILY_BARS_DAYS): DailyBars {
  const rows: DailyBarsRow[] = [];
  for (let offset = days; offset >= 0; offset--) {
    const values: Record<string, number | null> = {};
    for (const { id, perOffset, daysOut } of series) {
      values[id] = daysOut !== undefined && offset < daysOut ? null : (perOffset[String(offset)] ?? 0);
    }
    rows.push({ offset, values });
  }

  const before: Record<string, number> = {};
  const inWindow: Record<string, number> = {};
  for (const { id, perOffset } of series) {
    before[id] = 0;
    inWindow[id] = 0;
    for (const [key, count] of Object.entries(perOffset)) {
      const offset = Number(key);
      if (offset > days) before[id] += count;
      // Verkoop na de wedstrijddag (negatieve dagen) hoort bij geen van beide.
      else if (offset >= 0) inWindow[id] += count;
    }
  }
  return { rows, before, inWindow };
}

/** `2026-10-31 18:45:00` en 3 dagen ervoor → `28/10`. */
export function offsetDateLabel(eventDate: string, offset: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(eventDate);
  if (!match) return "";
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) - offset));
  return `${day.getUTCDate()}/${day.getUTCMonth() + 1}`;
}
