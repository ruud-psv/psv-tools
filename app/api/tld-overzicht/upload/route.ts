import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { leesLaatsteScan, schrijfScan, schrijfScreenshot } from "@/lib/tld-overzicht/store";
import { isScreenshotPad, type TldScan } from "@/lib/tld-overzicht/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hier levert de domeinscan (`scripts/psv-domeinscan.mjs --upload-url`) zijn
 * resultaat af, zodat de scan buiten Vercel kan draaien (in GitHub Actions)
 * zonder de Blob-token: deze route schrijft met de token van Tools zelf.
 *
 *   GET            de laatste scan, om mee te vergelijken
 *   PUT ?pad=…     één screenshot (image/jpeg)
 *   POST           de scan zelf (JSON); wordt de nieuwe laatste scan
 *
 * Alleen met `Authorization: Bearer <CRON_SECRET>`.
 */

const MAX_BEELD = 3 * 1024 * 1024;

function geautoriseerd(req: NextRequest): boolean {
  const geheim = process.env.CRON_SECRET;
  const kop = req.headers.get("authorization") ?? "";
  if (!geheim) return false;
  const a = Buffer.from(kop);
  const b = Buffer.from(`Bearer ${geheim}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

const geenToegang = () => NextResponse.json({ error: "Geen toegang." }, { status: 401 });

export async function GET(req: NextRequest) {
  if (!geautoriseerd(req)) return geenToegang();
  return NextResponse.json({ scan: await leesLaatsteScan() });
}

export async function PUT(req: NextRequest) {
  if (!geautoriseerd(req)) return geenToegang();
  const pad = req.nextUrl.searchParams.get("pad") ?? "";
  if (!isScreenshotPad(pad)) return NextResponse.json({ error: "Ongeldig pad." }, { status: 400 });
  const inhoud = Buffer.from(await req.arrayBuffer());
  if (inhoud.length === 0 || inhoud.length > MAX_BEELD) {
    return NextResponse.json({ error: "Screenshot leeg of te groot." }, { status: 400 });
  }
  // Een JPEG begint altijd met FF D8.
  if (inhoud[0] !== 0xff || inhoud[1] !== 0xd8) return NextResponse.json({ error: "Geen JPEG." }, { status: 400 });
  await schrijfScreenshot(pad, inhoud);
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  if (!geautoriseerd(req)) return geenToegang();
  let scan: TldScan;
  try {
    scan = (await req.json()) as TldScan;
  } catch {
    return NextResponse.json({ error: "Geen geldige JSON." }, { status: 400 });
  }
  const geldig =
    typeof scan?.datum === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(scan.datum) &&
    Array.isArray(scan.resultaten) &&
    Array.isArray(scan.eigen) &&
    scan.resultaten.every(
      (r) => typeof r?.domein === "string" && typeof r?.categorie === "string" && (!r.screenshotPad || isScreenshotPad(r.screenshotPad))
    );
  if (!geldig) return NextResponse.json({ error: "Onverwachte opbouw van de scan." }, { status: 400 });
  await schrijfScan(scan);
  return NextResponse.json({ ok: true, aantal: scan.resultaten.length });
}
