import { NextRequest, NextResponse } from "next/server";
import { BetaAnalyticsDataClient } from "@google-analytics/data";

export const revalidate = 300;

/* ---------- Auth ---------- */

function parseBasicAuth(header: string | null) {
  if (!header?.startsWith("Basic ")) return null;
  const encoded = header.slice(6).trim();
  if (!encoded) return null;
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep === -1) return null;
    return { user: decoded.slice(0, sep), pass: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}

function authorize(sessionCookie: string | undefined): string | null {
  const expectedUser = process.env.PSV_AUTH_USER;
  const expectedPass = process.env.PSV_AUTH_PASS;
  if (!expectedUser || !expectedPass) return "Beveiliging is niet geconfigureerd.";
  if (!sessionCookie) return "Geen sessie gevonden. Log opnieuw in.";
  const credentials = parseBasicAuth(sessionCookie);
  if (!credentials) return "Ongeldige sessie.";
  if (credentials.user !== expectedUser || credentials.pass !== expectedPass) return "Ongeldige inloggegevens.";
  return null;
}

/* ---------- Config ---------- */

interface SiteConfig {
  key: string;
  label: string;
  propertyId: string;
}

function getSites(): SiteConfig[] {
  const sites: SiteConfig[] = [];
  const mapping: [string, string, string][] = [
    ["psv", "psv.nl", process.env.GA_PROPERTY_PSV ?? ""],
    ["ticketshop", "ticketshop.psv.nl", process.env.GA_PROPERTY_TICKETSHOP ?? ""],
    ["fanstore", "psvfanstore.nl", process.env.GA_PROPERTY_FANSTORE ?? ""],
    ["acties", "acties.psv.nl", process.env.GA_PROPERTY_ACTIES ?? ""],
  ];
  for (const [key, label, propertyId] of mapping) {
    if (propertyId) sites.push({ key, label, propertyId });
  }
  return sites;
}

