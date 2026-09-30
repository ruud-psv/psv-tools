import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { mimeVanPad } from "@/lib/blob/beelden";
import { leesBasisfotoBestand } from "@/lib/groepsfoto/opslag";

export const runtime = "nodejs";

/**
 * Toont een basisfoto in de browser. De blobs staan privé, dus ze zijn alleen
 * via deze route te zien — achter dezelfde login als de rest van de tool.
 */
export async function GET(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  const pad = req.nextUrl.searchParams.get("pad");
  if (!pad) return NextResponse.json({ error: "Geen foto opgegeven." }, { status: 400 });

  const inhoud = await leesBasisfotoBestand(pad);
  if (!inhoud) return NextResponse.json({ error: "Foto niet gevonden." }, { status: 404 });

  return new NextResponse(new Uint8Array(inhoud), {
    headers: {
      "Content-Type": mimeVanPad(pad),
      // Een pad wijst altijd naar hetzelfde beeld, dus cachen mag — privé.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
