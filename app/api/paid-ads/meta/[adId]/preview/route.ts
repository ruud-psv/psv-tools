import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import {
  fetchMetaAdPreview,
  isMetaId,
  META_PREVIEW_FORMATS,
  type MetaPreviewFormat,
} from "@/lib/paid-ads/connectors/meta";

/**
 * Het voorbeeld van één Meta-advertentie in een plaatsing (feed, story), zoals
 * Ads Manager het toont. Geeft de iframe-URL van Facebook terug.
 */

export const dynamic = "force-dynamic";

function isFormat(value: string): value is MetaPreviewFormat {
  return (META_PREVIEW_FORMATS as readonly string[]).includes(value);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ adId: string }> }) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const { adId } = await params;
  const format = req.nextUrl.searchParams.get("format") ?? "";
  if (!isMetaId(adId) || !isFormat(format)) {
    return NextResponse.json({ error: "Ongeldige advertentie of plaatsing." }, { status: 400 });
  }

  try {
    const preview = await fetchMetaAdPreview(adId, format);
    if (!preview) {
      return NextResponse.json({ error: "Meta heeft voor deze plaatsing geen voorbeeld." }, { status: 404 });
    }
    return NextResponse.json(preview, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (error) {
    console.error(`[paid-ads] meta voorbeeld van advertentie ${adId} (${format}) niet opgehaald`, error);
    return NextResponse.json({ error: "Voorbeeld niet opgehaald bij Meta." }, { status: 502 });
  }
}
