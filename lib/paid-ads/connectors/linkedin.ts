/**
 * Koppeling met de LinkedIn Marketing API (Ad Analytics + campagnelijst).
 *
 * LinkedIn kent geen advertentieset-laag zoals Meta of een advertentiegroep
 * zoals Google: de hiërarchie is campagne → creative (advertentie). Om toch
 * dezelfde structuur te bieden, wordt er per campagne één "advertentieset"
 * gesynthetiseerd met dezelfde tellers als de campagne zelf. Dat dupliceert
 * geen besteding in het dashboard: de KPI-totalen komen uitsluitend uit
 * `campaigns` (zie `app/api/paid-ads/route.ts`), advertentiesets worden
 * alleen gebruikt in de doelgroepweergave.
 *
 * De Analytics-endpoint (`/rest/adAnalytics`) levert alleen URN's terug, geen
 * namen — daarvoor is een aparte aanroep naar de campagnelijst nodig.
 * Advertentieniveau (creatives) vraagt weer een eigen metadata-endpoint met
 * een vorm die per advertentieformat verschilt; die is hier bewust nog niet
 * gebouwd. `ads` blijft daarom leeg, net zoals `audienceOverlap` in de route
 * leeg blijft tot er een bron voor is.
 *
 * Benodigde environment variabelen:
 *   LINKEDIN_ADS_ACCESS_TOKEN   OAuth access token met de scope `rw_ads`.
 *   LINKEDIN_ADS_ACCOUNT_ID     Sponsored account-ID, met of zonder
 *                               `urn:li:sponsoredAccount:`-voorvoegsel.
 * Optioneel:
 *   LINKEDIN_ADS_API_VERSION    Waarde voor de verplichte `LinkedIn-Version`-
 *                               header (formaat JJJJMM). LinkedIn ondersteunt
 *                               een versie ongeveer een jaar en geeft daarna
 *                               `426 NONEXISTENT_VERSION`; deze variabele zet
 *                               een nieuwe versie zonder codewijziging.
 *
 * LinkedIn rapporteert geen uniek bereik op advertentieniveau; `reach` blijft
 * daarom 0, net als bij Google Ads. Als resultaat telt de eerste van
 * `externalWebsiteConversions` en `oneClickLeads` die niet nul is.
 *
 * Let op: gebouwd op basis van de publieke LinkedIn Marketing API-
 * documentatie en nog niet getest tegen een live account — met name de
 * zoekfilter op `/adCampaigns` en de exacte Rest.li-querysyntax zijn de
 * meest waarschijnlijke plek voor een correctie zodra de eerste live aanroep
 * een foutmelding teruggeeft. Die foutmelding komt terecht in de
 * `platformErrors` van het dashboard.
 */

import {
  emptyMetrics,
  type PaidAdsAdSet,
  type PaidAdsCampaign,
  type PaidMetrics,
} from "@/lib/paid-ads/types";
import {
  resolveAudienceType,
  resolveBusinessUnit,
  resolveCampaignGroup,
  resolveObjectiveLabel,
  resolvePhase,
} from "@/lib/paid-ads/mapping";
import {
  ConnectorConfigError,
  ConnectorRequestError,
  type ConnectorDailyPoint,
  type ConnectorResult,
  type FetchWindow,
  type PaidConnector,
} from "./types";

const API_HOST = "https://api.linkedin.com";
/** Verloopt na ongeveer een jaar; zie `LINKEDIN_ADS_API_VERSION` hierboven. */
const DEFAULT_API_VERSION = "202606";

/** Harde bovengrens op het doorbladeren, net als bij de andere koppelingen. */
const MAX_PAGES = 25;
const PAGE_SIZE = 100;

/* ------------------------------------------------------------- objectief -- */

/**
 * LinkedIns `objectiveType` vertaald naar de gedeelde vocabulaire uit
 * `mapping.ts`. Bereik krijgt een eigen term omdat `mapping.ts` daar al een
 * aparte, voor LinkedIn gereserveerde sleutel voor heeft staan; de rest matcht
 * na verkleinen al met de generieke termen.
 */
