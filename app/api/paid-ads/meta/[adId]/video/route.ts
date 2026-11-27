import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { fetchMetaVideo, isMetaCdnUrl, isMetaId } from "@/lib/paid-ads/connectors/meta";

/**
 * De video van een Meta-advertentie. `?n=` kiest de video (vanaf 0) bij een
 * carrousel of Advantage+ met meerdere video's.
 *
 * Stuurt door naar het bestand bij Meta in plaats van het door te geven:
 * video's zijn te groot om door een serverfunctie te laten lopen, en de
 * browser kan zo zelf vooruitspoelen. De URL van Meta verloopt na een paar
 * uur; deze route vraagt elke keer een verse op.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ adId: string }> }) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const { adId } = await params;
  const nParam = req.nextUrl.searchParams.get("n") ?? "0";
  const n = Number(nParam);
  if (!isMetaId(adId) || !/^\d{1,2}$/.test(nParam) || !Number.isInteger(n)) {
    return NextResponse.json({ error: "Ongeldige advertentie of video." }, { status: 400 });
  }

  let video;
  try {
    video = await fetchMetaVideo(adId, n);
  } catch (error) {
    console.error(`[paid-ads] meta video ${n} van advertentie ${adId} niet opgehaald`, error);
    return NextResponse.json({ error: "Video niet opgehaald bij Meta." }, { status: 502 });
  }
  if (!video || !isMetaCdnUrl(video.source)) {
    return NextResponse.json(
      {
        error:
          "Meta gaf geen videobestand. Mogelijk mist het token leesrechten op de pagina waar de video bij hoort.",
      },
      { status: 404 }
    );
  }

  return NextResponse.redirect(video.source, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=600" },
  });
}
