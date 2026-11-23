import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { draaiProbe, leesCapabilities } from "@/lib/jwplayer/capabilities";
import { foutAntwoord } from "@/lib/jwplayer/fouten";
import { probeVerzoeker } from "@/lib/jwplayer/server";
import { leesSecret, leesSites } from "@/lib/jwplayer/sites";
import { blobOpslag, paden } from "@/lib/jwplayer/store";

/**
 * De capability probe voor PSV Play: wat kan de JW Player-API met deze
 * sleutel en licentie? Zonder parameter de laatste uitkomst (met de losse
 * checks); met `?opnieuw=1` draait hij opnieuw (zo'n minuut, door de rate
 * limit van 60 verzoeken per minuut).
 *
 * Alleen ingelogd, voor wie PSV Play mag zien. De uitkomst bevat geen
 * persoonsgegevens en geen secret.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  try {
    if (req.nextUrl.searchParams.get("opnieuw") === "1") {
      console.info(`[psv-play] probe gestart door ${sessie.email}`);
      const { caps, checks } = await draaiProbe(leesSites(), probeVerzoeker(leesSecret(), req.signal), blobOpslag);
      return NextResponse.json({ ...caps, checks }, { headers: { "Cache-Control": "no-store" } });
    }
    const opgeslagen = await blobOpslag.lees(paden.capabilities);
    const caps = opgeslagen ? JSON.parse(opgeslagen.toString("utf8")) : await leesCapabilities(blobOpslag);
    return NextResponse.json(caps, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, melding } = foutAntwoord(err);
    console.error(`[psv-play] probe: ${melding}`);
    return NextResponse.json({ error: melding }, { status });
  }
}
