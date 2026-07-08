import { NextRequest, NextResponse } from "next/server";
import { getShareLink } from "@/lib/blob-snapshots";
import { analyzeDmMailings, type DmInsightInput } from "@/lib/insights/dm";
import { analyzeTicketEvents, type TicketInsightInput } from "@/lib/insights/ticket";
import { analyzeAnalytics, type AnalyticsInsightInput } from "@/lib/insights/analytics";
import { InsightAnalysisError, InsightConfigError } from "@/lib/insights/runner";

interface RequestBody {
  token: string;
  source: "dm" | "ticket" | "analytics";
  payload: unknown;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  if (!body.token || !body.source || !body.payload) {
    return NextResponse.json({ error: "Token, source en payload zijn verplicht." }, { status: 400 });
  }

  // Token must exist in share_links — this is the auth check for public access
  try {
    const link = await getShareLink(body.token);
    if (link === null) {
      return NextResponse.json({ error: "Ongeldig token." }, { status: 401 });
    }
  } catch (err) {
    console.error("[share/insights] token lookup error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  try {
    let analysis: unknown;
    if (body.source === "dm") {
      analysis = await analyzeDmMailings(body.payload as DmInsightInput);
    } else if (body.source === "ticket") {
      analysis = await analyzeTicketEvents(body.payload as TicketInsightInput);
    } else if (body.source === "analytics") {
      analysis = await analyzeAnalytics(body.payload as AnalyticsInsightInput);
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
