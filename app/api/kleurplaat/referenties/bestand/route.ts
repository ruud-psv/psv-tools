import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { leesReferentieBestand, mimeVanPad } from "@/lib/kleurplaat/opslag";

export const runtime = "nodejs";

/**
 * Toont een referentie of het logo in de browser. De blobs staan privé, dus ze
 * zijn alleen via deze route te zien — achter dezelfde login als de rest van de
 * tool. Het canvas dat de plaat samenstelt laadt ze ook hierlangs, want van een
 * andere oorsprong zou er geen PNG meer uit te halen zijn.
 */
export async function GET(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  const pad = req.nextUrl.searchParams.get("pad");
  if (!pad) return NextResponse.json({ error: "Geen referentie opgegeven." }, { status: 400 });

  const inhoud = await leesReferentieBestand(pad);
  if (!inhoud) {
    return NextResponse.json({ error: "Referentie niet gevonden." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(inhoud), {
    headers: {
      "Content-Type": mimeVanPad(pad),
      // Een pad wijst altijd naar dezelfde afbeelding, dus cachen mag — maar
      // privé, want het staat achter een sessie.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
