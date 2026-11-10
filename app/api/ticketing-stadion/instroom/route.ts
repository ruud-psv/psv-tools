import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { buildDemoReplay } from "@/lib/instroom/demo";
import { loadInstroom, loadInstroomStatus } from "@/lib/instroom/load";

/**
 * De instroom van één gespeelde wedstrijd voor Ticketing Stadion: hoe ver het
 * inlezen is, en per stoel wanneer hij is gescand. Zie `loadInstroom()`.
 *
 * - `?status=1` geeft alleen de voortgang van het inlezen: goedkoop genoeg om
 *   elke halve minuut op te vragen.
 * - `?demo=1` geeft een voorbeeld met nagebootste scans, zonder de opslag te
 *   lezen.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const headers = { "Cache-Control": "no-store, max-age=0" };
  const { searchParams } = new URL(req.url);
  if (searchParams.get("demo") === "1") {
    return NextResponse.json({ status: null, replay: buildDemoReplay() }, { headers });
  }

  try {
    if (searchParams.get("status") === "1") {
      return NextResponse.json({ status: await loadInstroomStatus(), replay: null }, { headers });
    }
    return NextResponse.json(await loadInstroom(), { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ticketing-stadion] instroom mislukt:", message);
    return NextResponse.json({ error: `De instroom kon niet worden geladen: ${message}` }, { status: 500 });
  }
}
