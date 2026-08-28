/**
 * Alle afgeleide waarden van het Paid Ads dashboard. Pure functies over de ruwe
 * tellers uit `types.ts` — geen fetches, geen React. Eén plek waar CTR, CPC,
 * CVR, CPA en de campagnescore gedefinieerd zijn, zodat de campagnetabel, de
 * KPI-tegels en de exploitatietabel niet uit elkaar kunnen lopen.
 */

import {
  AUDIENCE_LABELS,
  AudienceType,
  BenchmarkKey,
  CONVERSION_OBJECTIVES,
  emptyMetrics,
  PaidAdsAd,
  PaidAdsAdSet,
  PaidAdsCampaign,
  PaidAdsResponse,
  PaidAdsTargets,
  PaidMetrics,
  PaidPhase,
  PaidPlatform,
  PHASE_LABELS,
  PLATFORM_LABELS,
} from "./types";

/** Kleurcodering van een waarde ten opzichte van zijn norm. */
export type Tone = "good" | "warn" | "bad" | "neutral";

/* ---------- Rekenhulpen ---------- */

/** Deelt veilig; `null` wanneer de noemer 0 is, zodat "—" getoond kan worden. */
function div(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

export function sumMetrics(list: { metrics: PaidMetrics }[]): PaidMetrics {
  return list.reduce<PaidMetrics>((acc, item) => {
    acc.spend += item.metrics.spend;
    acc.impressions += item.metrics.impressions;
    acc.reach += item.metrics.reach;
    acc.clicks += item.metrics.clicks;
    acc.results += item.metrics.results;
    return acc;
  }, emptyMetrics());
}

export interface DerivedMetrics extends PaidMetrics {
  /** Weergaven per bereikt persoon. */
  frequency: number | null;
  ctr: number | null;
  cpc: number | null;
  cvr: number | null;
  costPerResult: number | null;
  cpm: number | null;
}

export function derive(m: PaidMetrics): DerivedMetrics {
  return {
    ...m,
    frequency: div(m.impressions, m.reach),
    ctr: mul100(div(m.clicks, m.impressions)),
    cpc: div(m.spend, m.clicks),
    cvr: mul100(div(m.results, m.clicks)),
    costPerResult: div(m.spend, m.results),
    cpm: mulN(div(m.spend, m.impressions), 1000),
  };
}

function mul100(v: number | null): number | null {
  return v === null ? null : v * 100;
}
function mulN(v: number | null, n: number): number | null {
  return v === null ? null : v * n;
}

/* ---------- Vergelijking met de benchmark ---------- */

/** Metrics waarvoor een daling gunstig is. */
const LOWER_IS_BETTER = new Set(["cpc", "costPerResult", "cpm"]);
/** Metrics die zelf een percentage zijn — het verschil is procentpunten. */
const IN_POINTS = new Set(["ctr", "cvr"]);

export type MetricKey = keyof DerivedMetrics;

export interface Delta {
  /** Verschil: procenten, of procentpunten voor CTR en CVR. */
  value: number | null;
  unit: "%" | "pp" | "";
  tone: Tone;
}

/**
 * Verschil tussen de huidige waarde en de vergelijkingswaarde. Retourneert een
 * lege delta wanneer er niets is om mee te vergelijken — dan toont het dashboard
 * geen badge in plaats van "+0%".
 */
export function deltaFor(
  key: MetricKey,
  current: number | null,
  benchmark: number | null
): Delta {
  const unit: Delta["unit"] = IN_POINTS.has(key) ? "pp" : key === "frequency" ? "" : "%";
  if (current == null || benchmark == null) return { value: null, unit, tone: "neutral" };

  let value: number | null;
  if (unit === "pp" || unit === "") {
    value = current - benchmark;
  } else {
    value = benchmark === 0 ? null : ((current - benchmark) / Math.abs(benchmark)) * 100;
  }
  if (value == null) return { value: null, unit, tone: "neutral" };

  // Spend en frequentie zijn niet "goed" of "slecht" — die duidt de gebruiker zelf.
  const neutral = key === "spend" || key === "frequency";
  const rising = value >= 0;
  const favourable = LOWER_IS_BETTER.has(key as string) ? !rising : rising;
  return { value, unit, tone: neutral ? "neutral" : favourable ? "good" : "bad" };
}

/** Haalt de vergelijkingsbasis op die bij de gekozen benchmark hoort. */
export function benchmarkMetrics(
  data: PaidAdsResponse,
  benchmark: BenchmarkKey
): DerivedMetrics | null {
  if (benchmark === "previous") {
    return data.benchmarks.previous ? derive(data.benchmarks.previous) : null;
  }
  if (benchmark === "yearAgo") {
    return data.benchmarks.yearAgo ? derive(data.benchmarks.yearAgo) : null;
  }
  // Doelstelling: alleen de KPI's waarvoor een doel is vastgelegd.
  const t = data.targets;
  if (t.results == null && t.costPerResult == null && t.ctr == null) return null;
  return {
    ...emptyMetrics(),
    spend: t.budget ?? 0,
    results: t.results ?? 0,
    frequency: null,
    ctr: t.ctr,
    cpc: t.cpc,
    cvr: t.cvr,
    costPerResult: t.costPerResult,
    cpm: null,
  };
}

export const BENCHMARK_LABELS: Record<BenchmarkKey, string> = {
  previous: "Vorige periode",
  yearAgo: "Vorig jaar",
  target: "Doelstelling",
};

/* ---------- Filters ---------- */

export interface PaidFilters {
  phase: PaidPhase | "alles";
  businessUnit: string;
  objective: string;
  platform: PaidPlatform | "alles";
  query: string;
}

export const EMPTY_FILTERS: PaidFilters = {
  phase: "alles",
  businessUnit: "alles",
  objective: "alles",
  platform: "alles",
  query: "",
};

export function filterCampaigns(
  campaigns: PaidAdsCampaign[],
  f: PaidFilters
): PaidAdsCampaign[] {
  const q = f.query.trim().toLowerCase();
  return campaigns.filter((c) => {
    if (f.phase !== "alles" && c.phase !== f.phase) return false;
    if (f.businessUnit !== "alles" && c.businessUnit !== f.businessUnit) return false;
    if (f.objective !== "alles" && c.objective !== f.objective) return false;
    if (f.platform !== "alles" && c.platform !== f.platform) return false;
    if (q) {
      const haystack = `${c.name} ${PLATFORM_LABELS[c.platform]} ${c.businessUnit}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/** Unieke waarden voor de keuzelijsten, in de volgorde waarin ze voorkomen. */
export function optionsFrom<T>(items: T[], pick: (item: T) => string | null): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    const value = pick(item);
    if (value) seen.add(value);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "nl"));
}

/* ---------- Campagnescore ---------- */

export interface ScoredCampaign extends PaidAdsCampaign {
  derived: DerivedMetrics;
  /** 0-100, genormaliseerd binnen de eigen funnelfase. `null` bij te weinig data. */
  score: number | null;
  scoreTone: Tone;
}

/**
 * Score per funnelfase. Een bereikcampagne wordt alleen met andere
 * bereikcampagnes vergeleken: een CPA van € 0,02 voor bereik zegt niets over
 * een conversiecampagne. Weging CTR 20% · CPC 20% · CVR 30% · CPA 30%.
 */
export const SCORE_WEIGHTS = { ctr: 20, cpc: 20, cvr: 30, costPerResult: 30 } as const;

export function scoreCampaigns(campaigns: PaidAdsCampaign[]): ScoredCampaign[] {
  const rows: ScoredCampaign[] = campaigns.map((c) => ({
    ...c,
    derived: derive(c.metrics),
    score: null,
    scoreTone: "neutral",
  }));

  for (const phase of ["bereik", "verkeer", "conversie"] as PaidPhase[]) {
    const group = rows.filter((r) => r.phase === phase);
    // Onder de twee campagnes valt er niets te normaliseren: alles zou 50 worden.
    if (group.length < 2) continue;

    const normalizer = (key: keyof DerivedMetrics, lowerIsBetter = false) => {
      const values = group
        .map((r) => r.derived[key])
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      if (values.length < 2) return null;
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      if (hi === lo) return null;
      return (v: number | null) => {
        if (v == null || !Number.isFinite(v)) return null;
        return lowerIsBetter ? (hi - v) / (hi - lo) : (v - lo) / (hi - lo);
      };
    };

    const norms = {
      ctr: normalizer("ctr"),
      cpc: normalizer("cpc", true),
      cvr: normalizer("cvr"),
      costPerResult: normalizer("costPerResult", true),
    };

    for (const row of group) {
      let total = 0;
      let weight = 0;
      for (const [key, w] of Object.entries(SCORE_WEIGHTS) as [
        keyof typeof SCORE_WEIGHTS,
        number,
      ][]) {
        const norm = norms[key];
        if (!norm) continue;
        const n = norm(row.derived[key]);
        if (n == null) continue;
        total += n * w;
        weight += w;
      }
      // Hergewogen naar 100 zodat een ontbrekende metric de score niet indrukt.
      if (weight === 0) continue;
      row.score = Math.round((total / weight) * 100);
      row.scoreTone = toneForScore(row.score);
    }
  }

  const phaseOrder: Record<PaidPhase, number> = { conversie: 0, verkeer: 1, bereik: 2 };
  rows.sort(
    (a, b) =>
      phaseOrder[a.phase] - phaseOrder[b.phase] ||
      (b.score ?? -1) - (a.score ?? -1) ||
      b.metrics.spend - a.metrics.spend
  );
  return rows;
}

export function toneForScore(score: number): Tone {
  return score >= 70 ? "good" : score >= 45 ? "warn" : "bad";
}

/** Tone voor een CPA ten opzichte van het gemiddelde over alle campagnes. */
export function toneForCpa(cpa: number | null, benchmark: number | null): Tone {
  if (cpa == null || benchmark == null || benchmark <= 0) return "neutral";
  if (cpa <= benchmark * 0.8) return "good";
  if (cpa <= benchmark * 1.3) return "warn";
  return "bad";
}

export function toneForFrequency(frequency: number | null): Tone {
  if (frequency == null) return "neutral";
  if (frequency < 3) return "good";
  if (frequency <= 6) return "warn";
  return "bad";
}

/* ---------- Groeperingen ---------- */

export interface GroupRow {
  key: string;
  label: string;
  metrics: PaidMetrics;
  derived: DerivedMetrics;
  /** Aandeel in het totaal bestede bedrag, 0-100. */
  spendShare: number;
}

function groupBy<T extends { metrics: PaidMetrics }>(
  items: T[],
  key: (item: T) => string | null,
  label: (k: string) => string
): GroupRow[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    const list = buckets.get(k);
    if (list) list.push(item);
    else buckets.set(k, [item]);
  }
  const totalSpend = [...buckets.values()]
    .flat()
    .reduce((sum, i) => sum + i.metrics.spend, 0);

  return [...buckets.entries()]
    .map(([k, list]) => {
      const metrics = sumMetrics(list);
      return {
        key: k,
        label: label(k),
        metrics,
        derived: derive(metrics),
        spendShare: totalSpend > 0 ? (metrics.spend / totalSpend) * 100 : 0,
      };
    })
    .sort((a, b) => b.metrics.spend - a.metrics.spend);
}

export function byPlatform(campaigns: PaidAdsCampaign[]): GroupRow[] {
  return groupBy(
    campaigns,
    (c) => c.platform,
    (k) => PLATFORM_LABELS[k as PaidPlatform] ?? k
  );
}

export function byBusinessUnit(campaigns: PaidAdsCampaign[]): GroupRow[] {
  return groupBy(campaigns, (c) => c.businessUnit, (k) => k);
}

export function byPhase(campaigns: PaidAdsCampaign[]): GroupRow[] {
  return groupBy(campaigns, (c) => c.phase, (k) => PHASE_LABELS[k as PaidPhase] ?? k);
}

export function byFormat(ads: PaidAdsAd[]): GroupRow[] {
  return groupBy(ads, (a) => a.format, (k) => k);
}

export function byAudienceType(adSets: PaidAdsAdSet[]): GroupRow[] {
  return groupBy(
    adSets,
    (s) => s.audienceType,
    (k) => AUDIENCE_LABELS[k as AudienceType] ?? k
  );
}

/** Campagnes die onder dezelfde overkoepelende naam op meerdere kanalen draaien. */
export function campaignGroups(campaigns: PaidAdsCampaign[]): string[] {
  return optionsFrom(campaigns, (c) => c.campaignGroup);
}

/* ---------- Exploitatie tegen doelstelling ---------- */

export interface BusinessUnitRow extends GroupRow {
  /** CPA-doel voor deze exploitatie. */
  target: number | null;
  /** 100 = op doelstelling. Lager dan 100 betekent een te hoge CPA. */
  index: number | null;
  tone: Tone;
  status: string;
}

export function businessUnitPerformance(
  campaigns: PaidAdsCampaign[],
  targets: PaidAdsTargets
): BusinessUnitRow[] {
  return byBusinessUnit(campaigns).map((row) => {
    const target = targets.byBusinessUnit[row.key] ?? null;
    const cpa = row.derived.costPerResult;
    // Index = doel / werkelijk: een CPA onder het doel geeft een index boven 100.
    const index = target != null && cpa != null && cpa > 0 ? Math.round((target / cpa) * 100) : null;
    const tone: Tone =
      index == null ? "neutral" : index >= 100 ? "good" : index >= 85 ? "warn" : "bad";
    return {
      ...row,
      target,
      index,
      tone,
      status:
        index == null
          ? "Geen doel"
          : index >= 100
            ? "Op koers"
            : index >= 85
              ? "Aandacht"
              : "Achter",
    };
  });
}

/* ---------- KPI's tegen doelstelling ---------- */

export interface TargetRow {
  label: string;
  actual: string;
  target: string | null;
  onTrack: boolean | null;
}

export function targetRows(
  totals: DerivedMetrics,
  targets: PaidAdsTargets,
  fmt: {
    eur: (v: number | null, d?: number) => string;
    nl: (v: number | null, d?: number) => string;
    pct: (v: number | null, d?: number) => string;
  }
): TargetRow[] {
  const rows: TargetRow[] = [
    {
      label: "Besteed bedrag",
      actual: fmt.eur(totals.spend),
      target: targets.budget != null ? `≤ ${fmt.eur(targets.budget)}` : null,
      onTrack: targets.budget != null ? totals.spend <= targets.budget : null,
    },
    {
      label: "Resultaten",
      actual: fmt.nl(totals.results),
      target: targets.results != null ? `≥ ${fmt.nl(targets.results)}` : null,
      onTrack: targets.results != null ? totals.results >= targets.results : null,
    },
    {
      label: "Kosten per resultaat",
      actual: fmt.eur(totals.costPerResult, 2),
      target: targets.costPerResult != null ? `≤ ${fmt.eur(targets.costPerResult, 2)}` : null,
      onTrack:
        targets.costPerResult != null && totals.costPerResult != null
          ? totals.costPerResult <= targets.costPerResult
          : null,
    },
    {
      label: "CTR",
      actual: fmt.pct(totals.ctr),
      target: targets.ctr != null ? `≥ ${fmt.pct(targets.ctr)}` : null,
      onTrack: targets.ctr != null && totals.ctr != null ? totals.ctr >= targets.ctr : null,
    },
    {
      label: "Conversieratio",
      actual: fmt.pct(totals.cvr),
      target: targets.cvr != null ? `≥ ${fmt.pct(targets.cvr)}` : null,
      onTrack: targets.cvr != null && totals.cvr != null ? totals.cvr >= targets.cvr : null,
    },
    {
      label: "CPC",
      actual: fmt.eur(totals.cpc, 2),
      target: targets.cpc != null ? `≤ ${fmt.eur(targets.cpc, 2)}` : null,
      onTrack: targets.cpc != null && totals.cpc != null ? totals.cpc <= targets.cpc : null,
    },
  ];
  return rows;
}

/* ---------- Funnel ---------- */

export interface FunnelStep {
  label: string;
  value: number;
  /** Breedte van de balk, 0-100, ten opzichte van de eerste stap. */
  width: number;
  /** Doorstroom vanaf de vorige stap. */
  step: string | null;
}

export function funnelSteps(totals: DerivedMetrics, fmt: { pct: (v: number | null) => string }): FunnelStep[] {
  const top = totals.impressions;
  const width = (v: number) => (top > 0 ? Math.max(2, (v / top) * 100) : 0);
  return [
    { label: "Weergaven", value: totals.impressions, width: width(totals.impressions), step: null },
    { label: "Clicks", value: totals.clicks, width: width(totals.clicks), step: `CTR ${fmt.pct(totals.ctr)}` },
    { label: "Resultaten", value: totals.results, width: width(totals.results), step: `CVR ${fmt.pct(totals.cvr)}` },
  ];
}

/* ---------- Forecast ---------- */

export interface ForecastRow {
  label: string;
  now: number | null;
  expected: number | null;
  /** 0 decimalen voor aantallen, 2 voor bedragen per stuk. */
  kind: "eur" | "number" | "eur2";
}

/**
 * Lineaire projectie naar het einde van de periode: wat er tot nu toe per dag
 * binnenkwam, doorgetrokken over de resterende dagen. Bewust simpel — een
 * zwaarder model suggereert een precisie die er niet is.
 */
export function forecastRows(totals: DerivedMetrics, daysElapsed: number, daysTotal: number): ForecastRow[] {
  const factor = daysElapsed > 0 && daysTotal > daysElapsed ? daysTotal / daysElapsed : null;
  const project = (v: number | null) => (v == null || factor == null ? null : v * factor);
  return [
    { label: "Besteed bedrag", now: totals.spend, expected: project(totals.spend), kind: "eur" },
    { label: "Resultaten", now: totals.results, expected: project(totals.results), kind: "number" },
    // De CPA verandert niet mee: die is een verhouding, geen totaal.
    { label: "Kosten per resultaat", now: totals.costPerResult, expected: totals.costPerResult, kind: "eur2" },
    { label: "Bereik", now: totals.reach, expected: project(totals.reach), kind: "number" },
  ];
}

/* ---------- Top advertenties, winnaars en verliezers ---------- */

export interface RankedAd {
  id: string;
  name: string;
  platform: PaidPlatform;
  phase: PaidPhase;
  results: number;
  derived: DerivedMetrics;
  /** Balkbreedte 0-100 ten opzichte van de hoogste in de lijst. */
  width: number;
}

export function topAdsByCtr(ads: PaidAdsAd[], limit = 10): RankedAd[] {
  const scored = ads
    .map((a) => ({ ...a, derived: derive(a.metrics) }))
    .filter((a) => a.derived.ctr != null && a.metrics.impressions > 0)
    .sort((a, b) => (b.derived.ctr ?? 0) - (a.derived.ctr ?? 0))
    .slice(0, limit);
  const max = scored[0]?.derived.ctr ?? 0;
  return scored.map((a) => ({
    id: a.id,
    name: a.name,
    platform: a.platform,
    phase: a.phase,
    results: a.metrics.results,
    derived: a.derived,
    width: max > 0 ? ((a.derived.ctr ?? 0) / max) * 100 : 0,
  }));
}

export interface Highlight {
  name: string;
  platform: string;
  why: string;
  tone: Tone;
}

/**
 * Winnaars en verliezers over de campagnes die een score kregen. Er wordt niets
 * getoond zolang er te weinig campagnes zijn om zinnig te ranken.
 */
export function winnersAndLosers(
  scored: ScoredCampaign[],
  avgCpa: number | null,
  fmt: { eur: (v: number | null, d?: number) => string; pct: (v: number | null, d?: number) => string }
): { winners: Highlight[]; losers: Highlight[] } {
  const ranked = scored.filter((c) => c.score != null);
  if (ranked.length < 4) return { winners: [], losers: [] };

  const describe = (c: ScoredCampaign): string => {
    const parts: string[] = [];
    if (c.derived.costPerResult != null) {
      const relative =
        avgCpa != null && avgCpa > 0
          ? ` · ${Math.abs(Math.round(((c.derived.costPerResult - avgCpa) / avgCpa) * 100))}% ${
              c.derived.costPerResult < avgCpa ? "onder" : "boven"
            } gemiddeld`
          : "";
      parts.push(`CPA ${fmt.eur(c.derived.costPerResult, 2)}${relative}`);
    }
    if (c.derived.ctr != null) parts.push(`CTR ${fmt.pct(c.derived.ctr)}`);
    return parts.join(" · ") || `Score ${c.score}`;
  };

  const sorted = [...ranked].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return {
    winners: sorted.slice(0, 3).map((c) => ({
      name: c.name,
      platform: PLATFORM_LABELS[c.platform],
      why: describe(c),
      tone: "good" as Tone,
    })),
    losers: sorted
      .slice(-3)
      .reverse()
      .map((c) => ({
        name: c.name,
        platform: PLATFORM_LABELS[c.platform],
        why: describe(c),
        tone: "bad" as Tone,
      })),
  };
}

/* ---------- Budget opportunities ---------- */

export interface BudgetOpportunity {
  type: "Opschalen" | "Afbouwen";
  name: string;
  platform: string;
  why: string;
  /** Voorgestelde verschuiving in euro's; positief bij opschalen. */
  amount: number;
  tone: Tone;
}

/**
 * Verschuiving binnen hetzelfde totaalbudget: haal weg bij de campagnes met de
 * hoogste CPA, leg bij bij de laagste. Het voorstel is een tiende van het
 * bestede bedrag van de campagne — genoeg om verschil te maken, klein genoeg om
 * de campagne niet uit balans te trekken.
 *
 * Alleen campagnes die er duidelijk naast zitten komen in aanmerking: een CPA
 * die 5% van het gemiddelde afwijkt is ruis, geen aanleiding om budget te
 * verschuiven.
 */
/** Minimale afwijking van het gemiddelde voordat een verschuiving zinnig is. */
const MIN_GAP_PCT = 15;

export function budgetOpportunities(
  scored: ScoredCampaign[],
  avgCpa: number | null,
  limit = 3
): BudgetOpportunity[] {
  const eligible = scored.filter(
    (c) => CONVERSION_OBJECTIVES.includes(c.objective) && c.derived.costPerResult != null && c.metrics.spend > 0
  );
  if (eligible.length < 4 || avgCpa == null || avgCpa <= 0) return [];

  const byCpa = [...eligible].sort(
    (a, b) => (a.derived.costPerResult ?? 0) - (b.derived.costPerResult ?? 0)
  );
  const share = (c: ScoredCampaign) => Math.round((c.metrics.spend * 0.1) / 50) * 50;
  const gap = (c: ScoredCampaign) =>
    Math.abs(Math.round((((c.derived.costPerResult ?? 0) - avgCpa) / avgCpa) * 100));

  const up: BudgetOpportunity[] = byCpa
    .filter((c) => gap(c) >= MIN_GAP_PCT && (c.derived.costPerResult ?? 0) < avgCpa)
    .slice(0, limit)
    .map((c) => ({
      type: "Opschalen" as const,
      name: c.name,
      platform: PLATFORM_LABELS[c.platform],
      why: `CPA ${gap(c)}% onder gemiddeld`,
      amount: share(c),
      tone: "good" as Tone,
    }));

  const down: BudgetOpportunity[] = [...byCpa]
    .reverse()
    .filter((c) => gap(c) >= MIN_GAP_PCT && (c.derived.costPerResult ?? 0) > avgCpa)
    .slice(0, limit)
    .map((c) => ({
      type: "Afbouwen" as const,
      name: c.name,
      platform: PLATFORM_LABELS[c.platform],
      why: `CPA ${gap(c)}% boven gemiddeld`,
      amount: -share(c),
      tone: "bad" as Tone,
    }));

  return [...up, ...down];
}

/* ---------- Verzadiging ---------- */

export interface SaturationRow {
  name: string;
  platform: string;
  frequency: number;
  tone: Tone;
  status: string;
}

export function saturation(campaigns: PaidAdsCampaign[], limit = 6): SaturationRow[] {
  return campaigns
    .map((c) => ({ campaign: c, frequency: derive(c.metrics).frequency }))
    .filter((r): r is { campaign: PaidAdsCampaign; frequency: number } => r.frequency != null)
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, limit)
    .map(({ campaign, frequency }) => {
      const tone = toneForFrequency(frequency);
      return {
        name: campaign.name,
        platform: PLATFORM_LABELS[campaign.platform],
        frequency,
        tone,
        status: tone === "good" ? "Gezond" : tone === "warn" ? "Refresh" : "Vervangen",
      };
    });
}

/* ---------- Hook performance ---------- */

export interface HookRow {
  label: string;
  /** Aandeel van de weergaven dat langer dan 3 seconden keek. */
  rate: number | null;
  costPerResult: number | null;
  tone: Tone;
}

export function hookPerformance(ads: PaidAdsAd[], avgCpa: number | null): HookRow[] {
  const buckets = new Map<string, { views3s: number; impressions: number; metrics: PaidAdsAd[] }>();
  for (const ad of ads) {
    if (!ad.hook || ad.videoViews3s == null) continue;
    const bucket = buckets.get(ad.hook) ?? { views3s: 0, impressions: 0, metrics: [] };
    bucket.views3s += ad.videoViews3s;
    bucket.impressions += ad.metrics.impressions;
    bucket.metrics.push(ad);
    buckets.set(ad.hook, bucket);
  }
  return [...buckets.entries()]
    .map(([label, bucket]) => {
      const d = derive(sumMetrics(bucket.metrics));
      const rate = mul100(div(bucket.views3s, bucket.impressions));
      return {
        label,
        rate,
        costPerResult: d.costPerResult,
        tone: toneForCpa(d.costPerResult, avgCpa),
      };
    })
    .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
}

/* ---------- Performance quadrant ---------- */

export interface QuadrantPoint {
  id: string;
  name: string;
  platform: PaidPlatform;
  /** CPA op de x-as. */
  costPerResult: number;
  /** Aantal conversies op de y-as. */
  results: number;
  /** Bereik bepaalt de bolgrootte. */
  reach: number;
  spend: number;
}

export interface Quadrant {
  points: QuadrantPoint[];
  /** Assen lopen tot deze waarden. */
  maxCpa: number;
  maxResults: number;
  maxReach: number;
  /** Scheidslijnen: gemiddelde CPA en mediaan aantal conversies. */
  splitCpa: number;
  splitResults: number;
}

export function quadrant(scored: ScoredCampaign[], avgCpa: number | null): Quadrant | null {
  const points = scored
    .filter(
      (c) =>
        CONVERSION_OBJECTIVES.includes(c.objective) &&
        c.derived.costPerResult != null &&
        c.metrics.results > 0
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      platform: c.platform,
      costPerResult: c.derived.costPerResult as number,
      results: c.metrics.results,
      reach: c.metrics.reach,
      spend: c.metrics.spend,
    }));
  if (points.length < 3) return null;

  const maxCpa = Math.max(...points.map((p) => p.costPerResult)) * 1.1;
  const maxResults = Math.max(...points.map((p) => p.results)) * 1.1;
  const maxReach = Math.max(...points.map((p) => p.reach), 1);
  const sortedResults = [...points].map((p) => p.results).sort((a, b) => a - b);
  const splitResults = sortedResults[Math.floor(sortedResults.length / 2)];
  return {
    points,
    maxCpa,
    maxResults,
    maxReach,
    splitCpa: avgCpa ?? maxCpa / 2,
    splitResults,
  };
}

/* ---------- Quick insights ---------- */

export interface QuickInsight {
  tone: Tone;
  text: string;
}

/**
 * Regels die zonder model op te halen zijn. Elke regel controleert eerst of de
 * onderliggende cijfers er zijn — liever geen inzicht dan een inzicht over
 * ontbrekende data.
 */
export function quickInsights(
  scored: ScoredCampaign[],
  platforms: GroupRow[],
  totals: DerivedMetrics,
  benchmarkLabel: string,
  deltas: { results: Delta; cvr: Delta },
  fmt: {
    eur: (v: number | null, d?: number) => string;
    pct: (v: number | null, d?: number) => string;
    signed: (v: number | null, u?: "%" | "pp" | "") => string;
  }
): QuickInsight[] {
  const out: QuickInsight[] = [];

  if (deltas.results.value != null && deltas.cvr.value != null) {
    out.push({
      tone: deltas.results.value >= 0 ? "good" : "warn",
      text: `Resultaten ${fmt.signed(deltas.results.value)} en conversieratio ${fmt.signed(
        deltas.cvr.value,
        "pp"
      )} versus ${benchmarkLabel.toLowerCase()}.`,
    });
  }

  // Een platform dat meer conversies levert dan zijn budgetaandeel doet vermoeden.
  const totalResults = platforms.reduce((s, p) => s + p.metrics.results, 0);
  if (totalResults > 0 && platforms.length > 1) {
    for (const p of platforms) {
      const resultShare = (p.metrics.results / totalResults) * 100;
      if (resultShare - p.spendShare >= 5) {
        out.push({
          tone: "good",
          text: `${p.label} krijgt ${Math.round(p.spendShare)}% van het budget maar levert ${Math.round(
            resultShare
          )}% van alle resultaten — ruimte om op te schalen.`,
        });
        break;
      }
    }
  }

  const cheapest = scored
    .filter((c) => CONVERSION_OBJECTIVES.includes(c.objective) && c.derived.costPerResult != null)
    .sort((a, b) => (a.derived.costPerResult ?? 0) - (b.derived.costPerResult ?? 0))[0];
  if (cheapest) {
    out.push({
      tone: "good",
      text: `Laagste CPA: “${cheapest.name}” op ${fmt.eur(cheapest.derived.costPerResult, 2)}.`,
    });
  }

  const saturated = scored.filter((c) => (c.derived.frequency ?? 0) > 3.5);
  if (saturated.length > 0) {
    const peak = saturated.sort((a, b) => (b.derived.frequency ?? 0) - (a.derived.frequency ?? 0))[0];
    out.push({
      tone: "warn",
      text: `Frequentie boven 3,5 op ${saturated.length} ${
        saturated.length === 1 ? "campagne" : "campagnes"
      } (piek ${(peak.derived.frequency ?? 0).toLocaleString("nl-NL", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} bij ${peak.name}) — creative refresh nodig.`,
    });
  }

  if (totals.costPerResult != null) {
    const worst = scored
      .filter((c) => CONVERSION_OBJECTIVES.includes(c.objective) && c.derived.costPerResult != null)
      .sort((a, b) => (b.derived.costPerResult ?? 0) - (a.derived.costPerResult ?? 0))[0];
    if (worst && (worst.derived.costPerResult ?? 0) > totals.costPerResult * 1.5) {
      const over = Math.round(
        (((worst.derived.costPerResult ?? 0) - totals.costPerResult) / totals.costPerResult) * 100
      );
      out.push({
        tone: "warn",
        text: `“${worst.name}” kost ${fmt.eur(worst.derived.costPerResult, 2)} per resultaat — ${over}% boven het gemiddelde van ${fmt.eur(
          totals.costPerResult,
          2
        )}.`,
      });
    }
  }

  return out;
}
