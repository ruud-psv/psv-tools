import { NextRequest, NextResponse } from "next/server";
import { analyzeDmMailings, type DmInsightInput } from "@/lib/insights/dm";
import { analyzeTicketEvents, type TicketInsightInput } from "@/lib/insights/ticket";
import { analyzeAnalytics, type AnalyticsInsightInput } from "@/lib/insights/analytics";
import { analyzeFanstore, type FanstoreInsightInput } from "@/lib/insights/fanstore";
import { analyzeCombined, type CombinedInsightInput } from "@/lib/insights/combined";
import { InsightAnalysisError, InsightConfigError } from "@/lib/insights/runner";
import { reportForShareToken } from "@/lib/share-access";
import { checkInsightSource } from "@/lib/share-scope";

interface RequestBody {
  token: string;
  source: "dm" | "ticket" | "analytics" | "fanstore" | "combined";
  payload: unknown;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  // Eerst het token: zonder geldig rapporttoken geen AI-aanroep (die kost geld).
  const access = await reportForShareToken(typeof body?.token === "string" ? body.token : null);
  if ("error" in access) return access.error;

  if (!body.source || !body.payload) {
    return NextResponse.json({ error: "Source en payload zijn verplicht." }, { status: 400 });
  }
  const denied = checkInsightSource(access.report.sources, body.source);
  if (denied) return NextResponse.json({ error: denied }, { status: 403 });

  try {
    let analysis: unknown;
    if (body.source === "dm") {
      analysis = await analyzeDmMailings(body.payload as DmInsightInput);
    } else if (body.source === "ticket") {
      analysis = await analyzeTicketEvents(body.payload as TicketInsightInput);
    } else if (body.source === "analytics") {
      analysis = await analyzeAnalytics(body.payload as AnalyticsInsightInput);
    } else if (body.source === "fanstore") {
      analysis = await analyzeFanstore(body.payload as FanstoreInsightInput);
    } else if (body.source === "combined") {
      analysis = await analyzeCombined(body.payload as CombinedInsightInput);
    } else {
      return NextResponse.json({ error: "Onbekende source." }, { status: 400 });
    }
    return NextResponse.json(analysis);
  } catch (error) {
    if (error instanceof InsightConfigError) {
      console.error("[share/insights]", error.message);
      return NextResponse.json({ error: "Server configuratie fout" }, { status: 500 });
    }
    if (error instanceof InsightAnalysisError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: "Analyse mislukt.", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
