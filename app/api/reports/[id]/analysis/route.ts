import { NextRequest, NextResponse } from "next/server";
import { analyzeCombined, type CombinedInsightInput } from "@/lib/insights/combined";
import { isValidShareToken } from "@/lib/share-token";
import { getAnalysis, saveAnalysis, type StoredAnalysis } from "@/lib/report-analysis";
import { InsightAnalysisError, InsightConfigError } from "@/lib/insights/runner";

export const dynamic = "force-dynamic";

// Publiek: de deelpagina haalt de opgeslagen analyse op zonder login.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const analysis = await getAnalysis(id);
    return NextResponse.json({ analysis });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reports/:id/analysis] GET mislukt:", msg);
    return NextResponse.json({ analysis: null });
  }
}

// Genereert een nieuwe gecombineerde analyse en slaat die op. Wordt alleen
// aangeroepen wanneer de gebruiker op "Analyseren" / "Opnieuw analyseren" klikt.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: { token?: string; sig?: string; payload?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  if (!body.token || !body.payload) {
    return NextResponse.json({ error: "Token en payload zijn verplicht." }, { status: 400 });
  }
  if (!isValidShareToken(body.token)) {
    return NextResponse.json({ error: "Ongeldig token." }, { status: 401 });
  }
  // Token moet bij dit rapport horen.
  try {
    const decoded = JSON.parse(Buffer.from(body.token, "base64url").toString());
    if (decoded?.id && decoded.id !== id) {
      return NextResponse.json({ error: "Token hoort niet bij dit rapport." }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Ongeldig token." }, { status: 401 });
  }

  try {
    const result = await analyzeCombined(body.payload as CombinedInsightInput);
    const stored: StoredAnalysis = {
      result,
      sig: typeof body.sig === "string" ? body.sig : "",
      generatedAt: new Date().toISOString(),
    };
    await saveAnalysis(id, stored);
    return NextResponse.json({ analysis: stored });
  } catch (error) {
    if (error instanceof InsightConfigError) {
      console.error("[reports/:id/analysis]", error.message);
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
