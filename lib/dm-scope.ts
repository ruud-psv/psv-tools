/**
 * Welke mailings horen bij een DM-deellink? Deze functies gebruiken zowel de
 * deelpagina's in de browser (`/share/dm`, `/share/rapportage`) als de
 * Maileon-routes op de server (`lib/maileon/access.ts`). Zo bepalen pagina en
 * server op dezelfde manier de periode en de zoektermen, en geeft de server
 * een deeltoken nooit meer dan de pagina laat zien.
 *
 * Puur: geen opslag, geen fetch, geen React.
 */

import type { PeriodConfig } from "@/lib/reports";

/** Strip DMID-suffix, datumpatronen én achtergebleven " - " separatoren */
export function stripName(name: string): string {
  const MONTHS = "januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|jan|feb|mrt|apr|jun|jul|aug|sep|okt|nov|dec";
  return name
    .replace(/\s*DMID.*/i, "")
    .replace(/\s*\b\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\b/g, "")
    .replace(/\s*\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, "")
    .replace(new RegExp(`\\s*\\b\\d{1,2}\\s+(${MONTHS})\\.?\\s*\\d{0,4}\\b`, "gi"), "")
    .replace(new RegExp(`\\s*\\b(${MONTHS})\\.?\\s+\\d{4}\\b`, "gi"), "")
    .replace(/\s+/g, " ")
    .replace(/(\s*-)+\s*$/, "")
    .replace(/^\s*(-\s*)+/, "")
    .trim() || name;
}

export function getDateRange(preset: string, customFrom?: string, customTo?: string) {
  if (preset === "custom" && customFrom && customTo) return { from: customFrom, to: customTo };
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  switch (preset) {
    case "7d":  { const d = new Date(now); d.setDate(d.getDate() - 7);   return { from: d.toISOString().slice(0, 10), to }; }
    case "30d": { const d = new Date(now); d.setDate(d.getDate() - 30);  return { from: d.toISOString().slice(0, 10), to }; }
    case "90d": { const d = new Date(now); d.setDate(d.getDate() - 90);  return { from: d.toISOString().slice(0, 10), to }; }
    case "6m":  { const d = new Date(now); d.setMonth(d.getMonth() - 6); return { from: d.toISOString().slice(0, 10), to }; }
    case "1y":  { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return { from: d.toISOString().slice(0, 10), to }; }
    case "seizoen2425": return { from: "2024-07-01", to: "2025-06-30" };
    case "seizoen2526": {
      const end = new Date(Math.min(new Date("2026-06-30").getTime(), now.getTime()));
      return { from: "2025-07-01", to: end.toISOString().slice(0, 10) };
    }
    default: { const d = new Date(now); d.setDate(d.getDate() - 30); return { from: d.toISOString().slice(0, 10), to }; }
  }
}

/** Los een bron-periode op naar een concreet {from,to}. Relatieve presets worden
 *  op weergavemoment berekend (meebewegend); valt terug op de legacy globale
 *  periode of, als laatste redmiddel, 30 dagen. */
export function resolvePeriod(
  period: PeriodConfig | undefined,
  legacyFrom?: string,
  legacyTo?: string
): { from: string; to: string } {
  if (period) {
    if (period.preset === "custom" && period.from && period.to) {
      return { from: period.from, to: period.to };
    }
    if (period.preset !== "custom") return getDateRange(period.preset);
  }
  if (legacyFrom && legacyTo) return { from: legacyFrom, to: legacyTo };
  return getDateRange("30d");
}

/** Normalize legacy `query` (single string) and new `queries` (array) into one list. */
export function collectQueries(src: { query?: string; queries?: string[] } | undefined): string[] {
  if (!src) return [];
  const out: string[] = [];
  if (Array.isArray(src.queries)) {
    for (const q of src.queries) {
      const t = q?.trim?.();
      if (t) out.push(t);
    }
  }
  if (typeof src.query === "string" && src.query.trim()) out.push(src.query.trim());
  return out;
}

/**
 * Past een mailing bij een van de zoektermen? Zonder zoektermen past alles.
 * Kijkt naar de naam, de naam zonder datum/DMID en het onderwerp, net als de
 * filters op de deelpagina's.
 */
export function matchesQueries(mailing: { name?: string; subject?: string }, queries: string[]): boolean {
  if (queries.length === 0) return true;
  const name = (mailing.name ?? "").toLowerCase();
  const stripped = stripName(mailing.name ?? "").toLowerCase();
  const subject = (mailing.subject ?? "").toLowerCase();
  return queries
    .map((q) => q.toLowerCase())
    .some((q) => name.includes(q) || stripped.includes(q) || subject.includes(q));
}

