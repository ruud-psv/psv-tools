/**
 * Koppeling met de Google Ads API (v18, REST).
 *
 * Alles loopt via één endpoint: `customers/<id>/googleAds:searchStream`, met
 * een GAQL-query in de body. Campagnes, advertentiegroepen, advertenties en de
 * dagreeks verschillen alleen in hun FROM en hun kolommen, dus er is één
 * ophaalfunctie die een query uitvoert en de rijen teruggeeft.
 *
 * Benodigde environment variabelen:
 *   GOOGLE_ADS_DEVELOPER_TOKEN   Developer token van het Google Ads API Center.
 *   GOOGLE_ADS_CUSTOMER_ID       Account-ID, met of zonder streepjes.
 *   GOOGLE_ADS_REFRESH_TOKEN     Refresh token met scope `adwords`.
 *   GOOGLE_ADS_CLIENT_ID         OAuth-client uit Google Cloud.
 *   GOOGLE_ADS_CLIENT_SECRET     Bijbehorend secret.
 * Optioneel:
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID  Manager-account (MCC) waaronder het account
 *                                 valt. Verplicht zodra het account onder een
 *                                 MCC hangt — zonder deze header geeft Google
 *                                 een autorisatiefout.
 *   GOOGLE_ADS_API_VERSION        API-versie, standaard v18.
 *   GOOGLE_ADS_CONVERSION_METRIC  "conversions" (standaard) telt de acties die
 *                                 in Google Ads als conversie zijn aangemerkt,
 *                                 "all" telt `all_conversions`.
 *
 * Google Ads rapporteert geen uniek bereik in deze rapportage-endpoints, dus
 * `reach` blijft 0. Het dashboard rekent frequentie uit impressies / bereik en
 * laat die bij 0 leeg — beter dan een verzonnen getal.
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

const ADS_HOST = "https://googleads.googleapis.com";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
/**
 * Google ondersteunt een API-versie ongeveer een jaar. Een verlopen versie geeft
 * geen nette foutmelding maar een HTML-404, wat verderop als een onleesbaar
 * antwoord binnenkomt. Stel bij via `GOOGLE_ADS_API_VERSION`.
 */
const DEFAULT_API_VERSION = "v22";

/** Bedragen komen in micro's binnen: 1 euro is 1.000.000. */
const MICROS_PER_EURO = 1_000_000;

/* ---------------------------------------------------------------- rijen -- */

/**
 * Eén rij zoals `searchStream` hem teruggeeft. GAQL is snake_case, maar de
 * REST-respons is camelCase — `metrics.cost_micros` komt binnen als
 * `metrics.costMicros`. Gehele getallen komen als string, `conversions` als
 * decimaal getal.
 */
interface GoogleRow {
  campaign?: {
    id?: string;
    name?: string;
    advertisingChannelType?: string;
    biddingStrategyType?: string;
  };
  adGroup?: { id?: string; name?: string };
  adGroupAd?: { ad?: { id?: string; name?: string; type?: string } };
  metrics?: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    conversions?: number;
    allConversions?: number;
  };
  segments?: { date?: string };
}

/** `searchStream` levert een array met brokken; elk brok heeft eigen rijen. */
interface GoogleStreamChunk {
  results?: GoogleRow[];
  error?: GoogleApiError;
}

interface GoogleApiError {
  code?: number;
  message?: string;
  status?: string;
}

/* ------------------------------------------------------------- objectief -- */

/**
 * Google Ads kent geen doelstelling zoals Meta. De biedstrategie zegt het meest
 * over de bedoeling van een campagne — daar stuurt de adverteerder immers op —
 * en het kanaaltype is de terugval. Beide worden vertaald naar een term die
 * `mapping.ts` al kent, zodat de fase-indeling op één plek gedefinieerd blijft.
 */
const OBJECTIVE_BY_BIDDING: Record<string, string> = {
  TARGET_CPA: "conversion",
  MAXIMIZE_CONVERSIONS: "conversion",
  TARGET_ROAS: "conversion",
  MAXIMIZE_CONVERSION_VALUE: "conversion",
  COMMISSION: "conversion",
  MANUAL_CPC: "traffic",
  MAXIMIZE_CLICKS: "traffic",
  TARGET_SPEND: "traffic",
  ENHANCED_CPC: "traffic",
  TARGET_IMPRESSION_SHARE: "awareness",
  MANUAL_CPM: "awareness",
  TARGET_CPM: "awareness",
  MANUAL_CPV: "video_view",
  TARGET_CPV: "video_view",
};

