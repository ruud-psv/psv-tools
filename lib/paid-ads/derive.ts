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
  PaidAdsCampaignDay,
  PaidAdsDailyPoint,
  PaidAdsDemographic,
  PaidAdsResponse,
  PaidAdsTargets,
  PaidAdsWeeklyPoint,
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
    acc.revenue += item.metrics.revenue;
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
  /**
   * Omzet per bestede euro. `null` zonder omzet: een rij van een platform dat
   * geen waarde levert heeft geen ROAS van 0. Voor totalen over meerdere
   * campagnes geldt `roasOf`, die daar zorgvuldiger mee omgaat.
   */
  roas: number | null;
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
    roas: m.revenue > 0 ? div(m.revenue, m.spend) : null,
  };
}

/**
 * ROAS over een groep campagnes. Telt mee: elke campagne met omzet, plus de
 * aankoopcampagnes zonder omzet op platforms die wél een waarde leveren (die
 * hebben echt niets verkocht). Leadcampagnes zonder omzet en platforms zonder
 * omzetdata blijven erbuiten — anders drukt hun budget de ROAS kunstmatig.
 */
export function roasOf(
  campaigns: PaidAdsCampaign[],
  revenuePlatforms: PaidPlatform[]
): number | null {
  const relevant = campaigns.filter(
    (c) =>
      c.metrics.revenue > 0 ||
      (c.objective === "Aankopen" && revenuePlatforms.includes(c.platform))
  );
  const m = sumMetrics(relevant);
  return relevant.length > 0 ? div(m.revenue, m.spend) : null;
}

/** Totalen over campagnes, met ROAS volgens `roasOf`. */
export function totalsOf(
  campaigns: PaidAdsCampaign[],
  revenuePlatforms: PaidPlatform[]
): DerivedMetrics {
  return { ...derive(sumMetrics(campaigns)), roas: roasOf(campaigns, revenuePlatforms) };
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
    return data.benchmarks.previousCampaigns
      ? totalsOf(data.benchmarks.previousCampaigns, data.revenuePlatforms)
      : null;
  }
  if (benchmark === "yearAgo") {
    return data.benchmarks.yearAgoCampaigns
      ? totalsOf(data.benchmarks.yearAgoCampaigns, data.revenuePlatforms)
      : null;
  }
  // Doelstelling: alleen de KPI's waarvoor een doel is vastgelegd.
  const t = data.targets;
  if (t.results == null && t.costPerResult == null && t.ctr == null && t.roas == null) return null;
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
    roas: t.roas,
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
  /** Gekozen campagnes als `platform:id`; leeg is alles. */
  campaigns: string[];
  /** Gekozen advertentiesets als `platform:id`; leeg is alles. */
  adSets: string[];
}

export const EMPTY_FILTERS: PaidFilters = {
  phase: "alles",
  businessUnit: "alles",
  objective: "alles",
  platform: "alles",
  query: "",
  campaigns: [],
  adSets: [],
};

