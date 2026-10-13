/**
 * Koppeling met de Meta Marketing API (Facebook + Instagram).
 *
 * Alles loopt via de Insights-endpoint van het advertentieaccount. Die geeft op
 * elk niveau — campagne, advertentieset, advertentie — dezelfde tellers terug,
 * dus er is één ophaalfunctie met een `level`-parameter.
 *
 * Benodigde environment variabelen:
 *   META_ADS_ACCESS_TOKEN   System user token met `ads_read` op het account.
 *   META_ADS_ACCOUNT_ID     Account-ID, met of zonder `act_`-prefix.
 * Optioneel:
 *   META_ADS_API_VERSION    Graph-versie, standaard v21.0.
 *   META_ADS_CLICK_METRIC   "link" (standaard) telt linkkliks, "all" telt alle
 *                           kliks inclusief reacties en profielbezoeken.
 *
 * Het token gaat als `Authorization`-header mee en nooit in de URL: Graph
 * ondersteunt beide, maar querystrings belanden in logs en foutmeldingen.
 */

import {
  emptyMetrics,
  type PaidAdsAd,
  type PaidAdsAdSet,
  type PaidAdsCampaign,
  type PaidAdsDemographic,
  type PaidMetrics,
  type PaidPhase,
  type PaidTargeting,
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

const GRAPH_HOST = "https://graph.facebook.com";
const DEFAULT_API_VERSION = "v21.0";

/**
 * Harde bovengrens op het doorbladeren. Meta levert maximaal `limit` rijen per
 * pagina; zonder deze grens kan een seizoenperiode met veel campagnes een
 * request minutenlang openhouden.
 */
const MAX_PAGES = 25;
const PAGE_SIZE = 500;

/**
 * Grootste periode die Meta in één synchrone aanvraag aankan. Dertig dagen komt
 * betrouwbaar door; negentig geeft een 500 en een heel seizoen een
 * "Service temporarily unavailable". Zie `splitWindow`.
 */
const MAX_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

/** Rijen zoals de Insights-endpoint ze teruggeeft: alle getallen als string. */
interface MetaInsightRow {
  date_start?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  objective?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  /** Alleen bij de uitsplitsing naar leeftijd en geslacht. */
  age?: string;
  gender?: string;
  actions?: { action_type: string; value: string }[];
  /** Zelfde vorm als `actions`, maar met de waarde in euro's in plaats van aantallen. */
  action_values?: { action_type: string; value: string }[];
}

interface MetaInsightsResponse {
  data?: MetaInsightRow[];
  paging?: { next?: string };
  error?: { message?: string; type?: string; code?: number };
}

/**
 * Welke actietypes als "resultaat" tellen, op volgorde van voorkeur. De eerste
 * die in een rij voorkomt wint — zo telt een aankoopcampagne aankopen en geen
 * losse kliks. Pas deze tabel aan zodra PSV een ander conversietype meet.
 */
const RESULT_ACTIONS: Record<PaidPhase, string[]> = {
  conversie: [
    "purchase",
    "omni_purchase",
    "offsite_conversion.fb_pixel_purchase",
    "onsite_web_purchase",
    "lead",
    "offsite_conversion.fb_pixel_lead",
    "onsite_conversion.lead_grouped",
    "complete_registration",
    "offsite_conversion.fb_pixel_complete_registration",
    "submit_application",
  ],
  verkeer: ["link_click", "landing_page_view"],
  bereik: ["video_view", "post_engagement"],
};

const CAMPAIGN_FIELDS = [
  "campaign_id",
  "campaign_name",
  "objective",
  "spend",
  "impressions",
  "reach",
  "clicks",
  "inline_link_clicks",
  "actions",
  "action_values",
].join(",");

const ADSET_FIELDS = [
  "campaign_id",
  "adset_id",
  "adset_name",
  "objective",
  "spend",
  "impressions",
  "reach",
  "clicks",
  "inline_link_clicks",
  "actions",
  "action_values",
].join(",");

const AD_FIELDS = [
  "campaign_id",
  "adset_id",
  "ad_id",
  "ad_name",
  "objective",
  "spend",
  "impressions",
  "reach",
  "clicks",
  "inline_link_clicks",
  "actions",
  "action_values",
].join(",");

/** Advertentiesets uitgesplitst naar leeftijd en geslacht (via `breakdowns`). */
const DEMOGRAPHIC_FIELDS = [
  "campaign_id",
  "adset_id",
  "objective",
  "spend",
  "impressions",
  "reach",
  "clicks",
  "inline_link_clicks",
  "actions",
  "action_values",
].join(",");

const DAILY_FIELDS = [
  "campaign_id",
  "campaign_name",
  "objective",
  "spend",
  "impressions",
  "reach",
  "clicks",
  "inline_link_clicks",
  "actions",
  "action_values",
].join(",");

/* ------------------------------------------------------------- config -- */

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

interface MetaConfig {
  token: string;
  accountPath: string;
  apiVersion: string;
  useLinkClicks: boolean;
}

function getConfig(): MetaConfig {
  const token = readEnv("META_ADS_ACCESS_TOKEN");
  const accountId = readEnv("META_ADS_ACCOUNT_ID");

  const missing = [
    !token && "META_ADS_ACCESS_TOKEN",
    !accountId && "META_ADS_ACCOUNT_ID",
  ].filter((name): name is string => Boolean(name));

  if (missing.length) {
    throw new ConnectorConfigError(
      `Meta-configuratie ontbreekt: ${missing.join(", ")}. Zet deze als environment variable in Vercel.`
    );
  }

  assertCleanSecret("META_ADS_ACCESS_TOKEN", token!);

  return {
    token: token!,
    // Het account-ID wordt met en zonder prefix aangeleverd; Graph wil `act_`.
    accountPath: accountId!.startsWith("act_") ? accountId! : `act_${accountId}`,
    apiVersion: readEnv("META_ADS_API_VERSION") ?? DEFAULT_API_VERSION,
    useLinkClicks: (readEnv("META_ADS_CLICK_METRIC") ?? "link") !== "all",
  };
}

export function isMetaConfigured(): boolean {
  try {
    getConfig();
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------ ophalen -- */

/** Haalt het token uit een foutmelding voordat die naar de log of het scherm gaat. */
function redact(text: string, token: string): string {
  return token ? text.split(token).join("***") : text;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Knipt een periode in blokken van hoogstens `MAX_WINDOW_DAYS` dagen.
 *
 * Meta weigert een synchrone insights-aanvraag zodra het resultaat te groot
 * wordt: over 90 dagen komt er een 500 terug, over een heel seizoen een
 * "Service temporarily unavailable". Officieel hoort daar een asynchrone
 * rapportage-job bij; dit haalt hetzelfde op met de endpoint die er al is.
 *
 * Die ruil kost verzoeken, en dat is de zwakke plek. Dertig dagen kost er
 * ongeveer zes, negentig dagen vijftien, en een vergevorderd seizoen loopt op
 * richting de veertig. Ze tellen allemaal mee voor hetzelfde app-quotum, dus
 * een paar zware weergaven achter elkaar leveren "Application request limit
 * reached" op — óók voor de korte periodes, die het op zichzelf prima doen.
 *
 * Wie dit structureel wil oplossen bouwt de asynchrone rapportage-API in
 * (aanvragen, pollen, downloaden): dat is één verzoek per rapport in plaats
 * van tientallen, en het is er precies voor gemaakt.
 */
function splitWindow(window: FetchWindow): FetchWindow[] {
  const end = new Date(`${window.to}T00:00:00.000Z`);
  const chunks: FetchWindow[] = [];

  let from = new Date(`${window.from}T00:00:00.000Z`);
  while (from <= end) {
    const to = new Date(
      Math.min(from.getTime() + (MAX_WINDOW_DAYS - 1) * DAY_MS, end.getTime())
    );
    chunks.push({ from: iso(from), to: iso(to) });
    from = new Date(to.getTime() + DAY_MS);
  }
  return chunks;
}

/** Telt twee getallen op die als string binnenkomen. */
function addNumeric(a: string | undefined, b: string | undefined): string {
  return String(num(a) + num(b));
}

function mergeActions(
  a: MetaInsightRow["actions"],
  b: MetaInsightRow["actions"]
): MetaInsightRow["actions"] {
  const byType = new Map<string, number>();
  for (const action of [...(a ?? []), ...(b ?? [])]) {
    byType.set(action.action_type, (byType.get(action.action_type) ?? 0) + num(action.value));
  }
  return [...byType.entries()].map(([action_type, value]) => ({
    action_type,
    value: String(value),
  }));
}

/**
 * Telt de rijen van hetzelfde object uit opeenvolgende blokken bij elkaar op,
 * zodat de rest van de connector niet hoeft te weten dat er geknipt is.
 *
 * `reach` is daarbij een benadering: unieke mensen uit twee periodes zijn niet
 * op te tellen zonder dubbeltelling. Meta levert geen ontdubbeld bereik over
 * een samengesteld venster, en het dashboard telt bereik elders ook al op over
 * campagnes heen — de vertekening is dus niet nieuw, wel groter.
 */
function mergeRows(rows: MetaInsightRow[], perDay: boolean): MetaInsightRow[] {
  const byKey = new Map<string, MetaInsightRow>();

  for (const row of rows) {
    const id = row.ad_id ?? row.adset_id ?? row.campaign_id ?? "";
    // Bij een uitsplitsing is elke leeftijd/geslacht-combinatie een eigen rij.
    const segment = row.age || row.gender ? `|${row.age ?? ""}|${row.gender ?? ""}` : "";
    const key = (perDay ? `${id}|${row.date_start ?? ""}` : id) + segment;

    const found = byKey.get(key);
    if (!found) {
      byKey.set(key, { ...row });
      continue;
    }

    found.spend = addNumeric(found.spend, row.spend);
    found.impressions = addNumeric(found.impressions, row.impressions);
    found.reach = addNumeric(found.reach, row.reach);
    found.clicks = addNumeric(found.clicks, row.clicks);
    found.inline_link_clicks = addNumeric(found.inline_link_clicks, row.inline_link_clicks);
    found.actions = mergeActions(found.actions, row.actions);
    found.action_values = mergeActions(found.action_values, row.action_values);
  }

  return [...byKey.values()];
}

/**
 * Hoeveel blokken er tegelijk mogen lopen.
 *
 * Alles tegelijk afvuren levert "Service temporarily unavailable" op: Meta
 * knijpt af zodra er te veel zware aanvragen naast elkaar staan. Alles achter
 * elkaar zetten kost dan weer meer tijd dan de route mag draaien. Twee tegelijk
 * komt er doorheen zonder het tijdslot op te souperen.
 */
const CHUNK_CONCURRENCY = 2;

/**
 * Haalt één Insights-query op over de volledige periode. Lange periodes gaan
 * in blokken, die in kleine groepjes lopen en daarna worden samengeteld.
 */
async function fetchInsights(
  config: MetaConfig,
  level: "account" | "campaign" | "adset" | "ad",
  fields: string,
  window: FetchWindow,
  options: { timeIncrement?: number; breakdowns?: string; signal?: AbortSignal } = {}
): Promise<MetaInsightRow[]> {
  const chunks = splitWindow(window);
  if (chunks.length === 1) {
    return fetchWindow(config, level, fields, window, options);
  }

  const rows: MetaInsightRow[] = [];
  for (let i = 0; i < chunks.length; i += CHUNK_CONCURRENCY) {
    const group = await Promise.all(
      chunks
        .slice(i, i + CHUNK_CONCURRENCY)
        .map((chunk) => fetchWindow(config, level, fields, chunk, options))
    );
    rows.push(...group.flat());
  }

  return mergeRows(rows, Boolean(options.timeIncrement));
}

/**
 * Doorloopt alle pagina's van één Insights-query. Meta geeft de volgende
 * pagina als volledige URL terug; die bevat het token niet meer, dus de header
 * gaat elke keer opnieuw mee.
 */
async function fetchWindow(
  config: MetaConfig,
  level: "account" | "campaign" | "adset" | "ad",
  fields: string,
  window: FetchWindow,
  options: { timeIncrement?: number; breakdowns?: string; signal?: AbortSignal } = {}
): Promise<MetaInsightRow[]> {
  const url = new URL(`${GRAPH_HOST}/${config.apiVersion}/${config.accountPath}/insights`);
  url.searchParams.set("level", level);
  url.searchParams.set("fields", fields);
  url.searchParams.set("time_range", JSON.stringify({ since: window.from, until: window.to }));
  url.searchParams.set("limit", String(PAGE_SIZE));
  // Zonder deze vlag rapporteert Meta op het attributievenster van de API in
  // plaats van dat van het account — dan wijken de cijfers af van Ads Manager.
  url.searchParams.set("use_unified_attribution_setting", "true");
  if (options.timeIncrement) url.searchParams.set("time_increment", String(options.timeIncrement));
  if (options.breakdowns) url.searchParams.set("breakdowns", options.breakdowns);

  const rows: MetaInsightRow[] = [];
  let next: string | undefined = url.toString();
  let page = 0;

  while (next && page < MAX_PAGES) {
    const res: Response = await fetch(next, {
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json" },
      cache: "no-store",
      signal: options.signal,
    });

    const text = await res.text();
    let body: MetaInsightsResponse;
    try {
      body = JSON.parse(text) as MetaInsightsResponse;
    } catch {
      throw new ConnectorRequestError(
        `Meta gaf een onleesbaar antwoord (${res.status}).`,
        res.status,
        redact(text.slice(0, 300), config.token)
      );
    }

    if (!res.ok || body.error) {
      const detail = body.error?.message ?? text.slice(0, 300);
      // Het account-ID staat er bewust bij: (#200) zegt niet wélk account
      // geweigerd werd, en dat is precies wat je wil weten als de koppeling
      // naar het verkeerde account wijst. Account-ID's zijn niet geheim.
      throw new ConnectorRequestError(
        `Meta Marketing API (${config.accountPath}) — ${res.status} ${res.statusText}: ${redact(detail, config.token)}`,
        res.status,
        redact(detail, config.token)
      );
    }

    rows.push(...(body.data ?? []));
    next = body.paging?.next;
    page += 1;
  }

  return rows;
}

/* -------------------------------------------------------------- parsen -- */

function num(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Telt alle acties van één type bij elkaar op. */
function actionValue(row: MetaInsightRow, actionType: string): number {
  return (row.actions ?? [])
    .filter((a) => a.action_type === actionType)
    .reduce((sum, a) => sum + num(a.value), 0);
}

/**
 * Zoekt het eerste actietype uit de prioriteitslijst dat in de rij voorkomt.
 * Geeft ook het gevonden type terug: dat bepaalt of een campagne als aankopen,
 * leads of registraties wordt gelabeld.
 */
function pickResult(row: MetaInsightRow, phase: PaidPhase): { value: number; actionType: string | null } {
  for (const actionType of RESULT_ACTIONS[phase]) {
    const value = actionValue(row, actionType);
    if (value > 0) return { value, actionType };
  }
  return { value: 0, actionType: null };
}

/**
 * Actietypes waarvan de waarde als omzet telt, op volgorde van voorkeur. Ze
 * overlappen (`omni_purchase` bevat de pixelaankopen al), dus alleen het eerste
 * type dat voorkomt telt — anders wordt dezelfde verkoop dubbel geteld.
 */
const REVENUE_ACTIONS = [
  "omni_purchase",
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_web_purchase",
];

function revenueFrom(row: MetaInsightRow): number {
  for (const actionType of REVENUE_ACTIONS) {
    const value = (row.action_values ?? [])
      .filter((a) => a.action_type === actionType)
      .reduce((sum, a) => sum + num(a.value), 0);
    if (value > 0) return value;
  }
  return 0;
}

function metricsFrom(config: MetaConfig, row: MetaInsightRow, phase: PaidPhase): PaidMetrics {
  // In "link"-modus telt uitsluitend `inline_link_clicks`. Nul linkkliks is een
  // echte nul: terugvallen op `clicks` zou bij een bereikcampagne de reacties en
  // profielbezoeken meetellen, en die rij dus op een andere noemer zetten dan de
  // rest — met een CTR en CVR die niet meer vergelijkbaar zijn.
  const clicks = config.useLinkClicks ? num(row.inline_link_clicks) : num(row.clicks);

  return {
    spend: num(row.spend),
    impressions: num(row.impressions),
    reach: num(row.reach),
    clicks,
    results: pickResult(row, phase).value,
    revenue: revenueFrom(row),
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
  target.revenue += source.revenue;
}

/* ---------------------------------------------------------- connector -- */

/** Wat we van een campagne onthouden om adsets en ads te kunnen indelen. */
interface CampaignContext {
  phase: PaidPhase;
  businessUnit: string;
  campaignGroup: string | null;
  name: string;
}

/** Campagnerijen naar campagnes, plus de context per campagne-id. */
function toCampaigns(
  config: MetaConfig,
  campaignRows: MetaInsightRow[]
): { campaigns: PaidAdsCampaign[]; context: Map<string, CampaignContext> } {
  const context = new Map<string, CampaignContext>();
  const campaigns: PaidAdsCampaign[] = [];

  for (const row of campaignRows) {
    const id = row.campaign_id;
    if (!id) continue;

    const name = row.campaign_name ?? id;
    const phase = resolvePhase(name, row.objective ?? "");
    const metrics = metricsFrom(config, row, phase);
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
      platform: "meta",
      phase,
      businessUnit: ctx.businessUnit,
      objective: resolveObjectiveLabel(row.objective ?? "", pickResult(row, phase).actionType),
      campaignGroup: ctx.campaignGroup,
      metrics,
    });
  }

  return { campaigns, context };
}

async function fetchAll(window: FetchWindow, signal?: AbortSignal): Promise<ConnectorResult> {
  const config = getConfig();

  // De campagnes eerst: hun fase en exploitatie gelden ook voor de onderliggende
  // advertentiesets en advertenties.
  const campaignRows = await fetchInsights(config, "campaign", CAMPAIGN_FIELDS, window, { signal });
  const { campaigns, context } = toCampaigns(config, campaignRows);

  // Advertentiesets, advertenties en de dagreeks zijn onafhankelijk van elkaar.
  const [adSetRows, adRows, dailyRows] = await Promise.all([
    fetchInsights(config, "adset", ADSET_FIELDS, window, { signal }),
    fetchInsights(config, "ad", AD_FIELDS, window, { signal }),
    fetchInsights(config, "campaign", DAILY_FIELDS, window, { timeIncrement: 1, signal }),
  ]);

  const adSets: PaidAdsAdSet[] = [];
  for (const row of adSetRows) {
    const id = row.adset_id;
    const campaignId = row.campaign_id;
    if (!id || !campaignId) continue;

    const name = row.adset_name ?? id;
    const phase = context.get(campaignId)?.phase ?? resolvePhase(name, row.objective ?? "");
    const metrics = metricsFrom(config, row, phase);
    if (!hasVolume(metrics)) continue;

    adSets.push({
      id,
      name,
      campaignId,
      platform: "meta",
      phase,
      audienceType: resolveAudienceType(name),
      targeting: null,
      metrics,
    });
  }

  const ads: PaidAdsAd[] = [];
  for (const row of adRows) {
    const id = row.ad_id;
    const adSetId = row.adset_id;
    const campaignId = row.campaign_id;
    if (!id || !adSetId || !campaignId) continue;

    const name = row.ad_name ?? id;
    const phase = context.get(campaignId)?.phase ?? resolvePhase(name, row.objective ?? "");
    const metrics = metricsFrom(config, row, phase);
    if (!hasVolume(metrics)) continue;

    // `video_view` is de 3-secondenweergave uit de actions-lijst; bij een
    // statische advertentie komt het type niet voor en blijft het veld leeg.
    const videoViews = actionValue(row, "video_view");

    ads.push({
      id,
      name,
      adSetId,
      campaignId,
      platform: "meta",
      phase,
      format: resolveFormat(name),
      hook: resolveHook(name),
      videoViews3s: videoViews > 0 ? videoViews : null,
      thumbnailUrl: null,
      metrics,
    });
  }

  // De dagreeks komt per campagne binnen, zodat elke rij met de fase van zijn
  // eigen campagne geteld wordt en het dashboard de grafieken kan filteren.
  const byDay = new Map<string, ConnectorDailyPoint>();
  for (const row of dailyRows) {
    const date = row.date_start;
    const campaignId = row.campaign_id;
    if (!date || !campaignId) continue;

    const phase =
      context.get(campaignId)?.phase ??
      resolvePhase(row.campaign_name ?? "", row.objective ?? "");

    const key = `${date}|${campaignId}`;
    const point = byDay.get(key) ?? { date, campaignId, metrics: emptyMetrics() };
    addMetrics(point.metrics, metricsFrom(config, row, phase));
    byDay.set(key, point);
  }

  const daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  // De extra's pas na de kerncijfers: Meta knijpt af bij te veel zware
  // aanvragen tegelijk. Elk mag mislukken zonder de rest mee te nemen — dan
  // ontbreekt alleen die laag in het dashboard.
  const [demographicRows, creatives, targetings] = await Promise.all([
    fetchInsights(config, "adset", DEMOGRAPHIC_FIELDS, window, { breakdowns: "age,gender", signal }).catch(
      softFail("leeftijd en geslacht", [] as MetaInsightRow[])
    ),
    fetchNodes<{ creative?: { thumbnail_url?: string; image_url?: string } }>(
      config,
      ads.map((a) => a.id),
      "creative{thumbnail_url,image_url}",
      signal
    ).catch(softFail("creatives", new Map())),
    fetchNodes<{ targeting?: MetaTargeting }>(
      config,
      adSets.map((s) => s.id),
      "targeting",
      signal
    ).catch(softFail("targeting", new Map())),
  ]);

  for (const ad of ads) {
    const creative = creatives.get(ad.id)?.creative;
    // De volledige afbeelding waar die er is; video's hebben alleen een thumbnail.
    ad.thumbnailUrl = creative?.image_url ?? creative?.thumbnail_url ?? null;
  }
  for (const adSet of adSets) {
    const targeting = targetings.get(adSet.id)?.targeting;
    adSet.targeting = targeting ? summarizeTargeting(targeting) : null;
  }

  const demographics: PaidAdsDemographic[] = [];
  for (const row of demographicRows) {
    const campaignId = row.campaign_id;
    const adSetId = row.adset_id;
    if (!campaignId || !adSetId || !row.age) continue;
    const phase = context.get(campaignId)?.phase ?? resolvePhase("", row.objective ?? "");
    const metrics = metricsFrom(config, row, phase);
    if (!hasVolume(metrics)) continue;
    demographics.push({
      platform: "meta",
      campaignId,
      adSetId,
      age: row.age,
      gender: row.gender === "female" || row.gender === "male" ? row.gender : "unknown",
      metrics,
    });
  }

  return { campaigns, adSets, ads, daily, demographics };
}

/** Logt een mislukte extra laag en gaat door met een lege waarde. */
function softFail<T>(what: string, fallback: T): (error: unknown) => T {
  return (error) => {
    console.error(`[paid-ads] meta ${what} niet opgehaald`, error);
    return fallback;
  };
}

/** Hoeveel objecten Graph per `?ids=`-aanvraag toestaat. */
const NODE_BATCH = 50;

/**
 * Haalt velden op van losse objecten (advertenties, advertentiesets) via
 * `?ids=a,b,c`: vijftig per aanvraag, twee aanvragen tegelijk.
 */
async function fetchNodes<T>(
  config: MetaConfig,
  ids: string[],
  fields: string,
  signal?: AbortSignal
): Promise<Map<string, T>> {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += NODE_BATCH) batches.push(ids.slice(i, i + NODE_BATCH));

  const out = new Map<string, T>();
  for (let i = 0; i < batches.length; i += CHUNK_CONCURRENCY) {
    const results = await Promise.all(
      batches.slice(i, i + CHUNK_CONCURRENCY).map(async (batch) => {
        const url = new URL(`${GRAPH_HOST}/${config.apiVersion}/`);
        url.searchParams.set("ids", batch.join(","));
        url.searchParams.set("fields", fields);
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json" },
          cache: "no-store",
          signal,
        });
        const text = await res.text();
        const body = JSON.parse(text) as Record<string, T> & { error?: { message?: string } };
        if (!res.ok || body.error) {
          throw new ConnectorRequestError(
            `Meta Graph API — ${res.status}: ${redact(body.error?.message ?? text.slice(0, 300), config.token)}`,
            res.status,
            redact(text.slice(0, 300), config.token)
          );
        }
        return body;
      })
    );
    for (const body of results) {
      for (const [id, node] of Object.entries(body)) out.set(id, node as T);
    }
  }
  return out;
}

/* ---------------------------------------------------------- targeting -- */

/** De delen van Metas targeting-spec die het dashboard toont. */
interface MetaTargeting {
  age_min?: number;
  age_max?: number;
  /** 1 = mannen, 2 = vrouwen; leeg is iedereen. */
  genders?: number[];
  geo_locations?: {
    countries?: string[];
    regions?: { name?: string }[];
    cities?: { name?: string; radius?: number; distance_unit?: string }[];
    zips?: { name?: string; key?: string }[];
    custom_locations?: { name?: string; radius?: number; distance_unit?: string }[];
  };
  custom_audiences?: { name?: string }[];
  excluded_custom_audiences?: { name?: string }[];
  flexible_spec?: {
    interests?: { name?: string }[];
    behaviors?: { name?: string }[];
    life_events?: { name?: string }[];
  }[];
  targeting_automation?: { advantage_audience?: number };
}

function names(list: { name?: string }[] | undefined): string[] {
  return (list ?? []).map((item) => item.name).filter((n): n is string => Boolean(n));
}

function radius(item: { radius?: number; distance_unit?: string }): string {
  return item.radius ? ` +${item.radius} ${item.distance_unit === "mile" ? "mi" : "km"}` : "";
}

/** Metas targeting-spec naar leesbare labels. */
function summarizeTargeting(t: MetaTargeting): PaidTargeting {
  const min = t.age_min ?? 18;
  const max = t.age_max ?? 65;
  const geo = t.geo_locations ?? {};
  return {
    audiences: names(t.custom_audiences),
    excluded: names(t.excluded_custom_audiences),
    interests: [
      ...new Set(
        (t.flexible_spec ?? []).flatMap((spec) => [
          ...names(spec.interests),
          ...names(spec.behaviors),
          ...names(spec.life_events),
        ])
      ),
    ],
    // Metas standaard is 18 tot 65+; dat is geen leeftijdskeuze.
    age: min === 18 && max === 65 ? null : `${min}-${max >= 65 ? "65+" : max}`,
    gender:
      t.genders?.length === 1 ? (t.genders[0] === 2 ? "Vrouwen" : "Mannen") : null,
    locations: [
      ...(geo.countries ?? []),
      ...names(geo.regions),
      ...(geo.cities ?? []).filter((c) => c.name).map((c) => `${c.name}${radius(c)}`),
      ...(geo.zips ?? []).map((z) => z.name ?? z.key).filter((z): z is string => Boolean(z)),
      ...(geo.custom_locations ?? []).map((c) => `${c.name ?? "Eigen locatie"}${radius(c)}`),
    ],
    expanded: t.targeting_automation?.advantage_audience === 1,
  };
}

/**
 * Campagnes van een vergelijkingsperiode, met dezelfde fase- en
 * exploitatielogica als de hoofdperiode — zo vergelijkt het dashboard appels
 * met appels, ook als er gefilterd is.
 */
async function fetchCampaigns(window: FetchWindow, signal?: AbortSignal): Promise<PaidAdsCampaign[]> {
  const config = getConfig();
  const rows = await fetchInsights(config, "campaign", CAMPAIGN_FIELDS, window, { signal });
  return toCampaigns(config, rows).campaigns;
}

export const metaConnector: PaidConnector = {
  platform: "meta",
  isConfigured: isMetaConfigured,
  reportsRevenue: true,
  fetchAll,
  fetchCampaigns,
};
