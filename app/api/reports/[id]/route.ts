import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { deleteReport, getReport, parseReportInput, saveReport, type ReportRecord } from "@/lib/reports";
import { deleteAnalysis } from "@/lib/report-analysis";

export const dynamic = "force-dynamic";

// GET is bewust publiek: de deelbare rapportpagina (/share/rapportage?id=...)
// wordt zonder login bekeken en heeft alleen de rapportconfiguratie nodig.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const report = await getReport(id);
    if (!report) return NextResponse.json({ error: "Rapport niet gevonden." }, { status: 404 });
    // Publiek endpoint: alleen de velden die de deelpagina nodig heeft,
    // zonder de aanmaker (e-mailadres) te lekken naar externe kijkers.
    // Periode zit per bron in `sources` (genormaliseerd door getReport).
    const { id: rid, title, intro, sources } = report;
    return NextResponse.json({ report: { id: rid, title, intro, sources } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reports/:id] GET mislukt:", msg);
    return NextResponse.json({ error: "Ophalen van rapport mislukt." }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  const input = parseReportInput(body);
  if (!input) {
    return NextResponse.json({ error: "Ongeldige rapport payload." }, { status: 400 });
  }

  try {
    const existing = await getReport(id);
    if (!existing) return NextResponse.json({ error: "Rapport niet gevonden." }, { status: 404 });

    const report: ReportRecord = {
      ...existing,
      ...input,
      id: existing.id,
      createdBy: existing.createdBy,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await saveReport(report);
    // Config gewijzigd → opgeslagen analyse is niet meer representatief.
    await deleteAnalysis(id);
    return NextResponse.json({ report });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reports/:id] PUT mislukt:", msg);
    return NextResponse.json({ error: "Bijwerken van rapport mislukt." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const ok = await deleteReport(id);
    if (!ok) return NextResponse.json({ error: "Ongeldig rapport id." }, { status: 400 });
    await deleteAnalysis(id);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reports/:id] DELETE mislukt:", msg);
    return NextResponse.json({ error: "Verwijderen van rapport mislukt." }, { status: 500 });
  }
}