const OBJECTIVE_BY_TYPE: Record<string, string> = {
  BRAND_AWARENESS: "brand_awareness_linkedin",
  ENGAGEMENT: "engagement",
  JOB_APPLICANTS: "traffic",
  LEAD_GENERATION: "conversion",
  VIDEO_VIEW: "video_view",
  WEBSITE_CONVERSIONS: "conversion",
  WEBSITE_VISITS: "traffic",
};

function pseudoObjective(raw: string | undefined): string {
  if (!raw) return "";
  return OBJECTIVE_BY_TYPE[raw] ?? raw.toLowerCase();
}

/* -------------------------------------------------------------- config -- */

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

interface LinkedInConfig {
  token: string;
  accountId: string;
  accountUrn: string;
  apiVersion: string;
}

function getConfig(): LinkedInConfig {
  const token = readEnv("LINKEDIN_ADS_ACCESS_TOKEN");
  const accountIdRaw = readEnv("LINKEDIN_ADS_ACCOUNT_ID");

  const missing = [
    !token && "LINKEDIN_ADS_ACCESS_TOKEN",
    !accountIdRaw && "LINKEDIN_ADS_ACCOUNT_ID",
  ].filter((name): name is string => Boolean(name));

  if (missing.length) {
    throw new ConnectorConfigError(
      `LinkedIn-configuratie ontbreekt: ${missing.join(", ")}. Zet deze als environment variable in Vercel.`
    );
  }

  const accountId = accountIdRaw!.replace("urn:li:sponsoredAccount:", "");

  return {
    token: token!,
    accountId,
    accountUrn: `urn:li:sponsoredAccount:${accountId}`,
    apiVersion: readEnv("LINKEDIN_ADS_API_VERSION") ?? DEFAULT_API_VERSION,
  };
}

export function isLinkedInConfigured(): boolean {
  try {
    getConfig();
    return true;
  } catch {
    return false;
  }
}

/** Haalt het token uit een foutmelding voordat die naar de log of het scherm gaat. */
function redact(text: string, token: string): string {
  return token ? text.split(token).join("***") : text;
}

