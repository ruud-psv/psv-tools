import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { analyzePaidAds, type PaidAdsInsightInput } from "@/lib/insights/paid-ads";
import { InsightAnalysisError, InsightConfigError } from "@/lib/insights/runner";

export async function POST(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  let body: PaidAdsInsightInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  if (!body.data?.campaigns?.length) {
    return NextResponse.json({ error: "Geen campagnes om te analyseren." }, { status: 400 });
  }

  try {
    const result = await analyzePaidAds(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InsightConfigError) {
      console.error("[paid-ads/insights]", error.message);
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