const OBJECTIVE_BY_CHANNEL: Record<string, string> = {
  SEARCH: "traffic",
  SHOPPING: "conversion",
  PERFORMANCE_MAX: "conversion",
  SMART: "conversion",
  LOCAL: "conversion",
  LOCAL_SERVICES: "conversion",
  MULTI_CHANNEL: "conversion",
  DISPLAY: "awareness",
  DEMAND_GEN: "awareness",
  DISCOVERY: "awareness",
  VIDEO: "video_view",
};

/** De term waarmee `mapping.ts` fase en doelstellinglabel bepaalt. */
function pseudoObjective(row: GoogleRow): string {
  const bidding = row.campaign?.biddingStrategyType;
  if (bidding && OBJECTIVE_BY_BIDDING[bidding]) return OBJECTIVE_BY_BIDDING[bidding];

  const channel = row.campaign?.advertisingChannelType;
  if (channel && OBJECTIVE_BY_CHANNEL[channel]) return OBJECTIVE_BY_CHANNEL[channel];

  return "";
}

/* --------------------------------------------------------------- query -- */

/** De tellers die elke query nodig heeft. */
const METRIC_FIELDS = [
  "metrics.cost_micros",
  "metrics.impressions",
  "metrics.clicks",
  "metrics.conversions",
  "metrics.all_conversions",
];

const CAMPAIGN_FIELDS = [
  "campaign.id",
  "campaign.name",
  "campaign.advertising_channel_type",
  "campaign.bidding_strategy_type",
];

/**
 * Bouwt een GAQL-query. De datums worden gecontroleerd voordat ze in de query
 * belanden: ze komen uit de route en niet van de gebruiker, maar een query is
 * een string en dan hoort er een slot op.
 */
function buildQuery(select: string[], from: string, window: FetchWindow): string {
  for (const value of [window.from, window.to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new ConnectorConfigError(`Ongeldige datum voor de Google Ads-query: ${value}`);
    }
  }
  return [
    `SELECT ${select.join(", ")}`,
    `FROM ${from}`,
    `WHERE segments.date BETWEEN '${window.from}' AND '${window.to}'`,
  ].join(" ");
}

/* -------------------------------------------------------------- config -- */

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/** Google wil het account-ID als tien cijfers, zonder streepjes. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

interface GoogleConfig {
  developerToken: string;
  customerId: string;
  loginCustomerId: string | null;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  apiVersion: string;
  useAllConversions: boolean;
}

function getConfig(): GoogleConfig {
  const developerToken = readEnv("GOOGLE_ADS_DEVELOPER_TOKEN");
  const customerId = readEnv("GOOGLE_ADS_CUSTOMER_ID");
  const refreshToken = readEnv("GOOGLE_ADS_REFRESH_TOKEN");
  const clientId = readEnv("GOOGLE_ADS_CLIENT_ID");
  const clientSecret = readEnv("GOOGLE_ADS_CLIENT_SECRET");

  const missing = [
    !developerToken && "GOOGLE_ADS_DEVELOPER_TOKEN",
    !customerId && "GOOGLE_ADS_CUSTOMER_ID",
    !refreshToken && "GOOGLE_ADS_REFRESH_TOKEN",
    !clientId && "GOOGLE_ADS_CLIENT_ID",
    !clientSecret && "GOOGLE_ADS_CLIENT_SECRET",
  ].filter((name): name is string => Boolean(name));

  if (missing.length) {
    throw new ConnectorConfigError(
      `Google Ads-configuratie ontbreekt: ${missing.join(", ")}. Zet deze als environment variable in Vercel.`
    );
  }

  assertCleanSecret("GOOGLE_ADS_DEVELOPER_TOKEN", developerToken!);
  assertCleanSecret("GOOGLE_ADS_CLIENT_ID", clientId!);
  assertCleanSecret("GOOGLE_ADS_CLIENT_SECRET", clientSecret!);
  assertCleanSecret("GOOGLE_ADS_REFRESH_TOKEN", refreshToken!);

  const loginCustomerId = readEnv("GOOGLE_ADS_LOGIN_CUSTOMER_ID");

  return {
    developerToken: developerToken!,
    customerId: digitsOnly(customerId!),
    loginCustomerId: loginCustomerId ? digitsOnly(loginCustomerId) : null,
    clientId: clientId!,
    clientSecret: clientSecret!,
    refreshToken: refreshToken!,
    apiVersion: readEnv("GOOGLE_ADS_API_VERSION") ?? DEFAULT_API_VERSION,
    useAllConversions: (readEnv("GOOGLE_ADS_CONVERSION_METRIC") ?? "conversions") === "all",
  };
}

export function isGoogleConfigured(): boolean {
  try {
    getConfig();
    return true;
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------- OAuth -- */

