/**
 * Koppeling met de TikTok Marketing API (Reporting).
 *
 * Alles loopt via één endpoint: `report/integrated/get`, dat op elk niveau —
 * campagne, advertentiegroep, advertentie — dezelfde tellers teruggeeft via
 * een `data_level`-parameter. Net als bij Meta en Google is er dus één
 * ophaalfunctie met een niveauparameter.
 *
 * Benodigde environment variabelen:
 *   TIKTOK_ADS_ACCESS_TOKEN    Token van een TikTok for Business-app met
 *                              leesrechten op het advertentieaccount.
 *   TIKTOK_ADS_ADVERTISER_ID   Advertiser-ID (numeriek).
 * Optioneel:
 *   TIKTOK_ADS_API_VERSION     API-versie, standaard v1.3.
 *
 * TikTok geeft `result` en `cost_per_result` terug als generieke metrics die
 * zich aanpassen aan het optimalisatiedoel van de advertentiegroep — net als
 * Metas `actions`, maar dan al server-side samengevat tot één getal. Daarom is
 * er geen aparte prioriteitstabel nodig zoals `RESULT_ACTIONS` bij Meta.
 *
 * Let op: deze koppeling is gebouwd op basis van de publieke TikTok Business
 * API-documentatie en nog niet getest tegen een live account. Faalt de eerste
 * aanroep, dan staat de exacte reden (TikToks eigen `code`/`message`) in de
 * foutmelding op het dashboard — daar begint het debuggen.
 */

import {
  emptyMetrics,
  type PaidAdsAd,
  type PaidAdsAdSet,
  type PaidAdsCampaign,
  type PaidMetrics,
  type PaidPhase,
} from "@/lib/paid-ads/types";
import {
  resolveAudienceType,
  resolveBusinessUnit,
  resolveCampaignGroup,
  resolveFormat,
  resolveHook,
  resolveObjectiveLabel,
  resolvePhase,
} from "@/lib/paid-ads/mapping";
import {
  assertCleanSecret,
  ConnectorConfigError,
  ConnectorRequestError,
  type ConnectorDailyPoint,
  type ConnectorResult,
  type FetchWindow,
  type PaidConnector,
} from "./types";

const API_HOST = "https://business-api.tiktok.com";
const DEFAULT_API_VERSION = "v1.3";

/** Harde bovengrens op het doorbladeren, net als bij de andere koppelingen. */
const MAX_PAGES = 25;
const PAGE_SIZE = 1000;

/* ------------------------------------------------------------- objectief -- */

/**
 * TikToks `objective_type` vertaald naar de gedeelde vocabulaire uit
 * `mapping.ts`. De meeste waarden matchen na verkleinen al met de generieke
 * termen die Google Ads en LinkedIn ook gebruiken; leadgeneratie krijgt een
 * eigen term omdat `mapping.ts` daar al een aparte, voor TikTok gereserveerde
 * sleutel voor heeft staan.
 */
