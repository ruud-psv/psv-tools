import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import {
  isPeriod,
  PaidAdsCampaign,
  PaidAdsResponse,
  PaidAdsTargets,
  PaidPlatform,
  PeriodKey,
  PLATFORM_LABELS,
} from "@/lib/paid-ads/types";
import { EMPTY_FILTERS, narrowResponse } from "@/lib/paid-ads/derive";
import {
  ConnectorConfigError,
  type FetchWindow,
  type PaidConnector,
} from "@/lib/paid-ads/connectors/types";
import { metaConnector } from "@/lib/paid-ads/connectors/meta";
import { googleConnector } from "@/lib/paid-ads/connectors/google";
import { tiktokConnector } from "@/lib/paid-ads/connectors/tiktok";
import { linkedinConnector } from "@/lib/paid-ads/connectors/linkedin";

/**
 * Leesroute voor het Paid Ads dashboard.
 *
 * Per platform met een complete set credentials én een gebouwde connector
 * worden campagnes, advertentiesets, advertenties en de dagreeks opgehaald,
 * plus de campagnes van twee vergelijkingsperiodes. Valt een platform uit, dan
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
  tiktok: tiktokConnector,
  linkedin: linkedinConnector,
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
    roas: num("PAID_ADS_TARGET_ROAS"),
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
  const demographics: PaidAdsResponse["demographics"] = [];
  const warnings: PaidAdsResponse["warnings"] = [];
  const campaignDaily: PaidAdsResponse["campaignDaily"] = [];
  let previousCampaigns: PaidAdsCampaign[] | null = null;
  let yearAgoCampaigns: PaidAdsCampaign[] | null = null;

  try {
    const results = await Promise.all(
      ready.map(async (platform) => {
        const connector = CONNECTORS[platform]!;
        try {
          // De vergelijkingsperiodes zijn losse calls; ze mogen falen zonder de
          // hoofdperiode mee te slepen.
          const [data, prev, year] = await Promise.all([
            connector.fetchAll(current, controller.signal),
            connector.fetchCampaigns(previous, controller.signal).catch(() => null),
            connector.fetchCampaigns(yearAgo, controller.signal).catch(() => null),
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
      demographics.push(...(result.data.demographics ?? []));
      for (const warning of result.data.warnings ?? []) {
        warnings.push({ ...warning, platform: result.platform });
      }
      for (const point of result.data.daily) {
        campaignDaily.push({ ...point, platform: result.platform });
      }

      if (result.prev) previousCampaigns = [...(previousCampaigns ?? []), ...result.prev];
      if (result.year) yearAgoCampaigns = [...(yearAgoCampaigns ?? []), ...result.year];
    }
  } finally {
    clearTimeout(timeout);
  }

  const raw: PaidAdsResponse = {
    period: resolved,
    campaigns,
    adSets,
    ads,
    demographics,
    campaignDaily,
    daily: [],
    weekly: [],
    benchmarks: {
      previous: null,
      yearAgo: null,
      previousByPlatform: {},
      previousCampaigns,
      yearAgoCampaigns,
    },
    targets: getTargets(),
    connectedPlatforms: connected,
    revenuePlatforms: connected.filter((p) => CONNECTORS[p]?.reportsRevenue),
    platformErrors: errors,
    warnings,
    fetchedAt: new Date().toISOString(),
  };

  // Dagreeks, weekreeks en vergelijkingstotalen via hetzelfde rekenpad als het
  // dashboard gebruikt wanneer er gefilterd wordt.
  const body = narrowResponse(raw, EMPTY_FILTERS);

  // Voorkomt dat een respons in een CDN-cache blijft hangen.
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
