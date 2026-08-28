/**
 * Datacontract voor het Paid Ads dashboard.
 *
 * De API-route levert uitsluitend ruwe tellers aan (spend, impressies, clicks,
 * resultaten). Alle afgeleide waarden — CTR, CPC, CVR, CPA, scores, funnel,
 * forecast — worden in `derive.ts` berekend. Zo blijft er één definitie van
 * elke metric, ongeacht van welk platform de rij komt.
 */

/** Funnelfase waarin een campagne draait. */
export type PaidPhase = "bereik" | "verkeer" | "conversie";

export type PaidPlatform = "meta" | "tiktok" | "google" | "linkedin";

/** Type doelgroep achter een advertentieset. */
export type AudienceType =
  | "broad"
  | "interesse"
  | "lookalike"
  | "retargeting"
  | "database";

/** Waarmee de huidige periode vergeleken wordt. */
export type BenchmarkKey = "previous" | "yearAgo" | "target";

/**
 * De ruwe tellers. Alles wat hieruit te berekenen valt staat er bewust niet in:
 * `frequency` volgt uit impressions / reach, `ctr` uit clicks / impressions.
 */
export interface PaidMetrics {
  spend: number;
  impressions: number;
  /** Unieke mensen. 0 wanneer het platform geen bereik rapporteert (Google Ads). */
  reach: number;
  clicks: number;
  /** Conversies, leads of registraties — afhankelijk van de doelstelling. */
  results: number;
}

export interface PaidAdsCampaign {
  id: string;
  name: string;
  platform: PaidPlatform;
  phase: PaidPhase;
  /** Exploitatie: Ticketing, Merchandise, Mijn PSV+, … */
  businessUnit: string;
  /** Doelstelling zoals het platform hem noemt: Aankopen, Leads, Clicks, … */
  objective: string;
  /**
   * Naam van de overkoepelende campagne wanneer dezelfde campagne op meerdere
   * kanalen draait. `null` voor campagnes die maar op één platform lopen.
   */
  campaignGroup: string | null;
  metrics: PaidMetrics;
}

export interface PaidAdsAdSet {
  id: string;
  name: string;
  campaignId: string;
  platform: PaidPlatform;
  phase: PaidPhase;
  audienceType: AudienceType | null;
  metrics: PaidMetrics;
}

export interface PaidAdsAd {
  id: string;
  name: string;
  adSetId: string;
  campaignId: string;
  platform: PaidPlatform;
  phase: PaidPhase;
  /** Advertentieformat: "Video 9:16", "Carousel", "Search tekst", … */
  format: string | null;
  /** Label van de hook-variant, voor de hook-vergelijking. */
  hook: string | null;
  /** Weergaven langer dan 3 seconden. `null` bij niet-video. */
  videoViews3s: number | null;
  metrics: PaidMetrics;
}

export interface PaidAdsDailyPoint {
  /** ISO-datum (YYYY-MM-DD). */
  date: string;
  spend: number;
  results: number;
}

export interface PaidAdsWeeklyPoint {
  /** Weeklabel zoals "wk 32". */
  week: string;
  ctr: number;
  costPerResult: number;
}

/**
 * Doelstellingen komen niet uit de advertentieplatformen — die kent alleen PSV
 * zelf. Elk veld mag `null` zijn; het dashboard laat de doelkolom dan leeg in
 * plaats van een verzonnen doel te tonen.
 */
export interface PaidAdsTargets {
  /** Totaal mediabudget voor de periode. */
  budget: number | null;
  results: number | null;
  costPerResult: number | null;
  ctr: number | null;
  cvr: number | null;
  cpc: number | null;
  /** CPA-doel per exploitatie. */
  byBusinessUnit: Record<string, number>;
}

export interface PaidAdsOverlap {
  label: string;
  /** Percentage dubbel bereikte mensen. */
  percentage: number;
  note: string | null;
}

export interface PaidAdsPeriod {
  from: string;
  to: string;
  /** Verstreken dagen binnen de periode — basis voor de forecast. */
  daysElapsed: number;
  daysTotal: number;
}

export interface PaidAdsResponse {
  period: PaidAdsPeriod;
  campaigns: PaidAdsCampaign[];
  adSets: PaidAdsAdSet[];
  ads: PaidAdsAd[];
  daily: PaidAdsDailyPoint[];
  weekly: PaidAdsWeeklyPoint[];
  /** Totalen van de vergelijkingsperiodes; `null` zolang die niet op te halen zijn. */
  benchmarks: {
    previous: PaidMetrics | null;
    yearAgo: PaidMetrics | null;
    /** Vorige periode uitgesplitst per kanaal, voor de platformvergelijking. */
    previousByPlatform: Partial<Record<PaidPlatform, PaidMetrics>>;
  };
  targets: PaidAdsTargets;
  /** Doelgroepoverlap komt uit een aparte export, niet uit de rapportage-API's. */
  audienceOverlap: PaidAdsOverlap[];
  /** Platforms waarvoor een koppeling is ingesteld. */
  connectedPlatforms: PaidPlatform[];
  /** Per platform de reden dat er geen data is. Leeg wanneer alles is opgehaald. */
  platformErrors: Partial<Record<PaidPlatform, string>>;
  fetchedAt: string;
}

export const PLATFORM_LABELS: Record<PaidPlatform, string> = {
  meta: "Meta",
  tiktok: "TikTok",
  google: "Google Ads",
  linkedin: "LinkedIn",
};

export const PHASE_LABELS: Record<PaidPhase, string> = {
  bereik: "Bereik",
  verkeer: "Verkeer",
  conversie: "Conversie",
};

export const AUDIENCE_LABELS: Record<AudienceType, string> = {
  broad: "Broad",
  interesse: "Interesse",
  lookalike: "Lookalike",
  retargeting: "Retargeting",
  database: "CRM / database",
};

/** Doelstellingen die tot een telbare conversie leiden. */
export const CONVERSION_OBJECTIVES = ["Leads", "Registraties", "Aankopen"];

export function emptyMetrics(): PaidMetrics {
  return { spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0 };
}

/** De periodes die het dashboard aanbiedt. */
export const PERIODS = [
  { value: "7d", label: "Laatste 7 dagen" },
  { value: "30d", label: "Laatste 30 dagen" },
  { value: "90d", label: "Laatste 90 dagen" },
  { value: "season", label: "Dit seizoen" },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["value"];

export function isPeriod(value: string): value is PeriodKey {
  return PERIODS.some((p) => p.value === value);
}