const OBJECTIVE_BY_TYPE: Record<string, string> = {
  REACH: "awareness",
  TRAFFIC: "traffic",
  APP_PROMOTION: "conversion",
  CONVERSIONS: "conversion",
  WEB_CONVERSIONS: "conversion",
  CATALOG_SALES: "conversion",
  PRODUCT_SALES: "conversion",
  LEAD_GENERATION: "lead_generation_tiktok",
  ENGAGEMENT: "engagement",
  COMMUNITY_INTERACTION: "engagement",
  VIDEO_VIEWS: "video_view",
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

interface TikTokConfig {
  token: string;
  advertiserId: string;
  apiVersion: string;
}

function getConfig(): TikTokConfig {
  const token = readEnv("TIKTOK_ADS_ACCESS_TOKEN");
  const advertiserId = readEnv("TIKTOK_ADS_ADVERTISER_ID");

  const missing = [
    !token && "TIKTOK_ADS_ACCESS_TOKEN",
    !advertiserId && "TIKTOK_ADS_ADVERTISER_ID",
  ].filter((name): name is string => Boolean(name));

  if (missing.length) {
    throw new ConnectorConfigError(
      `TikTok-configuratie ontbreekt: ${missing.join(", ")}. Zet deze als environment variable in Vercel.`
    );
  }

  assertCleanSecret("TIKTOK_ADS_ACCESS_TOKEN", token!);

  return {
    token: token!,
    advertiserId: advertiserId!,
    apiVersion: readEnv("TIKTOK_ADS_API_VERSION") ?? DEFAULT_API_VERSION,
  };
}

export function isTikTokConfigured(): boolean {
  try {
    getConfig();
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------- ophalen -- */

/** Haalt het token uit een foutmelding voordat die naar de log of het scherm gaat. */
function redact(text: string, token: string): string {
  return token ? text.split(token).join("***") : text;
}

/** Eén rij uit `report/integrated/get`: ID's staan in `dimensions`, de rest in `metrics`. */
interface TikTokRow {
  dimensions: Record<string, string>;
  metrics: Record<string, string>;
}

interface TikTokReportResponse {
  code: number;
  message: string;
  data?: {
    list?: TikTokRow[];
    page_info?: { page: number; total_page: number };
  };
}

type DataLevel = "AUCTION_CAMPAIGN" | "AUCTION_ADGROUP" | "AUCTION_AD";

/**
 * Voert één report-aanroep uit en doorloopt de paginering. TikTok geeft een
 * HTTP 200 terug met een eigen foutcode in de body, dus die wordt apart
 * gecontroleerd naast de HTTP-status.
 */
async function runReport(
  config: TikTokConfig,
  dataLevel: DataLevel,
  dimensions: string[],
  metrics: string[],
  window: FetchWindow,
  signal?: AbortSignal
): Promise<TikTokRow[]> {
  const rows: TikTokRow[] = [];
  let page = 1;

  while (page <= MAX_PAGES) {
    const url = new URL(`${API_HOST}/open_api/${config.apiVersion}/report/integrated/get/`);
    url.searchParams.set("advertiser_id", config.advertiserId);
    url.searchParams.set("report_type", "BASIC");
    url.searchParams.set("data_level", dataLevel);
    url.searchParams.set("dimensions", JSON.stringify(dimensions));
    url.searchParams.set("metrics", JSON.stringify(metrics));
    url.searchParams.set("start_date", window.from);
    url.searchParams.set("end_date", window.to);
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", String(PAGE_SIZE));

    const res = await fetch(url.toString(), {
      // TikTok wil het token in een eigen header, niet als Bearer-token.
      headers: { "Access-Token": config.token, Accept: "application/json" },
      cache: "no-store",
      signal,
    });

    const text = await res.text();
    let body: TikTokReportResponse;
    try {
      body = JSON.parse(text);
    } catch {
      throw new ConnectorRequestError(
        `TikTok gaf een onleesbaar antwoord (${res.status}).`,
        res.status,
        redact(text.slice(0, 300), config.token)
      );
    }

    if (!res.ok || body.code !== 0) {
      const detail = body.message ?? text.slice(0, 300);
      // Het advertiser-ID staat er bewust bij: wijst de koppeling naar het
      // verkeerde account, dan is dat uit TikToks melding niet af te leiden.
      throw new ConnectorRequestError(
        `TikTok Marketing API (advertiser ${config.advertiserId}) — ${res.status} ${res.statusText}: ${redact(detail, config.token)}`,
        res.status,
        redact(detail, config.token)
      );
    }

    rows.push(...(body.data?.list ?? []));
    const pageInfo = body.data?.page_info;
    if (!pageInfo || page >= pageInfo.total_page) break;
    page += 1;
  }

  return rows;
}

/* -------------------------------------------------------------- parsen -- */

function num(value: string | number | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metricsFrom(row: TikTokRow): PaidMetrics {
  return {
    spend: num(row.metrics.spend),
    impressions: num(row.metrics.impressions),
    reach: num(row.metrics.reach),
    clicks: num(row.metrics.clicks),
    results: num(row.metrics.result),
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

/* ---------------------------------------------------------- connector -- */

/** Wat we van een campagne onthouden om advertentiegroepen en ads in te delen. */
interface CampaignContext {
  phase: PaidPhase;
  businessUnit: string;
  campaignGroup: string | null;
  name: string;
}

const CAMPAIGN_METRICS = ["campaign_name", "objective_type", "spend", "impressions", "clicks", "reach", "result"];
const ADGROUP_METRICS = ["campaign_id", "adgroup_name", "spend", "impressions", "clicks", "reach", "result"];
const AD_METRICS = ["campaign_id", "adgroup_id", "ad_name", "spend", "impressions", "clicks", "reach", "result"];
const DAILY_METRICS = ["spend", "impressions", "clicks", "reach", "result"];

async function fetchAll(window: FetchWindow, signal?: AbortSignal): Promise<ConnectorResult> {
  const config = getConfig();

  // De campagnes eerst: hun fase en exploitatie gelden ook voor de
  // onderliggende advertentiegroepen en advertenties.
  const campaignRows = await runReport(config, "AUCTION_CAMPAIGN", ["campaign_id"], CAMPAIGN_METRICS, window, signal);

  const context = new Map<string, CampaignContext>();
  const campaigns: PaidAdsCampaign[] = [];

  for (const row of campaignRows) {
    const id = row.dimensions.campaign_id;
    if (!id) continue;

    const name = row.metrics.campaign_name || id;
    const objective = pseudoObjective(row.metrics.objective_type);
    const phase = resolvePhase(name, objective);
    const metrics = metricsFrom(row);
    const ctx: CampaignContext = {
      phase,
      businessUnit: resolveBusinessUnit(name),
      campaignGroup: resolveCampaignGroup(name),
      name,
    };
    context.set(id, ctx);

    if (!hasVolume(metrics)) continue;

    campaigns.push({
      id,
      name,
      platform: "tiktok",
      phase,
      businessUnit: ctx.businessUnit,
      objective: resolveObjectiveLabel(objective, null),
      campaignGroup: ctx.campaignGroup,
      metrics,
    });
  }

  // Advertentiegroepen, advertenties en de dagreeks zijn onafhankelijk van
  // elkaar en mogen tegelijk lopen.
  const [adGroupRows, adRows, dailyRows] = await Promise.all([
    runReport(config, "AUCTION_ADGROUP", ["adgroup_id"], ADGROUP_METRICS, window, signal),
    runReport(config, "AUCTION_AD", ["ad_id"], AD_METRICS, window, signal),
    runReport(config, "AUCTION_CAMPAIGN", ["campaign_id", "stat_time_day"], DAILY_METRICS, window, signal),
  ]);

  const adSets: PaidAdsAdSet[] = [];
  for (const row of adGroupRows) {
    const id = row.dimensions.adgroup_id;
    const campaignId = row.metrics.campaign_id;
    if (!id || !campaignId) continue;

    const name = row.metrics.adgroup_name || id;
    const metrics = metricsFrom(row);
    if (!hasVolume(metrics)) continue;

    adSets.push({
      id,
      name,
      campaignId,
      platform: "tiktok",
      phase: context.get(campaignId)?.phase ?? resolvePhase(name, ""),
      audienceType: resolveAudienceType(name),
      metrics,
    });
  }

  const ads: PaidAdsAd[] = [];
  for (const row of adRows) {
    const id = row.dimensions.ad_id;
    const adSetId = row.metrics.adgroup_id;
    const campaignId = row.metrics.campaign_id;
    if (!id || !adSetId || !campaignId) continue;

    const name = row.metrics.ad_name || id;
    const metrics = metricsFrom(row);
    if (!hasVolume(metrics)) continue;

    ads.push({
      id,
      name,
      adSetId,
      campaignId,
      platform: "tiktok",
      phase: context.get(campaignId)?.phase ?? resolvePhase(name, ""),
      format: resolveFormat(name),
      hook: resolveHook(name),
      // TikTok rapporteert videoweergaven niet los in deze reportage-endpoint.
      videoViews3s: null,
      metrics,
    });
  }

  // De dagreeks komt op campagneniveau binnen, zodat het dagtotaal gelijk
  // blijft aan de som van de campagnes.
  const byDate = new Map<string, PaidMetrics>();
  for (const row of dailyRows) {
    // TikTok levert `stat_time_day` als "JJJJ-MM-DD HH:MM:SS".
    const date = row.dimensions.stat_time_day?.slice(0, 10);
    if (!date) continue;

    const point = byDate.get(date) ?? emptyMetrics();
    addMetrics(point, metricsFrom(row));
    byDate.set(date, point);
  }

  const daily: ConnectorDailyPoint[] = [...byDate.entries()]
    .map(([date, metrics]) => ({ date, metrics }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { campaigns, adSets, ads, daily };
}

/**
 * Totalen voor een vergelijkingsperiode, op campagneniveau — net als bij de
 * andere koppelingen.
 */
async function fetchTotals(window: FetchWindow, signal?: AbortSignal): Promise<PaidMetrics> {
  const config = getConfig();
  const rows = await runReport(config, "AUCTION_CAMPAIGN", ["campaign_id"], CAMPAIGN_METRICS, window, signal);

  const totals = emptyMetrics();
  for (const row of rows) {
    addMetrics(totals, metricsFrom(row));
  }
  return totals;
}

export const tiktokConnector: PaidConnector = {
  platform: "tiktok",
  isConfigured: isTikTokConfigured,
  fetchAll,
  fetchTotals,
};