function authHeaders(config: LinkedInConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.token}`,
    "LinkedIn-Version": config.apiVersion,
    "X-Restli-Protocol-Version": "2.0.0",
    Accept: "application/json",
  };
}

/* --------------------------------------------------------- campagnelijst -- */

interface LinkedInCampaign {
  id: number;
  name?: string;
  objectiveType?: string;
}

interface LinkedInCampaignListResponse {
  elements?: LinkedInCampaign[];
  paging?: { start: number; count: number; total?: number };
}

/**
 * Haalt naam en doelstelling per campagne op. De statusfilter somt bewust elke
 * bekende status op: de finder `search` vraagt een filter, en dit is de manier
 * om er zonder uitsluiting toch alles mee binnen te halen.
 */
async function fetchCampaignMeta(
  config: LinkedInConfig,
  signal?: AbortSignal
): Promise<Map<string, LinkedInCampaign>> {
  const byId = new Map<string, LinkedInCampaign>();
  const statuses = "List(ACTIVE,PAUSED,ARCHIVED,COMPLETED,CANCELED,DRAFT,PENDING_DELETION,REMOVED)";
  let start = 0;
  let page = 0;

  while (page < MAX_PAGES) {
    const url =
      `${API_HOST}/rest/adAccounts/${config.accountId}/adCampaigns` +
      `?q=search&search=(status:(values:${statuses}))&start=${start}&count=${PAGE_SIZE}`;

    const res = await fetch(url, { headers: authHeaders(config), cache: "no-store", signal });
    const text = await res.text();

    let body: LinkedInCampaignListResponse;
    try {
      body = JSON.parse(text);
    } catch {
      throw new ConnectorRequestError(
        `LinkedIn gaf een onleesbaar antwoord (${res.status}) bij het ophalen van campagnes.`,
        res.status,
        redact(text.slice(0, 300), config.token)
      );
    }

    if (!res.ok) {
      throw new ConnectorRequestError(
        `LinkedIn Campaign API — ${res.status} ${res.statusText}: ${redact(text.slice(0, 300), config.token)}`,
        res.status,
        redact(text.slice(0, 300), config.token)
      );
    }

    const elements = body.elements ?? [];
    for (const campaign of elements) {
      byId.set(String(campaign.id), campaign);
    }

    const total = body.paging?.total ?? elements.length;
    start += PAGE_SIZE;
    page += 1;
    if (start >= total || elements.length === 0) break;
  }

  return byId;
}

/* ------------------------------------------------------------ analytics -- */

interface LinkedInAnalyticsRow {
  pivotValues?: string[];
  dateRange?: { start: { year: number; month: number; day: number } };
  impressions?: number;
  clicks?: number;
  costInLocalCurrency?: string;
  externalWebsiteConversions?: number;
  oneClickLeads?: number;
}

interface LinkedInAnalyticsResponse {
  elements?: LinkedInAnalyticsRow[];
  paging?: { start: number; count: number; total?: number };
}

const ANALYTICS_FIELDS = [
  "pivotValues",
  "dateRange",
  "impressions",
  "clicks",
  "costInLocalCurrency",
  "externalWebsiteConversions",
  "oneClickLeads",
].join(",");

function dateRangeParam(window: FetchWindow): string {
  const [sy, sm, sd] = window.from.split("-").map(Number);
  const [ey, em, ed] = window.to.split("-").map(Number);
  return `(start:(year:${sy},month:${sm},day:${sd}),end:(year:${ey},month:${em},day:${ed}))`;
}

/**
 * Doorloopt de Analytics-finder voor één pivot. `accounts` scopet op het hele
 * account, zodat er geen campagne-ID's vooraf nodig zijn — die worden achteraf
 * via de URN's in `pivotValues` gekoppeld aan de campagnelijst.
 */
async function fetchAnalytics(
  config: LinkedInConfig,
  pivot: "CAMPAIGN",
  granularity: "ALL" | "DAILY",
  window: FetchWindow,
  signal?: AbortSignal
): Promise<LinkedInAnalyticsRow[]> {
  const rows: LinkedInAnalyticsRow[] = [];
  let start = 0;
  let page = 0;

  while (page < MAX_PAGES) {
    const url =
      `${API_HOST}/rest/adAnalytics?q=analytics&pivot=${pivot}` +
      `&dateRange=${dateRangeParam(window)}&timeGranularity=${granularity}` +
      `&accounts=List(${encodeURIComponent(config.accountUrn)})` +
      `&fields=${ANALYTICS_FIELDS}&start=${start}&count=${PAGE_SIZE}`;

    const res = await fetch(url, { headers: authHeaders(config), cache: "no-store", signal });
    const text = await res.text();

    let body: LinkedInAnalyticsResponse;
    try {
      body = JSON.parse(text);
    } catch {
      throw new ConnectorRequestError(
        `LinkedIn gaf een onleesbaar antwoord (${res.status}).`,
        res.status,
        redact(text.slice(0, 300), config.token)
      );
    }

    if (!res.ok) {
      throw new ConnectorRequestError(
        `LinkedIn Ad Analytics API — ${res.status} ${res.statusText}: ${redact(text.slice(0, 300), config.token)}`,
        res.status,
        redact(text.slice(0, 300), config.token)
      );
    }

    const elements = body.elements ?? [];
    rows.push(...elements);

    const total = body.paging?.total ?? elements.length;
    start += PAGE_SIZE;
    page += 1;
    if (start >= total || elements.length === 0) break;
  }

  return rows;
}

/* -------------------------------------------------------------- parsen -- */

function num(value: number | string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metricsFrom(row: LinkedInAnalyticsRow): PaidMetrics {
  const conversions = num(row.externalWebsiteConversions);
  const leads = num(row.oneClickLeads);
  return {
    spend: num(row.costInLocalCurrency),
    impressions: num(row.impressions),
    // LinkedIn rapporteert geen uniek bereik op advertentieniveau.
    reach: 0,
    clicks: num(row.clicks),
    results: conversions > 0 ? conversions : leads,
  };
}

/** Rijen zonder besteding én zonder vertoningen zeggen niets en vervuilen de tabellen. */
function hasVolume(metrics: PaidMetrics): boolean {
  return metrics.spend > 0 || metrics.impressions > 0;
}

function addMetrics(target: PaidMetrics, source: PaidMetrics): void {
  target.spend += source.spend;
  target.impressions += source.impressions;
  target.reach += source.reach;
  target.clicks += source.clicks;
  target.results += source.results;
}

/** Het numerieke ID uit een LinkedIn-URN, bijv. "urn:li:sponsoredCampaign:123" → "123". */
function urnId(urn: string | undefined): string | null {
  if (!urn) return null;
  const id = urn.split(":").pop();
  return id || null;
}

/* ---------------------------------------------------------- connector -- */

async function fetchAll(window: FetchWindow, signal?: AbortSignal): Promise<ConnectorResult> {
  const config = getConfig();

  const [campaignMeta, campaignRows, dailyRows] = await Promise.all([
    fetchCampaignMeta(config, signal),
    fetchAnalytics(config, "CAMPAIGN", "ALL", window, signal),
    fetchAnalytics(config, "CAMPAIGN", "DAILY", window, signal),
  ]);

  const campaigns: PaidAdsCampaign[] = [];
  const adSets: PaidAdsAdSet[] = [];

  for (const row of campaignRows) {
    const id = urnId(row.pivotValues?.[0]);
    if (!id) continue;

    const meta = campaignMeta.get(id);
    const name = meta?.name || `Campagne ${id}`;
    const objective = pseudoObjective(meta?.objectiveType);
    const phase = resolvePhase(name, objective);
    const metrics = metricsFrom(row);
    const businessUnit = resolveBusinessUnit(name);
    const campaignGroup = resolveCampaignGroup(name);

    if (!hasVolume(metrics)) continue;

    campaigns.push({
      id,
      name,
      platform: "linkedin",
      phase,
      businessUnit,
      objective: resolveObjectiveLabel(objective, null),
      campaignGroup,
      metrics,
    });

    // LinkedIn kent geen advertentieset; er wordt er één per campagne
    // gesynthetiseerd met dezelfde tellers (zie bestandscomment hierboven).
    adSets.push({
      id: `${id}:default`,
      name,
      campaignId: id,
      platform: "linkedin",
      phase,
      audienceType: resolveAudienceType(name),
      metrics,
    });
  }

  const byDate = new Map<string, PaidMetrics>();
  for (const row of dailyRows) {
    const start = row.dateRange?.start;
    if (!start) continue;
    const date = `${start.year}-${String(start.month).padStart(2, "0")}-${String(start.day).padStart(2, "0")}`;

    const point = byDate.get(date) ?? emptyMetrics();
    addMetrics(point, metricsFrom(row));
    byDate.set(date, point);
  }

  const daily: ConnectorDailyPoint[] = [...byDate.entries()]
    .map(([date, metrics]) => ({ date, metrics }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Creative-niveau (ads) vraagt een eigen metadata-endpoint dat hier nog niet
  // gebouwd is — zie bestandscomment hierboven.
  return { campaigns, adSets, ads: [], daily };
}

/**
 * Totalen voor een vergelijkingsperiode, op campagneniveau — net als bij de
 * andere koppelingen.
 */
async function fetchTotals(window: FetchWindow, signal?: AbortSignal): Promise<PaidMetrics> {
  const config = getConfig();
  const rows = await fetchAnalytics(config, "CAMPAIGN", "ALL", window, signal);

  const totals = emptyMetrics();
  for (const row of rows) {
    addMetrics(totals, metricsFrom(row));
  }
  return totals;
}

export const linkedinConnector: PaidConnector = {
  platform: "linkedin",
  isConfigured: isLinkedInConfigured,
  fetchAll,
  fetchTotals,
};
