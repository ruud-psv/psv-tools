import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { readPrivateBlob } from "@/lib/blob/read";
import { isScreenshotPad } from "@/lib/tld-overzicht/types";

export const runtime = "nodejs";

/**
 * Toont een screenshot uit het TLD overzicht. De blobs staan privé, dus ze
 * zijn alleen via deze route te zien, achter dezelfde login als de rest.
 */
export async function GET(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  const pad = req.nextUrl.searchParams.get("pad") ?? "";
  if (!isScreenshotPad(pad)) return NextResponse.json({ error: "Ongeldige screenshot." }, { status: 400 });

  const inhoud = await readPrivateBlob(pad);
  if (!inhoud) return NextResponse.json({ error: "Screenshot niet gevonden." }, { status: 404 });

  return new NextResponse(new Uint8Array(inhoud), {
    headers: {
      "Content-Type": "image/jpeg",
      // Elke scan heeft een eigen map, dus een pad wijst altijd naar hetzelfde beeld.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
