import { NextResponse } from "next/server";
import { todayInAmsterdam } from "@/lib/ringside/seat-state";
import { readSeatIndex } from "@/lib/ringside/seat-store";
import { toFeedEvents } from "@/lib/ticketing-stadion/feed";
import { buildStadionSummaryFromIndex, readStadionSummary } from "@/lib/ticketing-stadion/store";

/**
 * De komende thuiswedstrijden van PSV 1, uit Ringside.
 *
 * Was de XML-feed van de ticketshop. De vorm is gelijk gebleven, zodat de
 * rapportage-generator en de deellinks niets merken. Bron is de samenvatting
 * van Ticketing Stadion (zie `docs/ticketing-stadion.md`); tours, museum en
 * andere events zitten er niet meer in.
 *
 * Openbaar, net als de oude feed: de deellinks gebruiken hem zonder login.
 * Alleen aantallen per wedstrijd.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const summary = (await readStadionSummary()) ?? (await buildStadionSummaryFromIndex(await readSeatIndex()));
    const events = toFeedEvents(Object.values(summary.matches), todayInAmsterdam(), summary.generatedAt);
    return NextResponse.json(
      { events, count: events.length, fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Wedstrijden ophalen mislukt" },
      { status: 500 }
    );
  }
}
