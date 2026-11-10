/**
 * Leest de verkoop per dag in uit Ringside: één run binnen een tijdsbudget.
 *
 * Ringside kan niet per wedstrijd opvragen; het levert een stroom van alle
 * verkoopregels. De eerste keer lopen we die helemaal door (ruim 15 miljoen
 * regels, een paar uur in een ketting van runs). Daarna leest een run alleen
 * wat erbij kwam.
 *
 * Elke run:
 *
 * 1. **Producten bijwerken**, altijd tot het eind. Zonder product is er geen
 *    wedstrijddatum en geen naam, en verkoop van een onbekend product is niet
 *    op te boeken. De vorige ingest las de productenlijst maar één keer;
 *    wedstrijden die daarna werden aangemaakt kregen nooit verkoop.
 * 2. **Verkoop lezen** vanaf de cursor en optellen per wedstrijd, dag en soort
 *    ticket (`sales-series.ts`).
 * 3. **Opslaan.** Een doorloop die nog bezig is, staat apart (`work`) en
 *    vervangt de cijfers van de pagina's (`live`) pas als hij compleet is.
 *
 * SeatGeek ververst af en toe de hele dataset. Ringside antwoordt dan op een
 * oude cursor met HTTP 205 en een lege body: de cursor is niets meer waard en
 * de doorloop begint opnieuw. De pagina's houden intussen de oude cijfers. De
 * vorige ingest las die lege body als JSON en liep daar elke run op vast.
 *
 * Bekende beperking bij het bijhouden: Ringside levert een gewijzigde regel
 * opnieuw aan, en optellen kan een eerdere versie niet terugdraaien. Voor
 * lopende wedstrijden lost de stoelstatus dat op (fase 2); gespeelde
 * wedstrijden veranderen niet meer.
 */

import { getProductDisplayName } from "./products";
import { seasonOf } from "./daily-sales";
import { readFeed, type FeedResult } from "./feed";
import { categorizeProduct } from "./ticket-events";
import {
  EMPTY_RESALE_PROBE,
  applySalesPage,
  probeResale,
  summarizeResaleProbe,
  type SalesSeriesRow,
  type StoredEvent,
} from "./sales-series";
import {
  emptySalesData,
  readSalesData,
  writeSalesData,
  type IngestState,
  type SalesData,
  type SalesDataKind,
} from "./store";

