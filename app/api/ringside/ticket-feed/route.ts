import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { RingsideAuthError, RingsideConfigError, isRingsideConfigured } from "@/lib/ringside/auth";
import { ringsidePages } from "@/lib/ringside/client";
import {
  aggregateManifests,
  aggregateSales,
  buildTicketEvents,
  type ManifestRow,
  type ProductInfo,
  type SalesAggregateRow,
} from "@/lib/ringside/ticket-events";

/**
 * De Ringside-variant van `/api/ticket-feed`, met dezelfde responsvorm zodat de
 * bestaande UI hem zonder aanpassing kan lezen.
 *
 * Dit is nog geen vervanging. Ringside kan niet filteren op event, dus er is
 * geen manier om "geef mij de capaciteit van PSV - Ajax" te vragen: je loopt de
 * change-feed door en telt zelf op. `manifests` is stoelniveau en daarmee veel
 * te groot om per request helemaal te doorlopen.
 *
 * Wat deze route daarom doet: een begrensd aantal pagina's lezen en daar de
 * aggregaten van teruggeven, mét een `coverage`-blok dat zegt hoe ver hij kwam.
 * Zolang `complete` false is zijn de aantallen ondergrenzen en geen waarheid.
 * Zo zijn de eerste echte getallen te zien — genoeg om te beoordelen of
 * `is_counted_as_available` betekent wat we hopen — zonder te doen alsof het
 * al af is.
 *
 * De volgende stap is een cron die de feed stapsgewijs bijhoudt en de
 * aggregaten bewaart; deze route leest dan uit die opslag in plaats van live.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Pagina's per tabel als er niets is meegegeven. Bewust laag: dit moet terugkomen. */
const DEFAULT_PAGES = 3;
const MAX_PAGES = 100;

interface TableCoverage {
  pages: number;
  rows: number;
  /** `false` zodra Ringside zegt dat er meer is dan we gelezen hebben. */
  complete: boolean;
  /**
   * Waar we gebleven zijn. Geef die bij een volgende aanroep mee als
   * `?cursor<tabel>=` om verder te lezen in plaats van weer bij het begin van
   * de historie te starten.
   */
  nextCursor: string | null;
}

async function readTable<T>(
  path: string,
  maxPages: number,
  limit: number | undefined,
  startCursor: string | undefined
): Promise<{ rows: T[]; coverage: TableCoverage }> {
  const rows: T[] = [];
  let pages = 0;
  let hasMore = false;
  let cursor: string | null = null;

  for await (const page of ringsidePages<T>(path, {
    maxPages,
    cursor: startCursor,
    searchParams: limit ? { limit } : undefined,
  })) {
    rows.push(...page.data);
    pages++;
    hasMore = Boolean(page.has_more);
    cursor = page.cursor ?? null;
  }

  return {
    rows,
    coverage: { pages, rows: rows.length, complete: !hasMore, nextCursor: hasMore ? cursor : null },
  };
}

function positiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export async function GET(req: NextRequest) {
  const authError = authorize(req.cookies.get("psv_session")?.value);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  if (!isRingsideConfigured()) {
    return NextResponse.json(
      { error: "Ringside is niet geconfigureerd. Zet RINGSIDE_CLIENT_ID en RINGSIDE_CLIENT_SECRET." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const maxPages = positiveInt(searchParams.get("pages"), DEFAULT_PAGES, MAX_PAGES);
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? positiveInt(limitParam, 0, 50_000) || undefined : undefined;

  try {
    // De drie tabellen staan los van elkaar, dus tegelijk ophalen scheelt het
    // grootste deel van de wachttijd.
    const [manifests, sales, products] = await Promise.all([
      readTable<ManifestRow>("/v1/manifests", maxPages, limit, searchParams.get("cursorManifests") ?? undefined),
      readTable<SalesAggregateRow>("/v1/sales", maxPages, limit, searchParams.get("cursorSales") ?? undefined),
      readTable<ProductInfo>("/v1/products", maxPages, limit, searchParams.get("cursorProducts") ?? undefined),
    ]);

    const productsById = new Map<string, ProductInfo>();
    for (const product of products.rows) {
      const id = product.product_id;
      // Latere versies overschrijven eerdere: ook dit is een change-feed.
      if (typeof id === "string" && id) productsById.set(id, product);
    }

    const capacityByEvent = aggregateManifests(manifests.rows);
    const soldByProduct = aggregateSales(sales.rows);
    const events = buildTicketEvents({ capacityByEvent, soldByProduct, productsById });

    events.sort((a, b) => a.eventDate.localeCompare(b.eventDate));

    const complete = manifests.coverage.complete && sales.coverage.complete && products.coverage.complete;

    return NextResponse.json(
      {
        events,
        count: events.length,
        fetchedAt: new Date().toISOString(),
        coverage: {
          complete,
          manifests: manifests.coverage,
          sales: sales.coverage,
          products: products.coverage,
          note: complete
            ? "Alle pagina's gelezen."
            : `Slechts ${maxPages} pagina's per tabel gelezen. De change-feed begint bij het begin van de historie, dus dit zijn de oudste events — niet de huidige. De aantallen zijn ondergrenzen. Gebruik de cursors uit dit antwoord om verder te lezen.`,
          unknownAvailability: [...capacityByEvent.values()].reduce(
            (total, event) => total + event.unknownAvailability,
            0
          ),
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    if (error instanceof RingsideConfigError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof RingsideAuthError) {
      console.error("[ringside/ticket-feed]", error.message);
      return NextResponse.json({ error: "Ringside-authenticatie mislukt." }, { status: 502 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ringside-feed ophalen mislukt." },
      { status: 502 }
    );
  }
}
