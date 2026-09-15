import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import {
  emptyMetrics,
  isPeriod,
  PaidAdsDailyPoint,
  PaidAdsResponse,
  PaidAdsTargets,
  PaidAdsWeeklyPoint,
  PaidMetrics,
  PaidPlatform,
  PeriodKey,
  PLATFORM_LABELS,
} from "@/lib/paid-ads/types";
import {
  ConnectorConfigError,
  type ConnectorDailyPoint,
  type FetchWindow,
  type PaidConnector,
} from "@/lib/paid-ads/connectors/types";
import { metaConnector } from "@/lib/paid-ads/connectors/meta";
import { googleConnector } from "@/lib/paid-ads/connectors/google";

/**
 * Leesroute voor het Paid Ads dashboard.
 *
 * Per platform met een complete set credentials én een gebouwde connector
 * worden campagnes, advertentiesets, advertenties en de dagreeks opgehaald,
 * plus de totalen van twee vergelijkingsperiodes. Valt een platform uit, dan
 * blijft de rest gewoon staan en vertelt `platformErrors` wat er misging.
 *
 * Een nieuw platform aansluiten:
 *  1. Zet de environment variabelen uit `CONNECTOR_ENV` hieronder.
 *  2. Bouw een connector in `lib/paid-ads/connectors/` die `PaidConnector`
 *     implementeert en de tellers teruggeeft uit `lib/paid-ads/types.ts`.
 *  3. Zet die in `CONNECTORS` hieronder.
 * De rest van het dashboard hoeft niet mee te veranderen: alle afgeleide
 * waarden komen uit `lib/paid-ads/derive.ts`.
 */

export const dynamic = "force-dynamic";

/** Drie periodes ophalen bij vier kanalen kost tijd; Vercel kapt standaard eerder af. */
export const maxDuration = 60;

/** Harde grens op de hele operatie, zodat een traag platform de rest niet gijzelt. */
const FETCH_TIMEOUT_MS = 45_000;

/** Per platform de environment variabelen die de koppeling nodig heeft. */
const CONNECTOR_ENV: Record<PaidPlatform, string[]> = {
  meta: ["META_ADS_ACCESS_TOKEN", "META_ADS_ACCOUNT_ID"],
  tiktok: ["TIKTOK_ADS_ACCESS_TOKEN", "TIKTOK_ADS_ADVERTISER_ID"],
  google: [
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_ADS_CUSTOMER_ID",
    "GOOGLE_ADS_REFRESH_TOKEN",
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
  ],
  linkedin: ["LINKEDIN_ADS_ACCESS_TOKEN", "LINKEDIN_ADS_ACCOUNT_ID"],
};

/** De gebouwde koppelingen. Ontbreekt een platform hier, dan is er nog geen code. */
const CONNECTORS: Partial<Record<PaidPlatform, PaidConnector>> = {
  meta: metaConnector,
  google: googleConnector,
};

/* ------------------------------------------------------------ periodes -- */

const DAY_MS = 86_400_000;

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
}

/** Aantal dagen dat een periode beslaat; `season` loopt vanaf 1 juli. */
function resolvePeriod(period: PeriodKey): {
  from: string;
  to: string;
  daysElapsed: number;
  daysTotal: number;
} {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (period === "season") {
    // Het seizoen loopt van 1 juli tot en met 30 juni.
    const year = today.getUTCMonth() >= 6 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
    const from = new Date(Date.UTC(year, 6, 1));
    const end = new Date(Date.UTC(year + 1, 5, 30));
    return {
      from: iso(from),
      to: iso(today),
      daysElapsed: daysBetween(from, today),
      daysTotal: daysBetween(from, end),
    };
  }

  const days = Number(period.replace("d", ""));
  const from = new Date(today.getTime() - (days - 1) * DAY_MS);
  return { from: iso(from), to: iso(today), daysElapsed: days, daysTotal: days };
}

/** Het even lange blok direct vóór de gekozen periode. */
function previousWindow(window: FetchWindow): FetchWindow {
  const from = utcDate(window.from);
  const to = utcDate(window.to);
  const length = daysBetween(from, to);
  const prevTo = new Date(from.getTime() - DAY_MS);
  const prevFrom = new Date(prevTo.getTime() - (length - 1) * DAY_MS);
  return { from: iso(prevFrom), to: iso(prevTo) };
}

