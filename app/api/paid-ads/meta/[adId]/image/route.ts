import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { fetchMetaCreativeImageUrls, isMetaId } from "@/lib/paid-ads/connectors/meta";

/**
 * De afbeelding van één Meta-advertentie, via de server. De URL's van Meta
 * verlopen na een paar uur en laden niet altijd buiten Facebook; hier wordt
 * bij elke aanvraag een verse URL opgevraagd en de afbeelding doorgegeven.
 */

export const dynamic = "force-dynamic";

/** Alleen afbeeldingen van Meta zelf doorgeven. */
function isMetaImageHost(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return (
      protocol === "https:" &&
      (hostname.endsWith(".fbcdn.net") || hostname === "facebook.com" || hostname.endsWith(".facebook.com"))
    );
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ adId: string }> }) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const { adId } = await params;
  if (!isMetaId(adId)) {
    return NextResponse.json({ error: "Ongeldig advertentie-ID." }, { status: 400 });
  }

  let urls: string[];
  try {
    urls = await fetchMetaCreativeImageUrls(adId);
  } catch (error) {
    console.error(`[paid-ads] meta afbeelding van advertentie ${adId} niet opgehaald`, error);
    return NextResponse.json({ error: "Afbeelding niet opgehaald bij Meta." }, { status: 502 });
  }

  for (const url of urls.filter(isMetaImageHost)) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.startsWith("image/")) continue;
      return new NextResponse(res.body, {
        headers: {
          "Content-Type": type,
          // Kort bewaren in de browser; daarna een verse URL bij Meta.
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch (error) {
      console.error(`[paid-ads] meta afbeelding van advertentie ${adId} niet geladen`, error);
    }
  }

  return NextResponse.json({ error: "Geen afbeelding voor deze advertentie." }, { status: 404 });
}
