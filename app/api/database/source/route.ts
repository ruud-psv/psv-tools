import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { HASH_VERSION } from "@/lib/database/index-format";
import {
  commitSourceVersion,
  deleteSourceVersion,
  discardSourceParts,
  getSourceState,
  isValidVersionId,
} from "@/lib/database/source-store";
import type { SourceVersion } from "@/lib/database/types";

export const dynamic = "force-dynamic";

/** Een maandsleutel uit de groeicurve: `YYYY-MM`. */
const MONTH_RE = /^\d{4}-\d{2}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Ruim boven wat een export kan opleveren (~150 jaar aan maanden). */
const MAX_MONTHS = 2000;

function positiveInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : -1;
}

export async function GET(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  try {
    return NextResponse.json(await getSourceState());
  } catch (err) {
    console.error("[database/source] GET mislukt:", err);
    return NextResponse.json(
      { error: "Ophalen van het bronbestand mislukt." },
      { status: 500 }
    );
  }
}

/**
 * Rondt een upload af: de shards staan er al, hier wordt de versie pas de
 * actieve bron. Alles wat de browser meestuurt wordt gecontroleerd — een
 * verkeerd aantal records zou anders stilzwijgend in de groeicurve landen.
 */
export async function POST(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  const versionId = typeof body.versionId === "string" ? body.versionId : "";
  if (!isValidVersionId(versionId)) {
    return NextResponse.json({ error: "Ongeldig versie-id." }, { status: 400 });
  }

  const recordCount = positiveInt(body.recordCount);
  const parts = positiveInt(body.parts);
  if (recordCount <= 0 || parts <= 0) {
    return NextResponse.json(
      { error: "Een bron zonder records kan niet worden opgeslagen." },
      { status: 400 }
    );
  }

  const firstRecordDate = typeof body.firstRecordDate === "string" ? body.firstRecordDate : "";
  const lastRecordDate = typeof body.lastRecordDate === "string" ? body.lastRecordDate : "";
  if (!ISO_DATE_RE.test(firstRecordDate) || !ISO_DATE_RE.test(lastRecordDate)) {
    return NextResponse.json({ error: "Ongeldige datums in de upload." }, { status: 400 });
  }

  const growthByMonth: Record<string, number> = {};
  const raw = body.growthByMonth;
  if (raw && typeof raw === "object") {
    const months = Object.entries(raw as Record<string, unknown>).slice(0, MAX_MONTHS);
    for (const [month, value] of months) {
      const count = positiveInt(value);
      if (MONTH_RE.test(month) && count > 0) growthByMonth[month] = count;
    }
  }

  const version: SourceVersion = {
    id: versionId,
    uploadedAt: new Date().toISOString(),
    uploadedBy: auth.name || auth.email,
    fileName:
      typeof body.fileName === "string" ? body.fileName.trim().slice(0, 200) : "onbekend",
    recordCount,
    rowsRead: Math.max(positiveInt(body.rowsRead), 0),
    rowsSkipped: Math.max(positiveInt(body.rowsSkipped), 0),
    duplicates: Math.max(positiveInt(body.duplicates), 0),
    hashVersion: HASH_VERSION,
    parts,
    growthByMonth,
    firstRecordDate,
    lastRecordDate,
  };

  try {
    const state = await commitSourceVersion(version);
    return NextResponse.json({ state });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[database/source] POST mislukt:", message);
    // Halve shards laten liggen zou bij een volgende poging met hetzelfde
    // versie-id een onvolledige index kunnen opleveren.
    await discardSourceParts(versionId).catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  const versionId = req.nextUrl.searchParams.get("version") ?? "";
  if (!isValidVersionId(versionId)) {
    return NextResponse.json({ error: "Ongeldig versie-id." }, { status: 400 });
  }

  try {
    await deleteSourceVersion(versionId);
    return NextResponse.json({ state: await getSourceState() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[database/source] DELETE mislukt:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
