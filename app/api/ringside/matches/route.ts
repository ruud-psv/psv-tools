import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { readEventSales, readState, type EventSales } from "@/lib/ringside/store";

/**
 * De wedstrijden waarvan verkoopdata is ingelezen.
 *
 * Leest uitsluitend uit de opslag die de ingest vult — nooit live uit Ringside.
 * Doorlopen van de verkooptabel duurt uren; dat kan niet per paginaweergave.
 *
 * Zonder `ids` een lijst zonder de verkoopcijfers: genoeg om in te zoeken, en
 * klein genoeg om in één keer te laden. Mét `ids` de volledige reeks van die
 * wedstrijden, om ze in de grafiek naast elkaar te leggen.
 */

export const dynamic = "force-dynamic";

/** Bewust ruim: een seizoen heeft tientallen wedstrijden en je wil kunnen terugkijken. */
const MAX_IDS = 12;

interface MatchSummary {
  productId: string;
  name: string;
  eventDate: string;
  season: string;
  category: string;
  total: number;
}

function summarize(event: EventSales): MatchSummary {
  return {
    productId: event.productId,
    name: event.name,
    eventDate: event.eventDate,
    season: event.season,
    category: event.category,
    total: event.total,
  };
}

export async function GET(req: NextRequest) {
  const authError = authorize(req.cookies.get("psv_session")?.value);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  try {
    const [events, state] = await Promise.all([readEventSales(), readState()]);
    const { searchParams } = new URL(req.url);

    const status = {
      complete: state.productsComplete && state.salesComplete,
      phase: state.productsComplete ? "sales" : "products",
      salesRowsRead: state.rowsRead,
      runs: state.runs,
      updatedAt: state.updatedAt,
      lastError: state.lastError,
    };

    const ids = (searchParams.get("ids") ?? "")
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, MAX_IDS);

    if (ids.length) {
      return NextResponse.json(
        {
          status,
          matches: ids.map((id) => events[id]).filter((event): event is EventSales => Boolean(event)),
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // Alleen wedstrijden: de rest van de producten is voor deze vraag ruis.
    const onlyMatches = searchParams.get("all") !== "1";
    const matches = Object.values(events)
      .filter((event) => (onlyMatches ? event.category === "Wedstrijden" : true))
      .filter((event) => event.total > 0)
      .map(summarize)
      // Nieuwste eerst: daar begint de vraag meestal.
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate));

    return NextResponse.json(
      { status, count: matches.length, matches },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Nog nooit ingelezen: dan bestaat het blob-bestand niet en is een lege
    // lijst een beter antwoord dan een foutmelding.
    if (message.includes("BLOB") || message.includes("token")) {
      return NextResponse.json({ status: null, count: 0, matches: [], error: message }, { status: 200 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
