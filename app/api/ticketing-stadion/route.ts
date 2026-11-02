import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { loadStadionOverview } from "@/lib/ticketing-stadion/load";

/**
 * Overzicht voor Ticketing Stadion: de komende thuiswedstrijden van PSV 1 met
 * bezetting, tempo en een vergelijking met eerdere thuiswedstrijden. Zie
 * `loadStadionOverview()`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  try {
    return NextResponse.json(await loadStadionOverview(), { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ticketing-stadion] overzicht mislukt:", message);
    return NextResponse.json({ error: `Het overzicht kon niet worden geladen: ${message}` }, { status: 500 });
  }
}
