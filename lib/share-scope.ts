/**
 * Valt een verzoek met een rapport-deeltoken binnen wat dat rapport deelt?
 *
 * Het token zegt alleen wélk rapport (`lib/share-token.ts`); de bronnen, sites,
 * pagina's, producten en periodes staan in het rapport zelf. Zo blijft een
 * link na het bewerken van het rapport kloppen, en geeft hij nooit meer dan
 * het rapport op dat moment laat zien.
 *
 * Elke functie geeft een melding terug als het verzoek erbuiten valt, anders
 * `null`. Puur, zodat het zonder Blob of Google Analytics te testen is.
 */

import type { PeriodConfig, ReportSources } from "@/lib/reports";
import { getDateRange } from "@/lib/date-range";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * De gedeelde periode als datumbereik, op dezelfde manier berekend als de
 * deelpagina (`resolvePeriod` in `app/share/rapportage/page.tsx`).
 * `meebewegend` is waar voor relatieve presets zoals "30d".
 */
export function sharedPeriod(
  period: PeriodConfig | undefined,
  now: Date
): { from: string; to: string; meebewegend: boolean } {
  if (period?.preset === "custom" && period.from && period.to) {
    return { from: period.from, to: period.to, meebewegend: false };
  }
  const preset = period && period.preset !== "custom" ? period.preset : "30d";
  return { ...getDateRange(preset, undefined, undefined, now), meebewegend: true };
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Ligt het gevraagde bereik binnen de gedeelde periode? Bij een meebewegende
 * periode mag het een dag verschuiven: de pagina rekent met de klok van de
 * bezoeker, en die kan rond middernacht net een andere datum hebben.
 */
export function withinSharedPeriod(
  period: PeriodConfig | undefined,
  from: string | null,
  to: string | null,
  now: Date
): boolean {
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) return false;
  const [start, end] = from <= to ? [from, to] : [to, from];
  const shared = sharedPeriod(period, now);
  const slack = shared.meebewegend ? 1 : 0;
  return start >= shiftDays(shared.from, -slack) && end <= shiftDays(shared.to, slack);
}

const PERIODE_BUITEN = "De gevraagde periode valt buiten wat dit rapport deelt.";

/** `/api/analytics`: één gedeelde site, alleen de gedeelde pagina's en periode. */
export function checkWebRequest(
  sources: ReportSources,
  req: { site: string | null; paths: string[]; from: string | null; to: string | null },
  now: Date
): string | null {
  const web = sources.web;
  if (!web?.enabled) return "Webverkeer is niet gedeeld in dit rapport.";
  if (!req.site) return "Kies één site uit het rapport.";
  const selection = web.sites.find((s) => s.site === req.site);
  if (!selection) return `Site "${req.site}" is niet gedeeld in dit rapport.`;

  // Geen pagina's gekozen betekent: de hele site is gedeeld.
  const shared = new Set((selection.paths ?? []).map((p) => p.trim()).filter(Boolean));
  if (shared.size > 0) {
    if (req.paths.length === 0) return "Dit rapport deelt alleen de gekozen pagina's van deze site.";
    if (req.paths.some((p) => !shared.has(p))) return "Een gevraagde pagina is niet gedeeld in dit rapport.";
  }

  if (!withinSharedPeriod(web.period, req.from, req.to, now)) return PERIODE_BUITEN;
  return null;
}

/**
 * `/api/fanstore-analytics`: alleen de gedeelde periode, en bij een
 * productselectie alleen die producten. De winkeltotalen horen erbij: de
 * deelpagina toont ze naast de selectie.
 */
export function checkFanstoreRequest(
  sources: ReportSources,
  req: { startDate: string | null; endDate: string | null; product: string | null },
  now: Date
): string | null {
  const fanstore = sources.fanstore;
  if (!fanstore?.enabled) return "FANstore is niet gedeeld in dit rapport.";
  if (!withinSharedPeriod(fanstore.period, req.startDate, req.endDate, now)) return PERIODE_BUITEN;
  const products = sharedProducts(sources);
  if (req.product && products && !products.includes(req.product)) {
    return "Dit product is niet gedeeld in dit rapport.";
  }
  return null;
}

/** De gedeelde producten, of `null` als de hele winkel gedeeld is. */
export function sharedProducts(sources: ReportSources): string[] | null {
  const products = sources.fanstore?.products;
  return products && products.length > 0 ? products : null;
}

/** Bron van een AI-analyse (`/api/share/insights`) en het deel van het rapport dat daarbij hoort. */
const INSIGHT_SOURCE: Record<string, keyof ReportSources> = {
  dm: "dm",
  ticket: "ticketing",
  analytics: "web",
  fanstore: "fanstore",
};

/** `/api/share/insights`: alleen analyses van bronnen die in het rapport staan. */
export function checkInsightSource(sources: ReportSources, source: string): string | null {
  if (source === "combined") {
    return Object.values(sources).some((s) => s?.enabled) ? null : "Dit rapport deelt geen bronnen.";
  }
  const key = INSIGHT_SOURCE[source];
  if (!key) return "Onbekende source.";
  return sources[key]?.enabled ? null : "Deze bron is niet gedeeld in dit rapport.";
}