function getClient(): { client: BetaAnalyticsDataClient | null; error: string | null } {
  const json = process.env.GA_SERVICE_ACCOUNT_JSON;
  if (!json) return { client: null, error: "GA_SERVICE_ACCOUNT_JSON ontbreekt." };
  try {
    const credentials = JSON.parse(json);
    if (!credentials.client_email || !credentials.private_key) {
      return { client: null, error: "GA_SERVICE_ACCOUNT_JSON mist client_email of private_key." };
    }
    return { client: new BetaAnalyticsDataClient({ credentials }), error: null };
  } catch (e) {
    return { client: null, error: `GA_SERVICE_ACCOUNT_JSON kon niet worden geparsed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function getDateRange(period: string): { startDate: string; endDate: string } {
  const end = "today";
  switch (period) {
    case "7d": return { startDate: "7daysAgo", endDate: end };
    case "90d": return { startDate: "90daysAgo", endDate: end };
    default: return { startDate: "30daysAgo", endDate: end };
  }
}

/* ---------- Query helpers ---------- */

interface SiteData {
  label: string;
  totals: {
    sessions: number;
    users: number;
    pageviews: number;
    newUsers: number;
    bounceRate: number;
    engagementRate: number;
  };
  dailyTrend: { date: string; sessions: number; users: number; pageviews: number }[];
  topSources: { source: string; sessions: number; users: number }[];
  topPages: { path: string; pageviews: number }[];
  devices: { device: string; sessions: number; percentage: number }[];
}

async function fetchSiteData(
  client: BetaAnalyticsDataClient,
  site: SiteConfig,
  dateRange: { startDate: string; endDate: string }
): Promise<SiteData> {
  const property = `properties/${site.propertyId}`;

  const [totalsRes, trendRes, sourcesRes, pagesRes, devicesRes] = await Promise.all([
    client.runReport({
      property,
      dateRanges: [dateRange],
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "screenPageViews" },
        { name: "newUsers" },
        { name: "bounceRate" },
        { name: "engagementRate" },
      ],
    }),
    client.runReport({
      property,
      dateRanges: [dateRange],
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "screenPageViews" },
      ],
      orderBys: [{ dimension: { dimensionName: "date", orderType: "ALPHANUMERIC" } }],
    }),
    client.runReport({
      property,
      dateRanges: [dateRange],
      dimensions: [{ name: "sessionSource" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    }),
    client.runReport({
      property,
      dateRanges: [dateRange],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 10,
    }),
    client.runReport({
      property,
      dateRanges: [dateRange],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    }),
  ]);

  const totalsRow = totalsRes[0]?.rows?.[0];
  const mv = (idx: number) => parseFloat(totalsRow?.metricValues?.[idx]?.value ?? "0");

  const totalSessions = mv(0);

  return {
    label: site.label,
    totals: {
      sessions: Math.round(mv(0)),
      users: Math.round(mv(1)),
      pageviews: Math.round(mv(2)),
      newUsers: Math.round(mv(3)),
      bounceRate: parseFloat(mv(4).toFixed(1)),
      engagementRate: parseFloat(mv(5).toFixed(1)),
    },
    dailyTrend: (trendRes[0]?.rows ?? []).map((r) => {
      const raw = r.dimensionValues?.[0]?.value ?? "";
      const formatted = raw.length === 8
        ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
        : raw;
      return {
        date: formatted,
        sessions: parseInt(r.metricValues?.[0]?.value ?? "0", 10),
        users: parseInt(r.metricValues?.[1]?.value ?? "0", 10),
        pageviews: parseInt(r.metricValues?.[2]?.value ?? "0", 10),
      };
    }),
    topSources: (sourcesRes[0]?.rows ?? []).map((r) => ({
      source: r.dimensionValues?.[0]?.value ?? "(unknown)",
      sessions: parseInt(r.metricValues?.[0]?.value ?? "0", 10),
      users: parseInt(r.metricValues?.[1]?.value ?? "0", 10),
    })),
    topPages: (pagesRes[0]?.rows ?? []).map((r) => ({
      path: r.dimensionValues?.[0]?.value ?? "/",
      pageviews: parseInt(r.metricValues?.[0]?.value ?? "0", 10),
    })),
    devices: (devicesRes[0]?.rows ?? []).map((r) => {
      const sessions = parseInt(r.metricValues?.[0]?.value ?? "0", 10);
      return {
        device: r.dimensionValues?.[0]?.value ?? "unknown",
        sessions,
        percentage: totalSessions > 0 ? parseFloat(((sessions / totalSessions) * 100).toFixed(1)) : 0,
      };
    }),
  };
}

/* ---------- GET Handler ---------- */

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("psv_session")?.value;
  const authError = authorize(sessionCookie);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const { client, error: clientError } = getClient();
  if (!client) {
    return NextResponse.json(
      { error: clientError ?? "Google Analytics is nog niet geconfigureerd." },
      { status: 500 }
    );
  }

  const sites = getSites();
  if (sites.length === 0) {
    return NextResponse.json(
      { error: "Geen GA4 properties geconfigureerd. Stel GA_PROPERTY_PSV, GA_PROPERTY_TICKETSHOP, GA_PROPERTY_FANSTORE en/of GA_PROPERTY_ACTIES in." },
      { status: 500 }
    );
  }

  const period = req.nextUrl.searchParams.get("period") ?? "30d";
  const dateRange = getDateRange(period);

  const settled = await Promise.allSettled(
    sites.map((site) => fetchSiteData(client, site, dateRange).then((data) => ({ key: site.key, data })))
  );

  const sitesMap: Record<string, SiteData> = {};
  const errors: Record<string, string> = {};

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === "fulfilled") {
      sitesMap[result.value.key] = result.value.data;
    } else {
      errors[sites[i].key] = result.reason instanceof Error ? result.reason.message : String(result.reason);
    }
  }

  if (Object.keys(sitesMap).length === 0) {
    return NextResponse.json(
      { error: "Ophalen analytics data mislukt voor alle sites.", siteErrors: errors },
      { status: 502 }
    );
  }

  // Build combined totals + trend
  const allTrends = new Map<string, { sessions: number; users: number; pageviews: number }>();
  let combinedSessions = 0;
  let combinedUsers = 0;
  let combinedPageviews = 0;

  for (const data of Object.values(sitesMap)) {
    combinedSessions += data.totals.sessions;
    combinedUsers += data.totals.users;
    combinedPageviews += data.totals.pageviews;
    for (const d of data.dailyTrend) {
      const existing = allTrends.get(d.date) ?? { sessions: 0, users: 0, pageviews: 0 };
      existing.sessions += d.sessions;
      existing.users += d.users;
      existing.pageviews += d.pageviews;
      allTrends.set(d.date, existing);
    }
  }

  const combinedDailyTrend = [...allTrends.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  return NextResponse.json({
    sites: sitesMap,
    combined: {
      totals: { sessions: combinedSessions, users: combinedUsers, pageviews: combinedPageviews },
      dailyTrend: combinedDailyTrend,
    },
    ...(Object.keys(errors).length > 0 && { siteErrors: errors }),
    fetchedAt: new Date().toISOString(),
  });
}