/**
 * Dezelfde kalenderdagen een jaar eerder. Bewust niet 365 dagen terug: bij
 * voetbal telt de plek in het seizoen zwaarder dan de exacte dagafstand.
 */
function yearAgoWindow(window: FetchWindow): FetchWindow {
  const shift = (value: string) => {
    const date = utcDate(value);
    return iso(new Date(Date.UTC(date.getUTCFullYear() - 1, date.getUTCMonth(), date.getUTCDate())));
  };
  return { from: shift(window.from), to: shift(window.to) };
}

/* -------------------------------------------------------------- targets -- */

/**
 * Doelstellingen komen niet van de advertentieplatformen. Zolang ze nergens
 * zijn vastgelegd blijven ze leeg en toont het dashboard geen doelkolom.
 */
function getTargets(): PaidAdsTargets {
  const num = (name: string): number | null => {
    const raw = process.env[name];
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  return {
    budget: num("PAID_ADS_TARGET_BUDGET"),
    results: num("PAID_ADS_TARGET_RESULTS"),
    costPerResult: num("PAID_ADS_TARGET_CPA"),
    ctr: num("PAID_ADS_TARGET_CTR"),
    cvr: num("PAID_ADS_TARGET_CVR"),
    cpc: num("PAID_ADS_TARGET_CPC"),
    byBusinessUnit: {},
  };
}

/* --------------------------------------------------------------- status -- */

/**
 * Welke platformen daadwerkelijk data kunnen leveren. Credentials alleen zijn
 * niet genoeg: zonder connector is er niets om ze mee aan te roepen, en dan
 * hoort het platform niet als verbonden in beeld te komen.
 */
function connectionStatus(): {
  ready: PaidPlatform[];
  errors: Partial<Record<PaidPlatform, string>>;
} {
  const ready: PaidPlatform[] = [];
  const errors: Partial<Record<PaidPlatform, string>> = {};

  for (const [platform, vars] of Object.entries(CONNECTOR_ENV) as [PaidPlatform, string[]][]) {
    const missing = vars.filter((v) => !process.env[v]);
    const connector = CONNECTORS[platform];

    if (missing.length) {
      errors[platform] =
        `Koppeling met ${PLATFORM_LABELS[platform]} is nog niet ingesteld — ontbrekend: ${missing.join(", ")}.`;
    } else if (!connector) {
      errors[platform] =
        `Credentials voor ${PLATFORM_LABELS[platform]} staan klaar, maar de koppeling is nog niet gebouwd.`;
    } else {
      ready.push(platform);
    }
  }
  return { ready, errors };
}

/* -------------------------------------------------------------- ophalen -- */

function addMetrics(target: PaidMetrics, source: PaidMetrics): void {
  target.spend += source.spend;
  target.impressions += source.impressions;
  target.reach += source.reach;
  target.clicks += source.clicks;
  target.results += source.results;
}

/** ISO-weeknummer; week 1 is de week met de eerste donderdag van het jaar. */
function isoWeek(date: Date): { year: number; week: number } {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Naar de donderdag van deze week: dan bepaalt het jaartal van die dag het weekjaar.
  const day = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return { year: target.getUTCFullYear(), week };
}

/** Dagreeks naar weekpunten: CTR in procenten, kosten per resultaat in euro's. */
function toWeekly(daily: ConnectorDailyPoint[]): PaidAdsWeeklyPoint[] {
  const byWeek = new Map<string, { label: string; metrics: PaidMetrics }>();

  for (const point of daily) {
    const { year, week } = isoWeek(utcDate(point.date));
    const key = `${year}-${String(week).padStart(2, "0")}`;
    const entry = byWeek.get(key) ?? { label: `wk ${week}`, metrics: emptyMetrics() };
    addMetrics(entry.metrics, point.metrics);
    byWeek.set(key, entry);
  }

  return [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, { label, metrics }]) => ({
      week: label,
      ctr: metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0,
      costPerResult: metrics.results > 0 ? metrics.spend / metrics.results : 0,
    }));
}