/**
 * Een access token is een uur geldig. Eén ophaalronde doet meerdere queries over
 * drie periodes; zonder cache zou elke query opnieuw een token halen. De cache
 * staat in module-scope en overleeft dus zolang de serverless instance leeft.
 */
let cachedToken: { value: string; expiresAt: number } | null = null;

/** Een minuut marge, zodat een token niet vlak na de check alsnog verloopt. */
const TOKEN_MARGIN_MS = 60_000;

/** Haalt geheimen uit een foutmelding voordat die naar de log of het scherm gaat. */
function redact(text: string, secrets: (string | null)[]): string {
  let safe = text;
  for (const secret of secrets) {
    if (secret) safe = safe.split(secret).join("***");
  }
  return safe;
}

async function getAccessToken(config: GoogleConfig, signal?: AbortSignal): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_MARGIN_MS > Date.now()) {
    return cachedToken.value;
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    cache: "no-store",
    signal,
  });

  const text = await res.text();
  const secrets = [config.clientSecret, config.refreshToken];

  let parsed: { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ConnectorRequestError(
      `Google gaf een onleesbaar antwoord op de tokenaanvraag (${res.status}).`,
      res.status,
      redact(text.slice(0, 300), secrets)
    );
  }

  if (!res.ok || !parsed.access_token) {
    // Een verlopen of ingetrokken refresh token is de gewone oorzaak, en die
    // los je op in Google Cloud — niet in de code.
    const detail = parsed.error_description ?? parsed.error ?? text.slice(0, 300);
    throw new ConnectorRequestError(
      `Google OAuth — ${res.status} ${res.statusText}: ${redact(detail, secrets)}`,
      res.status,
      redact(detail, secrets)
    );
  }

  cachedToken = {
    value: parsed.access_token,
    expiresAt: Date.now() + (parsed.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

/* ------------------------------------------------------------- ophalen -- */

/**
 * Voert één GAQL-query uit. `searchStream` levert het volledige resultaat in
 * één respons als een array van brokken, dus er is geen paginering nodig.
 */
async function runQuery(
  config: GoogleConfig,
  query: string,
  signal?: AbortSignal
): Promise<GoogleRow[]> {
  const token = await getAccessToken(config, signal);
  const url = `${ADS_HOST}/${config.apiVersion}/customers/${config.customerId}/googleAds:searchStream`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": config.developerToken,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (config.loginCustomerId) headers["login-customer-id"] = config.loginCustomerId;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
    cache: "no-store",
    signal,
  });

  const text = await res.text();
  const secrets = [token, config.developerToken, config.clientSecret, config.refreshToken];

  let body: GoogleStreamChunk[] | GoogleStreamChunk;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ConnectorRequestError(
      `Google Ads gaf een onleesbaar antwoord (${res.status}).`,
      res.status,
      redact(text.slice(0, 300), secrets)
    );
  }

  // Een fout komt als los object terug, of als eerste brok van de array.
  const chunks = Array.isArray(body) ? body : [body];
  const failure = chunks.find((chunk) => chunk?.error)?.error;

  if (!res.ok || failure) {
    const detail = failure?.message ?? text.slice(0, 300);
    throw new ConnectorRequestError(
      `Google Ads API — ${res.status} ${res.statusText}: ${redact(detail, secrets)}`,
      res.status,
      redact(detail, secrets)
    );
  }

  return chunks.flatMap((chunk) => chunk.results ?? []);
}

/* -------------------------------------------------------------- parsen -- */