/* ---------- Wat een deeltoken van Maileon mag zien ---------- */

/** De periode en de zoektermen van een gedeelde DM-weergave. */
export interface MaileonScope {
  from: string;
  to: string;
  queries: string[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asPeriod(value: unknown): PeriodConfig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const p = value as Record<string, unknown>;
  if (typeof p.preset !== "string") return undefined;
  return { preset: p.preset, from: str(p.from) || undefined, to: str(p.to) || undefined };
}

function asQueries(value: unknown): { query?: string; queries?: string[] } {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  return {
    query: str(v.query) || undefined,
    queries: Array.isArray(v.queries) ? v.queries.filter((q): q is string => typeof q === "string") : undefined,
  };
}

/** De DM-bron van een rapport of campagnelink, als die aanstaat. */
function dmSource(sources: unknown): Record<string, unknown> | null {
  if (!sources || typeof sources !== "object") return null;
  const dm = (sources as Record<string, unknown>).dm;
  if (!dm || typeof dm !== "object" || (dm as Record<string, unknown>).enabled !== true) return null;
  return dm as Record<string, unknown>;
}

/**
 * Wat een deellink van Maileon mag zien, of `null` als de link geen DM-data
 * deelt. De periode wordt hier opnieuw uitgerekend, net als op de deelpagina,
 * zodat een meebewegende periode ("laatste 30 dagen") ook op de server
 * meebeweegt.
 *
 * - `dm`: de DM Performance-deellink, met preset, eigen periode en zoekterm;
 * - `campaign`: een oude campagnelink, met de rapportconfiguratie in het token;
 * - `report`: een opgeslagen rapport; geef het rapport zelf mee als `report`.
 */
export function maileonScopeFromShare(
  payload: Record<string, unknown>,
  report?: { sources?: unknown } | null
): MaileonScope | null {
  const scope = scopeFor(payload, report);
  // Een kapotte datum (bijvoorbeeld een eigen periode zonder geldige datums)
  // geeft geen toegang in plaats van een fout.
  return scope && DATE.test(scope.from) && DATE.test(scope.to) ? scope : null;
}

function scopeFor(payload: Record<string, unknown>, report?: { sources?: unknown } | null): MaileonScope | null {
  switch (payload.kind) {
    case "dm": {
      const preset = str(payload.preset) || "30d";
      const { from, to } = getDateRange(preset, str(payload.customFrom) || undefined, str(payload.customTo) || undefined);
      const q = str(payload.q).trim();
      return { from, to, queries: q ? [q] : [] };
    }
    case "campaign": {
      const dm = dmSource(payload.sources);
      if (!dm) return null;
      const { from, to } = resolvePeriod(asPeriod(dm.period), str(payload.from) || undefined, str(payload.to) || undefined);
      return { from, to, queries: collectQueries(asQueries(dm)) };
    }
    case "report": {
      // De deelpagina krijgt alleen `sources` van het rapport (zie
      // `app/api/reports/[id]/route.ts`), dus geen legacy from/to meegeven.
      const dm = dmSource(report?.sources);
      if (!dm) return null;
      const { from, to } = resolvePeriod(asPeriod(dm.period));
      return { from, to, queries: collectQueries(asQueries(dm)) };
    }
    default:
      return null;
  }
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Een dag speling aan beide kanten: de browser rekent "laatste 30 dagen" uit in
 * zijn eigen tijdzone, de server in UTC.
 */
export const SCOPE_MARGIN_DAYS = 1;

/** De periode van een scope, met de speling erbij. */
export function scopeWindow(scope: MaileonScope): { from: string; to: string } {
  return { from: addDays(scope.from, -SCOPE_MARGIN_DAYS), to: addDays(scope.to, SCOPE_MARGIN_DAYS) };
}

/**
 * Beperkt een gevraagde periode tot wat de scope mag zien. `null` als er
 * niets van overblijft. Inperken in plaats van weigeren, zodat een deelpagina
 * die dagen openstaat (en dus met een verschoven periode blijft vragen) blijft
 * werken.
 */
export function clampToScope(from: string, to: string, scope: MaileonScope): { from: string; to: string } | null {
  if (!DATE.test(from) || !DATE.test(to)) return null;
  const window = scopeWindow(scope);
  const clampedFrom = from > window.from ? from : window.from;
  const clampedTo = to < window.to ? to : window.to;
  return clampedFrom <= clampedTo ? { from: clampedFrom, to: clampedTo } : null;
}