/** Dagreeksen van meerdere platformen samenvoegen tot één lijn. */
function mergeDaily(series: ConnectorDailyPoint[][]): {
  daily: PaidAdsDailyPoint[];
  merged: ConnectorDailyPoint[];
} {
  const byDate = new Map<string, PaidMetrics>();
  for (const points of series) {
    for (const point of points) {
      const entry = byDate.get(point.date) ?? emptyMetrics();
      addMetrics(entry, point.metrics);
      byDate.set(point.date, entry);
    }
  }

  const merged = [...byDate.entries()]
    .map(([date, metrics]) => ({ date, metrics }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    merged,
    daily: merged.map(({ date, metrics }) => ({
      date,
      spend: metrics.spend,
      results: metrics.results,
    })),
  };
}

function errorMessage(platform: PaidPlatform, error: unknown): string {
  if (error instanceof ConnectorConfigError) return error.message;
  const detail = error instanceof Error ? error.message : String(error);
  return `Ophalen bij ${PLATFORM_LABELS[platform]} mislukt — ${detail}`;
}

/* ------------------------------------------------------------------ GET -- */

export async function GET(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const requested = req.nextUrl.searchParams.get("period") ?? "30d";
  const period = isPeriod(requested) ? requested : "30d";
  const resolved = resolvePeriod(period);
  const current: FetchWindow = { from: resolved.from, to: resolved.to };
  const previous = previousWindow(current);
  const yearAgo = yearAgoWindow(current);

  const { ready, errors } = connectionStatus();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const connected: PaidPlatform[] = [];
  const campaigns: PaidAdsResponse["campaigns"] = [];
  const adSets: PaidAdsResponse["adSets"] = [];
  const ads: PaidAdsResponse["ads"] = [];
  const dailySeries: ConnectorDailyPoint[][] = [];
  const previousByPlatform: Partial<Record<PaidPlatform, PaidMetrics>> = {};
  const previousTotals = emptyMetrics();
  const yearAgoTotals = emptyMetrics();
  let hasPrevious = false;
  let hasYearAgo = false;

  try {
    const results = await Promise.all(
      ready.map(async (platform) => {
        const connector = CONNECTORS[platform]!;
        try {
          // De vergelijkingsperiodes zijn losse calls; ze mogen falen zonder de
          // hoofdperiode mee te slepen.
          const [data, prev, year] = await Promise.all([
            connector.fetchAll(current, controller.signal),
            connector.fetchTotals(previous, controller.signal).catch(() => null),
            connector.fetchTotals(yearAgo, controller.signal).catch(() => null),
          ]);
          return { platform, data, prev, year, error: null as string | null };
        } catch (error) {
          console.error(`[paid-ads] ${platform}`, error);
          return { platform, data: null, prev: null, year: null, error: errorMessage(platform, error) };
        }
      })
    );

    for (const result of results) {
      if (!result.data) {
        // Niet bij `connectedPlatforms`: het dashboard hoort geen kanaal als
        // aangesloten te tonen waar geen cijfer van binnenkwam.
        errors[result.platform] = result.error ?? `Geen data van ${PLATFORM_LABELS[result.platform]}.`;
        continue;
      }

      connected.push(result.platform);
      campaigns.push(...result.data.campaigns);
      adSets.push(...result.data.adSets);
      ads.push(...result.data.ads);
      dailySeries.push(result.data.daily);

      if (result.prev) {
        previousByPlatform[result.platform] = result.prev;
        addMetrics(previousTotals, result.prev);
        hasPrevious = true;
      }
      if (result.year) {
        addMetrics(yearAgoTotals, result.year);
        hasYearAgo = true;
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  const { daily, merged } = mergeDaily(dailySeries);

  const body: PaidAdsResponse = {
    period: resolved,
    campaigns,
    adSets,
    ads,
    daily,
    weekly: toWeekly(merged),
    benchmarks: {
      previous: hasPrevious ? previousTotals : null,
      yearAgo: hasYearAgo ? yearAgoTotals : null,
      previousByPlatform,
    },
    targets: getTargets(),
    // Doelgroepoverlap komt uit een aparte export, niet uit de rapportage-API's.
    audienceOverlap: [],
    connectedPlatforms: connected,
    platformErrors: errors,
    fetchedAt: new Date().toISOString(),
  };

  // Voorkomt dat een respons in een CDN-cache blijft hangen.
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
