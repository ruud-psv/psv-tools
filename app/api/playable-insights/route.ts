import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { analyzePlayableCampaigns, type PlayableInsightInput } from "@/lib/insights/playable";
import { InsightAnalysisError, InsightConfigError } from "@/lib/insights/runner";

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get("psv_session")?.value;
  const authError = authorize(sessionCookie);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  let body: PlayableInsightInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  if (!body.campaigns?.length) {
    return NextResponse.json({ error: "Geen campagnes om te analyseren." }, { status: 400 });
  }

  try {
    const result = await analyzePlayableCampaigns(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InsightConfigError) {
      console.error("[playable-insights]", error.message);
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
