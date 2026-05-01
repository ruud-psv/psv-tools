import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { analyzeDmMailings, type DmInsightInput } from "@/lib/insights/dm";
import { InsightAnalysisError, InsightConfigError } from "@/lib/insights/runner";

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get("psv_session")?.value;
  const authError = authorize(sessionCookie);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  let body: DmInsightInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  if (!body.mailings?.length) {
    return NextResponse.json({ error: "Geen mailings om te analyseren." }, { status: 400 });
  }

  try {
    const result = await analyzeDmMailings(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InsightConfigError) {
      console.error("[dm-insights]", error.message);
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
