import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireEmail } from "@/lib/api-session";
import { listReports, parseReportInput, saveReport, type ReportRecord } from "@/lib/reports";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  try {
    const reports = await listReports();
    return NextResponse.json({ reports });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reports] GET mislukt:", msg);
    return NextResponse.json({ error: "Ophalen van rapporten mislukt." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

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

  const now = new Date().toISOString();
  const report: ReportRecord = {
    id: randomUUID(),
    ...input,
    createdBy: auth.email,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await saveReport(report);
    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reports] POST mislukt:", msg);
    return NextResponse.json({ error: "Opslaan van rapport mislukt." }, { status: 500 });
  }
}
