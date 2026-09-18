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
  actions?: { action_type: string; value: string }[];
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
    const key = perDay ? `${id}|${row.date_start ?? ""}` : id;

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
  }

  return [...byKey.values()];
}

/**
 * Haalt één Insights-query op over de volledige periode. Lange periodes gaan
 * in blokken, die tegelijk lopen en daarna worden samengeteld — sequentieel
 * ophalen duurt bij een seizoen langer dan de route mag draaien.
 */
async function fetchInsights(
  config: MetaConfig,
  level: "account" | "campaign" | "adset" | "ad",
  fields: string,
  window: FetchWindow,
  options: { timeIncrement?: number; signal?: AbortSignal } = {}
): Promise<MetaInsightRow[]> {
  const chunks = splitWindow(window);
  if (chunks.length === 1) {
    return fetchWindow(config, level, fields, window, options);
  }

  const perChunk = await Promise.all(
    chunks.map((chunk) => fetchWindow(config, level, fields, chunk, options))
  );
  return mergeRows(perChunk.flat(), Boolean(options.timeIncrement));
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
  options: { timeIncrement?: number; signal?: AbortSignal } = {}
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

/** Wat we van een campagne onthouden om adsets en ads te kunnen indelen. */
interface CampaignContext {
  phase: PaidPhase;
  businessUnit: string;
  campaignGroup: string | null;
  name: string;
}

async function fetchAll(window: FetchWindow, signal?: AbortSignal): Promise<ConnectorResult> {
  const config = getConfig();

  // De campagnes eerst: hun fase en exploitatie gelden ook voor de onderliggende
  // advertentiesets en advertenties.
  const campaignRows = await fetchInsights(config, "campaign", CAMPAIGN_FIELDS, window, { signal });

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
      metrics,
    });
  }

  // De dagreeks komt op campagneniveau binnen, zodat elke rij met de fase van
  // zijn eigen campagne geteld wordt en het dagtotaal gelijk blijft aan de som
  // van de campagnes.
  const byDate = new Map<string, PaidMetrics>();
  for (const row of dailyRows) {
    const date = row.date_start;
    const campaignId = row.campaign_id;
    if (!date) continue;

    const phase =
      (campaignId ? context.get(campaignId)?.phase : undefined) ??
      resolvePhase(row.campaign_name ?? "", row.objective ?? "");

    const point = byDate.get(date) ?? emptyMetrics();
    addMetrics(point, metricsFrom(config, row, phase));
    byDate.set(date, point);
  }

  const daily: ConnectorDailyPoint[] = [...byDate.entries()]
    .map(([date, metrics]) => ({ date, metrics }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { campaigns, adSets, ads, daily };
}

/**
 * Totalen voor een vergelijkingsperiode. Bewust op campagneniveau: dan wordt
 * elke rij met dezelfde faselogica geteld als in de hoofdperiode, en vergelijkt
 * het dashboard appels met appels.
 */
async function fetchTotals(window: FetchWindow, signal?: AbortSignal): Promise<PaidMetrics> {
  const config = getConfig();
  const rows = await fetchInsights(config, "campaign", CAMPAIGN_FIELDS, window, { signal });

  const totals = emptyMetrics();
  for (const row of rows) {
    const phase = resolvePhase(row.campaign_name ?? "", row.objective ?? "");
    addMetrics(totals, metricsFrom(config, row, phase));
  }
  return totals;
}

export const metaConnector: PaidConnector = {
  platform: "meta",
  isConfigured: isMetaConfigured,
  fetchAll,
  fetchTotals,
};
