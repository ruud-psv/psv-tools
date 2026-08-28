import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import {
  isPeriod,
  PaidAdsResponse,
  PaidAdsTargets,
  PaidPlatform,
  PeriodKey,
  PLATFORM_LABELS,
} from "@/lib/paid-ads/types";

/**
 * Leesroute voor het Paid Ads dashboard.
 *
 * De koppelingen met Meta, TikTok, Google Ads en LinkedIn zijn nog niet gelegd.
 * Deze route levert daarom een lege, geldige `PaidAdsResponse` op met per
 * platform de reden dat er geen data is. Het dashboard rendert daarmee zijn
 * volledige structuur zonder verzonnen cijfers te tonen.
 *
 * Een platform aansluiten:
 *  1. Zet de environment variabelen uit `CONNECTORS` hieronder.
 *  2. Vul de bijbehorende `fetch`-functie in `lib/paid-ads/connectors/` in en
 *     laat die campagnes, advertentiesets en advertenties teruggeven in het
 *     contract uit `lib/paid-ads/types.ts`.
 *  3. Voeg de aanroep toe aan `collect()` hieronder.
 * De rest van het dashboard hoeft niet mee te veranderen: alle afgeleide
 * waarden komen uit `lib/paid-ads/derive.ts`.
 */

export const dynamic = "force-dynamic";

/** Per platform de environment variabelen die de koppeling nodig heeft. */
const CONNECTORS: Record<PaidPlatform, string[]> = {
  meta: ["META_ADS_ACCESS_TOKEN", "META_ADS_ACCOUNT_ID"],
  tiktok: ["TIKTOK_ADS_ACCESS_TOKEN", "TIKTOK_ADS_ADVERTISER_ID"],
  google: ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CUSTOMER_ID", "GOOGLE_ADS_REFRESH_TOKEN"],
  linkedin: ["LINKEDIN_ADS_ACCESS_TOKEN", "LINKEDIN_ADS_ACCOUNT_ID"],
};

/** Aantal dagen dat een periode beslaat; `season` loopt vanaf 1 juli. */
function resolvePeriod(period: PeriodKey): {
  from: string;
  to: string;
  daysElapsed: number;
  daysTotal: number;
} {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const daysBetween = (a: Date, b: Date) =>
    Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;

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
  const from = new Date(today.getTime() - (days - 1) * 86_400_000);
  return { from: iso(from), to: iso(today), daysElapsed: days, daysTotal: days };
}

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

/** Welke platformen een complete set credentials hebben. */
function connectionStatus(): {
  connected: PaidPlatform[];
  errors: Partial<Record<PaidPlatform, string>>;
} {
  const connected: PaidPlatform[] = [];
  const errors: Partial<Record<PaidPlatform, string>> = {};

  for (const [platform, vars] of Object.entries(CONNECTORS) as [PaidPlatform, string[]][]) {
    const missing = vars.filter((v) => !process.env[v]);
    if (missing.length === 0) {
      connected.push(platform);
    } else {
      errors[platform] =
        `Koppeling met ${PLATFORM_LABELS[platform]} is nog niet ingesteld — ontbrekend: ${missing.join(", ")}.`;
    }
  }
  return { connected, errors };
}

export async function GET(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const requested = req.nextUrl.searchParams.get("period") ?? "30d";
  const period = isPeriod(requested) ? requested : "30d";
  const { connected, errors } = connectionStatus();

  // Zodra een connector bestaat wordt hier per aangesloten platform opgehaald.
  // Tot die tijd blijven de lijsten leeg en vertelt `platformErrors` waarom.
  const body: PaidAdsResponse = {
    period: resolvePeriod(period),
    campaigns: [],
    adSets: [],
    ads: [],
    daily: [],
    weekly: [],
    benchmarks: { previous: null, yearAgo: null, previousByPlatform: {} },
    targets: getTargets(),
    audienceOverlap: [],
    connectedPlatforms: connected,
    platformErrors: errors,
    fetchedAt: new Date().toISOString(),
  };

  // Voorkomt dat een lege respons in een CDN-cache blijft hangen zodra de
  // eerste koppeling live gaat.
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
