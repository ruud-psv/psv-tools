import { NextRequest, NextResponse } from "next/server";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { authorize } from "@/lib/auth";

export const revalidate = 300;

const FANSTORE_PROPERTY_ID = process.env.GA_PROPERTY_FANSTORE ?? "322916184";

function getClient(): { client: BetaAnalyticsDataClient | null; error: string | null } {
  const json = process.env.GA_SERVICE_ACCOUNT_JSON;
  if (!json) return { client: null, error: "GA_SERVICE_ACCOUNT_JSON ontbreekt." };
  try {
    let credentials: unknown = JSON.parse(json);
    if (typeof credentials === "string") credentials = JSON.parse(credentials);
    if (!credentials || typeof credentials !== "object") {
      return { client: null, error: `GA_SERVICE_ACCOUNT_JSON is geen object na parsen.` };
    }
    const creds = credentials as Record<string, unknown>;
    if (!creds.client_email || !creds.private_key) {
      return { client: null, error: "GA_SERVICE_ACCOUNT_JSON mist client_email of private_key." };
    }
    if (typeof creds.private_key === "string" && !creds.private_key.includes("\n")) {
      creds.private_key = creds.private_key.replace(/\\n/g, "\n");
    }
    return { client: new BetaAnalyticsDataClient({ credentials: creds }), error: null };
  } catch (e) {
    return {
      client: null,
      error: `GA_SERVICE_ACCOUNT_JSON kon niet worden geparsed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

function getDateRange(period: string): { startDate: string; endDate: string } {
  switch (period) {
    case "7d": return { startDate: "7daysAgo", endDate: "today" };
    case "90d": return { startDate: "90daysAgo", endDate: "today" };
    default: return { startDate: "30daysAgo", endDate: "today" };
  }
}

export interface FANstoreData {
  totals: {
    revenue: number;
    transactions: number;
    avgOrderValue: number;
    itemsPurchased: number;
  };
  dailyTrend: { date: string; revenue: number; transactions: number }[];
  topProducts: { name: string; revenue: number; itemsPurchased: number }[];
  topCategories: { category: string; revenue: number; transactions: number }[];
  fetchedAt: string;
}

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

  if (!FANSTORE_PROPERTY_ID) {
    return NextResponse.json(
      { error: "GA_PROPERTY_FANSTORE is niet geconfigureerd." },
      { status: 500 }
    );
  }

  const period = req.nextUrl.searchParams.get("period") ?? "30d";
  const dateRange = getDateRange(period);
  const property = `properties/${FANSTORE_PROPERTY_ID}`;

  try {
    const [totalsRes, trendRes, productsRes, categoriesRes] = await Promise.all([
      client.runReport({
        property,
        dateRanges: [dateRange],
        metrics: [
          { name: "purchaseRevenue" },
          { name: "transactions" },
          { name: "averagePurchaseRevenuePerTransaction" },
          { name: "itemsPurchased" },
        ],
      }),
      client.runReport({
        property,
        dateRanges: [dateRange],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "purchaseRevenue" }, { name: "transactions" }],
        orderBys: [{ dimension: { dimensionName: "date", orderType: "ALPHANUMERIC" } }],
      }),
      client.runReport({
        property,
        dateRanges: [dateRange],
        dimensions: [{ name: "itemName" }],
        metrics: [{ name: "purchaseRevenue" }, { name: "itemsPurchased" }],
        orderBys: [{ metric: { metricName: "purchaseRevenue" }, desc: true }],
        limit: 20,
      }),
      client.runReport({
        property,
        dateRanges: [dateRange],
        dimensions: [{ name: "itemCategory" }],
        metrics: [{ name: "purchaseRevenue" }, { name: "transactions" }],
        orderBys: [{ metric: { metricName: "purchaseRevenue" }, desc: true }],
        limit: 10,
      }),
    ]);

    const totalsRow = totalsRes[0]?.rows?.[0];
    const mv = (idx: number) => parseFloat(totalsRow?.metricValues?.[idx]?.value ?? "0");

    const data: FANstoreData = {
      totals: {
        revenue: parseFloat(mv(0).toFixed(2)),
        transactions: Math.round(mv(1)),
        avgOrderValue: parseFloat(mv(2).toFixed(2)),
        itemsPurchased: Math.round(mv(3)),
      },
      dailyTrend: (trendRes[0]?.rows ?? []).map((r) => {
        const raw = r.dimensionValues?.[0]?.value ?? "";
        const date =
          raw.length === 8
            ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
            : raw;
        return {
          date,
          revenue: parseFloat(parseFloat(r.metricValues?.[0]?.value ?? "0").toFixed(2)),
          transactions: parseInt(r.metricValues?.[1]?.value ?? "0", 10),
        };
      }),
      topProducts: (productsRes[0]?.rows ?? []).map((r) => ({
        name: r.dimensionValues?.[0]?.value ?? "(onbekend)",
        revenue: parseFloat(parseFloat(r.metricValues?.[0]?.value ?? "0").toFixed(2)),
        itemsPurchased: parseInt(r.metricValues?.[1]?.value ?? "0", 10),
      })),
      topCategories: (categoriesRes[0]?.rows ?? []).map((r) => ({
        category: r.dimensionValues?.[0]?.value ?? "(onbekend)",
        revenue: parseFloat(parseFloat(r.metricValues?.[0]?.value ?? "0").toFixed(2)),
        transactions: parseInt(r.metricValues?.[1]?.value ?? "0", 10),
      })),
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: `Fout bij ophalen FANstore data: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }
}
