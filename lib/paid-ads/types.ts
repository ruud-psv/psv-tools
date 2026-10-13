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
  /**
   * Conversiewaarde (omzet) in euro's. 0 wanneer er niets verkocht is, maar ook
   * wanneer het platform geen waarde levert — zie `revenuePlatforms`.
   */
  revenue: number;
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
  /** Wie de set bereikt, zoals ingesteld op het platform. `null` als het platform dat niet levert. */
  targeting: PaidTargeting | null;
  metrics: PaidMetrics;
}

/** Samenvatting van de targeting van een advertentieset, in leesbare labels. */
export interface PaidTargeting {
  /** Eigen doelgroepen en lookalikes die worden bereikt. */
  audiences: string[];
  /** Doelgroepen die worden uitgesloten. */
  excluded: string[];
  /** Interesses en gedragingen. */
  interests: string[];
  /** "18-34", of `null` zonder leeftijdsgrens. */
  age: string | null;
  /** "Vrouwen", "Mannen", of `null` voor iedereen. */
  gender: string | null;
  /** Landen, regio's en steden. */
  locations: string[];
  /** Of het platform de doelgroep zelf mag verbreden (Advantage+). */
  expanded: boolean;
}

/** Prestaties van één advertentieset binnen één leeftijdsgroep en geslacht. */
export interface PaidAdsDemographic {
  platform: PaidPlatform;
  campaignId: string;
  adSetId: string;
  /** Leeftijdsgroep zoals het platform hem levert: "18-24", "65+". */
  age: string;
  gender: "female" | "male" | "unknown";
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
  /** Voorbeeldafbeelding van de creative. Tijdelijke URL van het platform; `null` als die er niet is. */
  thumbnailUrl: string | null;
  metrics: PaidMetrics;
}

/**
 * Eén campagne op één dag. De dag- en weekgrafiek worden hieruit opgebouwd,
 * zodat ze dezelfde filters volgen als de campagnelijst.
 */
export interface PaidAdsCampaignDay {
  /** ISO-datum (YYYY-MM-DD). */
  date: string;
  platform: PaidPlatform;
  campaignId: string;
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
  /** Omzet per bestede euro. */
  roas: number | null;
  /** CPA-doel per exploitatie. */
  byBusinessUnit: Record<string, number>;
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
  /** Prestaties per leeftijd en geslacht, per advertentieset. Alleen platforms die dat leveren. */
  demographics: PaidAdsDemographic[];
  /** Dagreeks per campagne — de bron voor `daily` en `weekly`. */
  campaignDaily: PaidAdsCampaignDay[];
  daily: PaidAdsDailyPoint[];
  weekly: PaidAdsWeeklyPoint[];
  /** Totalen van de vergelijkingsperiodes; `null` zolang die niet op te halen zijn. */
  benchmarks: {
    previous: PaidMetrics | null;
    yearAgo: PaidMetrics | null;
    /** Vorige periode uitgesplitst per kanaal, voor de platformvergelijking. */
    previousByPlatform: Partial<Record<PaidPlatform, PaidMetrics>>;
    /**
     * De campagnes van de vergelijkingsperiodes. Daaruit worden de totalen
     * hierboven opnieuw berekend zodra er een filter actief is, zodat een
     * gefilterde periode met een even gefilterde vergelijking wordt afgezet.
     */
    previousCampaigns: PaidAdsCampaign[] | null;
    yearAgoCampaigns: PaidAdsCampaign[] | null;
  };
  targets: PaidAdsTargets;
  /** Platforms waarvoor een koppeling is ingesteld. */
  connectedPlatforms: PaidPlatform[];
  /** Verbonden platforms die een conversiewaarde leveren — de basis voor ROAS. */
  revenuePlatforms: PaidPlatform[];
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
  return { spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0, revenue: 0 };
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
