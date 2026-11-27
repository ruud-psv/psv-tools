import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { fetchMetaCreativeDetails, isMetaId } from "@/lib/paid-ads/connectors/meta";

/**
 * De copy van Meta-advertenties (tekst, kop, beschrijving, knop, link) en de
 * opbouw van hun creative, voor de advertentiegalerij. `?ids=1,2,3`, hooguit
 * honderd per aanvraag.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_IDS = 100;

export async function GET(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0 || ids.length > MAX_IDS || !ids.every(isMetaId)) {
    return NextResponse.json(
      { error: `Geef 1 tot ${MAX_IDS} advertentie-ID's mee als ?ids=.` },
      { status: 400 }
    );
  }

  try {
    const details = await fetchMetaCreativeDetails(ids, req.signal);
    return NextResponse.json(
      { creatives: Object.fromEntries(details) },
      { headers: { "Cache-Control": "private, max-age=600" } }
    );
  } catch (error) {
    console.error("[paid-ads] meta creatives niet opgehaald", error);
    return NextResponse.json({ error: "Copy niet opgehaald bij Meta." }, { status: 502 });
  }
}