/** Sleutel voor een campagne of advertentieset; id's zijn alleen binnen hun platform uniek. */
export function itemKey(item: { platform: PaidPlatform; id: string }): string {
  return `${item.platform}:${item.id}`;
}

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
    if (f.campaigns.length > 0 && !f.campaigns.includes(itemKey(c))) return false;
    if (q) {
      const haystack = `${c.name} ${PLATFORM_LABELS[c.platform]} ${c.businessUnit}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/** Dezelfde filters zonder fasekeuze — de funnel toont alle fases naast elkaar. */
export function withoutPhase(f: PaidFilters): PaidFilters {
  return { ...f, phase: "alles" };
}

/** Sleutel voor een campagne; id's zijn alleen binnen hun eigen platform uniek. */
function campaignKey(platform: PaidPlatform, campaignId: string): string {
  return `${platform}:${campaignId}`;
}

/**
 * De respons zoals de weergaven hem zien wanneer er gefilterd is. Niet alleen
 * de campagnelijst: ook advertentiesets, advertenties, de dag- en weekreeks en
 * de vergelijkingsperiodes volgen de filters. Anders toont een grafiek onder
 * "Conversie" nog steeds het budget van alle fases, en vergelijkt een KPI-tegel
 * één fase met het totaal van vorige periode.
 *
 * De API-route gebruikt dezelfde functie zonder filters om de totalen op te
 * bouwen, zodat er maar één rekenpad is.
 */
export function narrowResponse(data: PaidAdsResponse, f: PaidFilters): PaidAdsResponse {
  let campaigns = filterCampaigns(data.campaigns, f);
  const keep = new Set(campaigns.map((c) => campaignKey(c.platform, c.id)));
  const kept = (row: { platform: PaidPlatform; campaignId: string }) =>
    keep.has(campaignKey(row.platform, row.campaignId));

  let adSets = data.adSets.filter(kept);
  let ads = data.ads.filter(kept);
  let demographics = data.demographics.filter(kept);
  const bySet = f.adSets.length > 0;

  if (bySet) {
    // Alleen de gekozen advertentiesets. De campagnes erboven tellen dan alleen
    // die sets mee, zodat de KPI's over precies de selectie gaan.
    const chosen = new Set(f.adSets);
    adSets = adSets.filter((s) => chosen.has(itemKey(s)));
    ads = ads.filter((a) => chosen.has(`${a.platform}:${a.adSetId}`));
    demographics = demographics.filter((d) => chosen.has(`${d.platform}:${d.adSetId}`));
    campaigns = campaigns
      .map((c) => {
        const own = adSets.filter((s) => s.platform === c.platform && s.campaignId === c.id);
        return own.length > 0 ? { ...c, metrics: sumMetrics(own) } : null;
      })
      .filter((c): c is PaidAdsCampaign => c !== null);
  }

  // Dagreeks en vergelijkingsperiodes bestaan alleen op campagneniveau. Bij een
  // selectie van advertentiesets tonen de grafieken de bovenliggende
  // campagnes, en vervalt de vergelijking: een paar sets afzetten tegen hele
  // campagnes van vorige periode zou een vertekend verschil geven.
  const parents = new Set(campaigns.map((c) => campaignKey(c.platform, c.id)));
  const campaignDaily = data.campaignDaily.filter((d) =>
    parents.has(campaignKey(d.platform, d.campaignId))
  );
  const { daily, weekly } = timeSeries(campaignDaily);

  const previousCampaigns =
    data.benchmarks.previousCampaigns && !bySet
      ? filterCampaigns(data.benchmarks.previousCampaigns, f)
      : null;
  const yearAgoCampaigns =
    data.benchmarks.yearAgoCampaigns && !bySet
      ? filterCampaigns(data.benchmarks.yearAgoCampaigns, f)
      : null;

  return {
    ...data,
    campaigns,
    adSets,
    ads,
    demographics,
    campaignDaily,
    daily,
    weekly,
    benchmarks: {
      previous: previousCampaigns ? sumMetrics(previousCampaigns) : null,
      yearAgo: yearAgoCampaigns ? sumMetrics(yearAgoCampaigns) : null,
      previousByPlatform: previousCampaigns ? metricsByPlatform(previousCampaigns) : {},
      previousCampaigns,
      yearAgoCampaigns,
    },
  };
}

function metricsByPlatform(
  campaigns: PaidAdsCampaign[]
): Partial<Record<PaidPlatform, PaidMetrics>> {
  const out: Partial<Record<PaidPlatform, PaidMetrics>> = {};
  for (const row of byPlatform(campaigns)) {
    out[row.key as PaidPlatform] = row.metrics;
  }
  return out;
}

/* ---------- Tijdreeks ---------- */

const DAY_MS = 86_400_000;

/** ISO-weeknummer; week 1 is de week met de eerste donderdag van het jaar. */
function isoWeek(iso: string): { year: number; week: number } {
  const target = new Date(`${iso}T00:00:00.000Z`);
  // Naar de donderdag van deze week: dan bepaalt het jaartal van die dag het weekjaar.
  const day = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return { year: target.getUTCFullYear(), week };
}

/**
 * Campagnedagen naar de dag- en weekgrafiek: per dag besteding en resultaten,
 * per week CTR in procenten en kosten per resultaat in euro's.
 */
export function timeSeries(points: PaidAdsCampaignDay[]): {
  daily: PaidAdsDailyPoint[];
  weekly: PaidAdsWeeklyPoint[];
} {
  const byDate = new Map<string, { metrics: PaidMetrics }[]>();
  for (const point of points) {
    const list = byDate.get(point.date);
    if (list) list.push(point);
    else byDate.set(point.date, [point]);
  }
  const days = [...byDate.entries()]
    .map(([date, list]) => ({ date, metrics: sumMetrics(list) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byWeek = new Map<string, { label: string; days: { metrics: PaidMetrics }[] }>();
  for (const day of days) {
    const { year, week } = isoWeek(day.date);
    const key = `${year}-${String(week).padStart(2, "0")}`;
    const entry = byWeek.get(key) ?? { label: `wk ${week}`, days: [] };
    entry.days.push(day);
    byWeek.set(key, entry);
  }

  return {
    daily: days.map(({ date, metrics }) => ({ date, spend: metrics.spend, results: metrics.results })),
    weekly: [...byWeek.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, { label, days: list }]) => {
        const d = derive(sumMetrics(list));
        return { week: label, ctr: d.ctr ?? 0, costPerResult: d.costPerResult ?? 0 };
      }),
  };
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
  /**
   * 0-100, ten opzichte van campagnes in dezelfde fase én exploitatie. `null`
   * zonder vergelijkingsmateriaal: een ticketingcampagne wordt niet afgezet
   * tegen een PSV Connect-campagne.
   */
  score: number | null;
  scoreTone: Tone;
}

type ScoreMetric = "ctr" | "cpc" | "cpm" | "cvr" | "costPerResult" | "roas";

/**
 * Gewichten per fase: elke fase wordt beoordeeld op waar hij voor bedoeld is.
 * Een bereikcampagne op CPA beoordelen zegt niets; een conversiecampagne op
 * CPM ook niet. Ontbreekt een metric (geen ROAS bij leads, geen bereik bij
 * Google), dan wordt de rest herwogen naar 100.
 */
export const SCORE_WEIGHTS: Record<PaidPhase, Partial<Record<ScoreMetric, number>>> = {
  bereik: { cpm: 60, ctr: 40 },
  verkeer: { cpc: 50, ctr: 50 },
  conversie: { costPerResult: 40, roas: 30, cvr: 20, ctr: 10 },
};

const SCORE_LABELS: Record<ScoreMetric, string> = {
  ctr: "CTR",
  cpc: "CPC",
  cpm: "CPM",
  cvr: "CVR",
  costPerResult: "CPA",
  roas: "ROAS",
};

/** Lager is beter voor kosten; hoger voor CTR, CVR en ROAS. */
const SCORE_LOWER_IS_BETTER = new Set<ScoreMetric>(["cpc", "cpm", "costPerResult"]);

/** "CPM 60% · CTR 40%" — voor de uitleg bij de score. */
export function scoreWeightsLabel(phase: PaidPhase): string {
  return Object.entries(SCORE_WEIGHTS[phase])
    .map(([key, weight]) => `${SCORE_LABELS[key as ScoreMetric]} ${weight}%`)
    .join(" · ");
}

/** Vergelijkingsgroep: zelfde fase, zelfde exploitatie. */
function peerKey(c: { phase: PaidPhase; businessUnit: string }): string {
  return `${c.phase}|${c.businessUnit}`;
}

export function scoreCampaigns(campaigns: PaidAdsCampaign[]): ScoredCampaign[] {
  const rows: ScoredCampaign[] = campaigns.map((c) => ({
    ...c,
    derived: derive(c.metrics),
    score: null,
    scoreTone: "neutral",
  }));

  const groups = new Map<string, ScoredCampaign[]>();
  for (const row of rows) {
    const list = groups.get(peerKey(row));
    if (list) list.push(row);
    else groups.set(peerKey(row), [row]);
  }

  for (const group of groups.values()) {
    // Onder de twee campagnes valt er niets te normaliseren: alles zou 50 worden.
    if (group.length < 2) continue;
    const weights = SCORE_WEIGHTS[group[0].phase];

    const normalizer = (key: ScoreMetric) => {
      const values = group
        .map((r) => r.derived[key])
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      if (values.length < 2) return null;
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      if (hi === lo) return null;
      const lowerIsBetter = SCORE_LOWER_IS_BETTER.has(key);
      return (v: number | null) => {
        if (v == null || !Number.isFinite(v)) return null;
        return lowerIsBetter ? (hi - v) / (hi - lo) : (v - lo) / (hi - lo);
      };
    };

    const norms = Object.keys(weights).map((key) => ({
      key: key as ScoreMetric,
      weight: weights[key as ScoreMetric] ?? 0,
      norm: normalizer(key as ScoreMetric),
    }));

    for (const row of group) {
      let total = 0;
      let weight = 0;
      for (const { key, weight: w, norm } of norms) {
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
    {
      label: "ROAS",
      actual: totals.roas != null ? `${fmt.nl(totals.roas, 2)}x` : "—",
      target: targets.roas != null ? `≥ ${fmt.nl(targets.roas, 2)}x` : null,
      onTrack: targets.roas != null && totals.roas != null ? totals.roas >= targets.roas : null,
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

export interface HighlightGroup {
  /** De exploitatie waarbinnen gerankt is. */
  unit: string;
  winners: Highlight[];
  losers: Highlight[];
}

/**
 * Winnaars en verliezers per exploitatie. De score is al relatief binnen fase
 * en exploitatie; hier wordt ook de ranglijst niet over exploitaties heen
 * gemengd. Per exploitatie hoogstens drie van elk, en nooit dezelfde campagne
 * aan beide kanten.
 */
export function winnersAndLosers(
  scored: ScoredCampaign[],
  fmt: { eur: (v: number | null, d?: number) => string; pct: (v: number | null, d?: number) => string }
): HighlightGroup[] {
  const ranked = scored.filter((c) => c.score != null);

  // Gemiddelde CPA per vergelijkingsgroep, voor de toelichting.
  const peerCpa = new Map<string, number | null>();
  for (const key of new Set(ranked.map(peerKey))) {
    peerCpa.set(key, derive(sumMetrics(ranked.filter((c) => peerKey(c) === key))).costPerResult);
  }

  const describe = (c: ScoredCampaign): string => {
    const parts: string[] = [`${PHASE_LABELS[c.phase]} · score ${c.score}`];
    const avg = peerCpa.get(peerKey(c)) ?? null;
    if (c.phase === "conversie" && c.derived.costPerResult != null) {
      const relative =
        avg != null && avg > 0
          ? ` (${Math.abs(Math.round(((c.derived.costPerResult - avg) / avg) * 100))}% ${
              c.derived.costPerResult < avg ? "onder" : "boven"
            } gemiddeld)`
          : "";
      parts.push(`CPA ${fmt.eur(c.derived.costPerResult, 2)}${relative}`);
    } else if (c.phase === "verkeer" && c.derived.cpc != null) {
      parts.push(`CPC ${fmt.eur(c.derived.cpc, 2)}`);
    } else if (c.phase === "bereik" && c.derived.cpm != null) {
      parts.push(`CPM ${fmt.eur(c.derived.cpm, 2)}`);
    }
    if (c.derived.ctr != null) parts.push(`CTR ${fmt.pct(c.derived.ctr)}`);
    return parts.join(" · ");
  };
  const toHighlight = (tone: Tone) => (c: ScoredCampaign): Highlight => ({
    name: c.name,
    platform: PLATFORM_LABELS[c.platform],
    why: describe(c),
    tone,
  });

  const units = [...new Set(ranked.map((c) => c.businessUnit))];
  return units
    .map((unit) => {
      const list = ranked
        .filter((c) => c.businessUnit === unit)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      const n = Math.min(3, Math.floor(list.length / 2));
      return {
        unit,
        winners: list.slice(0, n).map(toHighlight("good")),
        losers: list.slice(-n).reverse().map(toHighlight("bad")),
        spend: list.reduce((sum, c) => sum + c.metrics.spend, 0),
      };
    })
    .filter((g) => g.winners.length > 0)
    .sort((a, b) => b.spend - a.spend)
    .map(({ unit, winners, losers }) => ({ unit, winners, losers }));
}

/* ---------- Budget opportunities ---------- */

export interface BudgetOpportunity {
  type: "Opschalen" | "Afbouwen";
  name: string;
  platform: string;
  /** Binnen deze exploitatie wordt geschoven. */
  unit: string;
  why: string;
  /** Voorgestelde verschuiving in euro's; positief bij opschalen. */
  amount: number;
  tone: Tone;
}

/** Minimale afwijking van het gemiddelde voordat een verschuiving zinnig is. */
const MIN_GAP_PCT = 15;

/**
 * Verschuiving binnen dezelfde exploitatie: haal weg bij de conversiecampagnes
 * met de hoogste CPA, leg bij bij de laagste. Nooit van ticketing naar
 * PSV Connect — die hebben elk hun eigen budget en doel. Het voorstel is een
 * tiende van het bestede bedrag: genoeg om verschil te maken, klein genoeg om
 * de campagne niet uit balans te trekken.
 *
 * Alleen campagnes die er duidelijk naast zitten komen in aanmerking: een CPA
 * die 5% van het gemiddelde afwijkt is ruis, geen aanleiding om te schuiven.
 */
export function budgetOpportunities(scored: ScoredCampaign[], limit = 3): BudgetOpportunity[] {
  const eligible = scored.filter(
    (c) =>
      CONVERSION_OBJECTIVES.includes(c.objective) &&
      c.derived.costPerResult != null &&
      c.metrics.spend > 0
  );
  const share = (c: ScoredCampaign) => Math.round((c.metrics.spend * 0.1) / 50) * 50;

  const all: (BudgetOpportunity & { gap: number })[] = [];
  for (const unit of new Set(eligible.map((c) => c.businessUnit))) {
    const group = eligible.filter((c) => c.businessUnit === unit);
    if (group.length < 3) continue;
    const avg = derive(sumMetrics(group)).costPerResult;
    if (avg == null || avg <= 0) continue;

    for (const c of group) {
      const cpa = c.derived.costPerResult ?? 0;
      const gap = Math.abs(Math.round(((cpa - avg) / avg) * 100));
      if (gap < MIN_GAP_PCT) continue;
      const up = cpa < avg;
      all.push({
        type: up ? "Opschalen" : "Afbouwen",
        name: c.name,
        platform: PLATFORM_LABELS[c.platform],
        unit,
        why: `CPA ${gap}% ${up ? "onder" : "boven"} gemiddeld ${unit}`,
        amount: up ? share(c) : -share(c),
        tone: up ? "good" : "bad",
        gap,
      });
    }
  }

  const pick = (type: BudgetOpportunity["type"]) =>
    all
      .filter((o) => o.type === type)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, limit)
      .map(({ gap: _gap, ...o }) => o);
  return [...pick("Opschalen"), ...pick("Afbouwen")];
}

/* ---------- Verzadiging ---------- */

export interface SaturationRow {
  name: string;
  platform: string;
  frequency: number;
  tone: Tone;
  status: string;
}

/** Hoogste frequenties eerst — voor campagnes én advertentiesets. */
export function saturation(
  items: { name: string; platform: PaidPlatform; metrics: PaidMetrics }[],
  limit = 6
): SaturationRow[] {
  return items
    .map((item) => ({ item, frequency: derive(item.metrics).frequency }))
    .filter((r): r is { item: (typeof items)[number]; frequency: number } => r.frequency != null)
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, limit)
    .map(({ item, frequency }) => {
      const tone = toneForFrequency(frequency);
      return {
        name: item.name,
        platform: PLATFORM_LABELS[item.platform],
        frequency,
        tone,
        status: tone === "good" ? "Gezond" : tone === "warn" ? "Refresh" : "Vervangen",
      };
    });
}

/* ---------- Budget versus resultaat ---------- */

export interface ShareRow {
  key: string;
  label: string;
  spend: number;
  results: number;
  /** Aandeel in het budget van de conversiecampagnes, 0-100. */
  spendShare: number;
  /** Aandeel in hun conversies, 0-100. */
  resultShare: number;
  costPerResult: number | null;
  roas: number | null;
  tone: Tone;
}

/**
 * Aandeel budget naast aandeel conversies per groep (platform, exploitatie).
 * Krijgt een groep meer budget dan hij aan conversies teruggeeft, dan is zijn
 * CPA hoger dan gemiddeld — dit maakt dat in één oogopslag zichtbaar.
 *
 * Alleen lead-, registratie- en aankoopcampagnes: een "resultaat" van een
 * bereikcampagne is iets anders dan een conversie, en die optellen vertekent.
 */
export function budgetVersusResults(
  campaigns: PaidAdsCampaign[],
  key: (c: PaidAdsCampaign) => string | null,
  label: (k: string) => string,
  revenuePlatforms: PaidPlatform[]
): ShareRow[] {
  const conversion = campaigns.filter((c) => CONVERSION_OBJECTIVES.includes(c.objective));
  const total = sumMetrics(conversion);
  if (total.results === 0) return [];
  const avgCpa = derive(total).costPerResult;

  return groupBy(conversion, key, label).map((row) => ({
    key: row.key,
    label: row.label,
    spend: row.metrics.spend,
    results: row.metrics.results,
    spendShare: row.spendShare,
    resultShare: (row.metrics.results / total.results) * 100,
    costPerResult: row.derived.costPerResult,
    roas: roasOf(
      conversion.filter((c) => key(c) === row.key),
      revenuePlatforms
    ),
    tone: toneForCpa(row.derived.costPerResult, avgCpa),
  }));
}

/* ---------- Leeftijd en geslacht ---------- */

export interface DemographicRow extends GroupRow {
  /** CPA ten opzichte van de hele selectie. */
  tone: Tone;
}

const GENDER_LABELS: Record<PaidAdsDemographic["gender"], string> = {
  female: "Vrouwen",
  male: "Mannen",
  unknown: "Onbekend",
};

/**
 * Prestaties per leeftijdsgroep en per geslacht over de gekozen
 * advertentiesets. Leeftijden in hun eigen volgorde (18-24 eerst), niet op
 * budget: dan lees je de verschuiving over de leeftijden in één keer af.
 */
export function demographicSplit(rows: PaidAdsDemographic[]): {
  byAge: DemographicRow[];
  byGender: DemographicRow[];
} {
  const avgCpa = derive(sumMetrics(rows)).costPerResult;
  const withTone = (r: GroupRow): DemographicRow => ({
    ...r,
    tone: toneForCpa(r.derived.costPerResult, avgCpa),
  });
  return {
    byAge: groupBy(rows, (r) => r.age, (k) => k)
      .sort((a, b) => a.key.localeCompare(b.key, "nl", { numeric: true }))
      .map(withTone),
    byGender: groupBy(rows, (r) => r.gender, (k) => GENDER_LABELS[k as PaidAdsDemographic["gender"]] ?? k).map(
      withTone
    ),
  };
}

/* ---------- Besteed zonder resultaat ---------- */

export interface IdleAd {
  id: string;
  name: string;
  platform: PaidPlatform;
  adSetName: string | null;
  thumbnailUrl: string | null;
  spend: number;
  clicks: number;
  ctr: number | null;
}

/**
 * Advertenties in conversiecampagnes die wel budget verbruiken maar nog geen
 * enkel resultaat opleverden, duurste eerst. Plus welk deel van het
 * advertentiebudget van die campagnes daarin zit.
 */
export function adsWithoutResults(
  ads: PaidAdsAd[],
  adSets: PaidAdsAdSet[],
  campaigns: PaidAdsCampaign[],
  limit = 8
): { rows: IdleAd[]; count: number; spend: number; share: number | null } {
  const conversion = new Set(
    campaigns
      .filter((c) => CONVERSION_OBJECTIVES.includes(c.objective))
      .map((c) => `${c.platform}:${c.id}`)
  );
  const adSetNames = new Map(adSets.map((s) => [`${s.platform}:${s.id}`, s.name]));

  const eligible = ads.filter((a) => conversion.has(`${a.platform}:${a.campaignId}`));
  const idle = eligible
    .filter((a) => a.metrics.spend > 0 && a.metrics.results === 0)
    .sort((a, b) => b.metrics.spend - a.metrics.spend);

  const idleSpend = idle.reduce((sum, a) => sum + a.metrics.spend, 0);
  const eligibleSpend = eligible.reduce((sum, a) => sum + a.metrics.spend, 0);

  return {
    rows: idle.slice(0, limit).map((a) => ({
      id: a.id,
      name: a.name,
      platform: a.platform,
      adSetName: adSetNames.get(`${a.platform}:${a.adSetId}`) ?? null,
      thumbnailUrl: a.thumbnailUrl,
      spend: a.metrics.spend,
      clicks: a.metrics.clicks,
      ctr: derive(a.metrics).ctr,
    })),
    count: idle.length,
    spend: idleSpend,
    share: eligibleSpend > 0 ? (idleSpend / eligibleSpend) * 100 : null,
  };
}

/* ---------- Advertenties per advertentieset ---------- */

export interface AdInSet {
  ad: PaidAdsAd;
  derived: DerivedMetrics;
  /** Aandeel in het budget van de eigen advertentieset, 0-100. */
  spendShare: number;
  /** CPA ten opzichte van de eigen advertentieset. */
  tone: Tone;
}

export interface AdSetGroup {
  adSet: PaidAdsAdSet;
  derived: DerivedMetrics;
  ads: AdInSet[];
}

/**
 * Advertentiesets met hun advertenties eronder, beide op besteed bedrag. Een
 * advertentie wordt afgezet tegen de CPA van zijn eigen set: daar concurreert
 * hij om hetzelfde budget en dezelfde doelgroep.
 */
export function adsByAdSet(adSets: PaidAdsAdSet[], ads: PaidAdsAd[]): AdSetGroup[] {
  const bySet = new Map<string, PaidAdsAd[]>();
  for (const ad of ads) {
    const k = `${ad.platform}:${ad.adSetId}`;
    const list = bySet.get(k);
    if (list) list.push(ad);
    else bySet.set(k, [ad]);
  }

  return adSets
    .map((adSet) => {
      const list = bySet.get(`${adSet.platform}:${adSet.id}`) ?? [];
      const derived = derive(adSet.metrics);
      const setSpend = list.reduce((sum, a) => sum + a.metrics.spend, 0);
      // Pas vergelijken als er binnen de set iets te vergelijken valt.
      const comparable = list.filter((a) => a.metrics.results > 0).length >= 2;
      return {
        adSet,
        derived,
        ads: list
          .map((ad) => {
            const d = derive(ad.metrics);
            return {
              ad,
              derived: d,
              spendShare: setSpend > 0 ? (ad.metrics.spend / setSpend) * 100 : 0,
              tone: comparable ? toneForCpa(d.costPerResult, derived.costPerResult) : ("neutral" as Tone),
            };
          })
          .sort((a, b) => b.ad.metrics.spend - a.ad.metrics.spend),
      };
    })
    .filter((g) => g.ads.length > 0)
    .sort((a, b) => b.adSet.metrics.spend - a.adSet.metrics.spend);
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