function num(value: string | number | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metricsFrom(config: GoogleConfig, row: GoogleRow): PaidMetrics {
  const metrics = row.metrics;
  return {
    spend: num(metrics?.costMicros) / MICROS_PER_EURO,
    impressions: num(metrics?.impressions),
    // Google Ads rapporteert geen uniek bereik; zie de toelichting bovenaan.
    reach: 0,
    clicks: num(metrics?.clicks),
    results: config.useAllConversions ? num(metrics?.allConversions) : num(metrics?.conversions),
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

/** Leesbare naam voor een advertentie die er in Google Ads geen heeft. */
function adLabel(ad: { id?: string; name?: string; type?: string } | undefined, fallbackId: string): string {
  if (ad?.name) return ad.name;
  if (ad?.type) {
    const pretty = ad.type.toLowerCase().replace(/_/g, " ");
    return `${pretty.charAt(0).toUpperCase()}${pretty.slice(1)} ${fallbackId}`;
  }
  return fallbackId;
}

/* ---------------------------------------------------------- connector -- */

/** Wat we van een campagne onthouden om advertentiegroepen en ads in te delen. */
interface CampaignContext {
  phase: PaidPhase;
  businessUnit: string;
  campaignGroup: string | null;
  name: string;
}

async function fetchAll(window: FetchWindow, signal?: AbortSignal): Promise<ConnectorResult> {
  const config = getConfig();

  // De campagnes eerst: hun fase en exploitatie gelden ook voor de
  // onderliggende advertentiegroepen en advertenties.
  const campaignRows = await runQuery(
    config,
    buildQuery([...CAMPAIGN_FIELDS, ...METRIC_FIELDS], "campaign", window),
    signal
  );

  const context = new Map<string, CampaignContext>();
  const campaigns: PaidAdsCampaign[] = [];

  for (const row of campaignRows) {
    const id = row.campaign?.id;
    if (!id) continue;

    const name = row.campaign?.name ?? id;
    const objective = pseudoObjective(row);
    const phase = resolvePhase(name, objective);
    const metrics = metricsFrom(config, row);
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
      platform: "google",
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
    runQuery(
      config,
      buildQuery(["campaign.id", "ad_group.id", "ad_group.name", ...METRIC_FIELDS], "ad_group", window),
      signal
    ),
    runQuery(
      config,
      buildQuery(
        [
          "campaign.id",
          "ad_group.id",
          "ad_group_ad.ad.id",
          "ad_group_ad.ad.name",
          "ad_group_ad.ad.type",
          ...METRIC_FIELDS,
        ],
        "ad_group_ad",
        window
      ),
      signal
    ),
    runQuery(
      config,
      buildQuery([...CAMPAIGN_FIELDS, "segments.date", ...METRIC_FIELDS], "campaign", window),
      signal
    ),
  ]);

  // Een advertentiegroep is bij Google wat een advertentieset bij Meta is.
  const adSets: PaidAdsAdSet[] = [];
  for (const row of adGroupRows) {
    const id = row.adGroup?.id;
    const campaignId = row.campaign?.id;
    if (!id || !campaignId) continue;

    const name = row.adGroup?.name ?? id;
    const metrics = metricsFrom(config, row);
    if (!hasVolume(metrics)) continue;

    adSets.push({
      id,
      name,
      campaignId,
      platform: "google",
      phase: context.get(campaignId)?.phase ?? resolvePhase(name, ""),
      audienceType: resolveAudienceType(name),
      metrics,
    });
  }

  const ads: PaidAdsAd[] = [];
  for (const row of adRows) {
    const ad = row.adGroupAd?.ad;
    const id = ad?.id;
    const adSetId = row.adGroup?.id;
    const campaignId = row.campaign?.id;
    if (!id || !adSetId || !campaignId) continue;

    const metrics = metricsFrom(config, row);
    if (!hasVolume(metrics)) continue;

    const name = adLabel(ad, id);

    ads.push({
      id,
      name,
      adSetId,
      campaignId,
      platform: "google",
      phase: context.get(campaignId)?.phase ?? resolvePhase(name, ""),
      // Het advertentietype van Google is een betrouwbaarder signaal voor het
      // format dan de naam, die bij een responsive ad vaak leeg is.
      format: resolveFormat(name, ad?.type ?? null),
      hook: resolveHook(name),
      // Google rapporteert videoweergaven in een eigen metric die niet op elk
      // advertentietype bestaat; die blijft hier leeg.
      videoViews3s: null,
      metrics,
    });
  }

  // De dagreeks komt op campagneniveau binnen, zodat het dagtotaal gelijk blijft
  // aan de som van de campagnes.
  const byDate = new Map<string, PaidMetrics>();
  for (const row of dailyRows) {
    const date = row.segments?.date;
    if (!date) continue;

    const point = byDate.get(date) ?? emptyMetrics();
    addMetrics(point, metricsFrom(config, row));
    byDate.set(date, point);
  }

  const daily: ConnectorDailyPoint[] = [...byDate.entries()]
    .map(([date, metrics]) => ({ date, metrics }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { campaigns, adSets, ads, daily };
}

/**
 * Totalen voor een vergelijkingsperiode. Net als bij Meta op campagneniveau,
 * zodat dezelfde rijen op dezelfde manier geteld worden als in de hoofdperiode.
 */
async function fetchTotals(window: FetchWindow, signal?: AbortSignal): Promise<PaidMetrics> {
  const config = getConfig();
  const rows = await runQuery(
    config,
    buildQuery([...CAMPAIGN_FIELDS, ...METRIC_FIELDS], "campaign", window),
    signal
  );

  const totals = emptyMetrics();
  for (const row of rows) {
    addMetrics(totals, metricsFrom(config, row));
  }
  return totals;
}

export const googleConnector: PaidConnector = {
  platform: "google",
  isConfigured: isGoogleConfigured,
  fetchAll,
  fetchTotals,
};