export interface ProductRow {
  product_id?: unknown;
  product_type?: unknown;
  product_description?: unknown;
  product_details?: unknown;
  event_date?: unknown;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Werkt de wedstrijden bij uit een pagina van `/v1/products`. Tellingen blijven staan. */
export function applyProducts(events: Record<string, StoredEvent>, rows: readonly ProductRow[]): void {
  for (const row of rows) {
    // `product_id` is uuid in `products` en tekst in `sales`; kleine letters maken ze gelijk.
    const productId = text(row.product_id).toLowerCase();
    const eventDate = text(row.event_date);
    if (!productId || !eventDate) continue;

    const productType = text(row.product_type);
    const name = getProductDisplayName(row) ?? "Onbekend";
    const existing = events[productId];
    events[productId] = {
      productId,
      name,
      eventDate,
      productType,
      category: categorizeProduct(productType || null, name),
      season: seasonOf(eventDate),
      stand: existing?.stand ?? {},
      other: existing?.other ?? {},
    };
  }
}

/** Dezelfde wedstrijden, zonder tellingen: het begin van een nieuwe doorloop. */
function withoutCounts(events: Record<string, StoredEvent>): Record<string, StoredEvent> {
  const cleared: Record<string, StoredEvent> = {};
  for (const [id, event] of Object.entries(events)) cleared[id] = { ...event, stand: {}, other: {} };
  return cleared;
}

/** Zet de voortgang terug voor een nieuwe doorloop. `salesComplete` blijft: `live` staat er nog. */
function beginBackfill(state: IngestState): void {
  state.mode = "backfill";
  state.rowsRead = 0;
  state.salesDateSeen = { earliest: null, latest: null };
  state.check = { lastSalesItemId: null, outOfOrder: 0, unknownProduct: 0 };
  state.resaleProbe = structuredClone(EMPTY_RESALE_PROBE);
}

/**
 * Controleert of de stroom oplopend gesorteerd is op `sales_item_id`. Dan komt
 * elke regel in een doorloop precies één keer langs en is optellen juist.
 */
function checkOrder(state: IngestState, rows: readonly SalesSeriesRow[]): void {
  for (const row of rows) {
    const id = text(row.sales_item_id).toLowerCase();
    if (!id) continue;
    if (state.check.lastSalesItemId && id <= state.check.lastSalesItemId) state.check.outOfOrder++;
    state.check.lastSalesItemId = id;
  }
}

export interface SalesIngestDeps {
  readFeed: typeof readFeed;
  readSalesData: typeof readSalesData;
  writeSalesData: typeof writeSalesData;
}

const DEFAULT_DEPS: SalesIngestDeps = { readFeed, readSalesData, writeSalesData };

export interface SalesIngestResult {
  productsRead: number;
  salesRead: number;
  /** De stroom is tot het eind gelezen: de cijfers zijn actueel. */
  caughtUp: boolean;
  /** Deze run maakte een doorloop af en zette hem voor de pagina's klaar. */
  published: boolean;
  /** SeatGeek ververste de dataset; de doorloop begint opnieuw. */
  reset: boolean;
  error: string | null;
}

/**
 * Eén run. Past `state` aan maar slaat hem niet op; dat doet de aanroeper,
 * samen met het slot. Gooit alleen als de opslag niet te lezen of te schrijven
 * is: dan is er niets veranderd.
 */
export async function runSalesIngest(
  state: IngestState,
  deadline: number,
  options: { restart?: boolean } = {},
  deps: SalesIngestDeps = DEFAULT_DEPS
): Promise<SalesIngestResult> {
  const result: SalesIngestResult = {
    productsRead: 0,
    salesRead: 0,
    caughtUp: false,
    published: false,
    reset: false,
    error: null,
  };

  let kind: SalesDataKind = state.mode === "live" ? "live" : "work";
  let data: SalesData | null = null;
  if (options.restart) {
    kind = "work";
  } else {
    data = await deps.readSalesData(kind);
    // `live` hoort er te zijn maar is weg: opnieuw opbouwen.
    if (!data && kind === "live") {
      kind = "work";
      state.salesComplete = false;
    }
  }
  if (!data) {
    beginBackfill(state);
    state.productsComplete = false;
    state.productsRead = 0;
    data = emptySalesData();
  }
  const current = data;

  let sales: FeedResult | null = null;
  try {
    const products = await deps.readFeed<ProductRow>(
      "/v1/products",
      current.productsCursor,
      deadline,
      (rows) => applyProducts(current.events, rows),
      (cursor) => {
        current.productsCursor = cursor;
      }
    );
    result.productsRead = products.rows;
    state.productsRead += products.rows;
    // Ververste productenlijst: opnieuw vanaf het begin. Bestaande wedstrijden
    // blijven staan, dus dat kost alleen leeswerk.
    if (products.reset) current.productsCursor = null;
    if (products.reachedEnd) state.productsComplete = true;

    // Verkoop pas als de productenlijst deze run bij is.
    if (products.reachedEnd && Date.now() < deadline) {
      const backfill = kind === "work";
      sales = await deps.readFeed<SalesSeriesRow>(
        "/v1/sales",
        current.salesCursor,
        deadline,
        (rows) => {
          const page = applySalesPage(current.events, rows);
          state.check.unknownProduct += page.unknownProduct;
          const seen = state.salesDateSeen;
          if (page.earliest && (!seen.earliest || page.earliest < seen.earliest)) seen.earliest = page.earliest;
          if (page.latest && (!seen.latest || page.latest > seen.latest)) seen.latest = page.latest;
          if (backfill) {
            checkOrder(state, rows);
            probeResale(state.resaleProbe, rows);
          }
        },
        (cursor) => {
          current.salesCursor = cursor;
        }
      );
      result.salesRead = sales.rows;
      state.rowsRead += sales.rows;
    }
  } catch (error) {
    // Wat tot hier gelezen is, klopt: de cursor schuift pas op na een hele
    // pagina. Opslaan dus, en de volgende run gaat verder.
    result.error = error instanceof Error ? error.message : String(error);
  }

  if (sales?.reset) {
    result.reset = true;
    state.resets += 1;
    state.lastResetAt = new Date().toISOString();
    beginBackfill(state);
    await deps.writeSalesData("work", {
      productsCursor: current.productsCursor,
      salesCursor: null,
      events: withoutCounts(current.events),
    });
    return result;
  }

  if (sales?.reachedEnd) {
    result.caughtUp = true;
    state.caughtUpAt = new Date().toISOString();
    if (kind === "work") {
      kind = "live";
      result.published = true;
    }
  }

  await deps.writeSalesData(kind, current);
  if (result.published) {
    state.mode = "live";
    state.salesComplete = true;
    // De steekproef is alleen tijdens de doorloop nodig; de pagina's lezen de
    // toestand bij elk verzoek, dus daarna alleen de uitkomst bewaren.
    state.resaleSummary = summarizeResaleProbe(state.resaleProbe);
    state.resaleProbe = structuredClone(EMPTY_RESALE_PROBE);
  }
  return result;
}
