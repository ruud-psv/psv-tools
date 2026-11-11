/**
 * Opslag van de verkoop per dag uit Ringside, in Vercel Blob.
 *
 * De verkooptabel is te groot om per vraag te doorlopen (ruim 15 miljoen
 * regels), maar het resultaat is klein: per wedstrijd een aantal per dag en per
 * soort ticket. Alles samen past gecomprimeerd in één bestand.
 *
 * Drie bestanden onder `ringside/verloop/`:
 *
 * - **`live.json.gz`**: wat de pagina's lezen. Altijd een complete doorloop van
 *   de stroom, daarna bijgehouden.
 * - **`work.json.gz`**: een doorloop die nog bezig is (de eerste vulling, of
 *   opnieuw nadat SeatGeek de dataset ververste). Pas als hij compleet is,
 *   vervangt hij `live`. Tot die tijd blijven de pagina's de oude cijfers zien.
 * - **`state.json`**: voortgang, het slot en de metingen.
 *
 * De cursors staan ín het databestand en niet in de toestand. Zo horen cursor
 * en tellingen altijd bij elkaar: één schrijfactie, dus nooit een cursor die
 * verder is dan de tellingen (verkoop kwijt) of andersom (dubbel geteld).
 *
 * Een bestand dat er wel is maar niet te lezen, is een fout en geen lege
 * lijst. De vorige opslag begon dan leeg en schreef dat terug over de data.
 */

import { gunzipSync, gzipSync } from "node:zlib";
import { put } from "@vercel/blob";
import { readPrivateBlob } from "../blob/read";
import { readSeatSeries } from "./verloop-store";
import {
  EMPTY_RESALE_PROBE,
  toEventSales,
  type EventSales,
  type OffsetCounts,
  type ResaleProbe,
  type ResaleProbeSummary,
  type SalesCategory,
  type StoredEvent,
} from "./sales-series";

export type { EventSales, OffsetCounts };

const PREFIX = "ringside/verloop";
const STATE_PATH = `${PREFIX}/state.json`;
const LIVE_PATH = `${PREFIX}/live.json.gz`;
const WORK_PATH = `${PREFIX}/work.json.gz`;

export type SalesDataKind = "live" | "work";

/** De tellingen met de cursors waar ze bij horen. */
export interface SalesData {
  productsCursor: string | null;
  salesCursor: string | null;
  events: Record<string, StoredEvent>;
}

export function emptySalesData(): SalesData {
  return { productsCursor: null, salesCursor: null, events: {} };
}

export interface IngestState {
  /** `backfill`: er loopt een volledige doorloop in `work`. `live`: bijhouden. */
  mode: "backfill" | "live";
  /** `true` zodra de productenlijst één keer tot het eind gelezen is. */
  productsComplete: boolean;
  /** `true` zodra er een complete doorloop in `live` staat. */
  salesComplete: boolean;
  /** Gelezen in de huidige doorloop. */
  rowsRead: number;
  productsRead: number;
  runs: number;
  updatedAt: string;
  lastError: string | null;
  /**
   * Tot wanneer een run bezig is. Twee runs tegelijk lezen dezelfde cursor en
   * tellen dezelfde regels dubbel. Een verlopen slot telt niet, zodat een
   * gecrashte run niets blokkeert.
   */
  runningUntil: string | null;
  /** Vroegste en laatste `transaction_date` van getelde tickets. */
  salesDateSeen: { earliest: string | null; latest: string | null };
  /** Wanneer `live` voor het laatst tot het eind van de stroom is bijgewerkt. */
  caughtUpAt: string | null;
  /** Hoe vaak SeatGeek de dataset ververste (HTTP 205) en wanneer voor het laatst. */
  resets: number;
  lastResetAt: string | null;
  /**
   * Controles tijdens een doorloop. Is de stroom gesorteerd op `sales_item_id`,
   * dan komt elke regel één keer langs en is optellen juist; `outOfOrder` telt
   * de regels die daar niet aan voldoen.
   */
  check: { lastSalesItemId: string | null; outOfOrder: number; unknownProduct: number };
  resaleProbe: ResaleProbe;
  /** De uitkomst van `resaleProbe` na een complete doorloop; de steekproef zelf is dan weg. */
  resaleSummary: ResaleProbeSummary | null;
}

export const EMPTY_STATE: IngestState = {
  mode: "backfill",
  productsComplete: false,
  salesComplete: false,
  rowsRead: 0,
  productsRead: 0,
  runs: 0,
  updatedAt: "",
  lastError: null,
  runningUntil: null,
  salesDateSeen: { earliest: null, latest: null },
  caughtUpAt: null,
  resets: 0,
  lastResetAt: null,
  check: { lastSalesItemId: null, outOfOrder: 0, unknownProduct: 0 },
  resaleProbe: EMPTY_RESALE_PROBE,
  resaleSummary: null,
};

/** Of er op dit moment een andere run bezig is. */
export function isLocked(state: IngestState, now = Date.now()): boolean {
  if (!state.runningUntil) return false;
  const until = new Date(state.runningUntil).getTime();
  return Number.isFinite(until) && until > now;
}

export class CorruptStoreError extends Error {
  constructor(path: string, cause: unknown) {
    super(`${path} staat in de opslag maar is niet te lezen: ${cause instanceof Error ? cause.message : String(cause)}`, {
      cause,
    });
    this.name = "CorruptStoreError";
  }
}

export async function readState(): Promise<IngestState> {
  const bytes = await readPrivateBlob(STATE_PATH);
  if (!bytes) return structuredClone(EMPTY_STATE);
  try {
    const stored = JSON.parse(bytes.toString("utf8")) as Partial<IngestState>;
    return { ...structuredClone(EMPTY_STATE), ...stored };
  } catch (error) {
    // De toestand is alleen voortgang; de cursors staan bij de data. Opnieuw
    // beginnen met een lege toestand kost dus niets.
    console.error(`[ringside] ${STATE_PATH} niet te lezen:`, error instanceof Error ? error.message : error);
    return structuredClone(EMPTY_STATE);
  }
}

export async function writeState(state: IngestState): Promise<void> {
  await put(STATE_PATH, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

function pathOf(kind: SalesDataKind): string {
  return kind === "live" ? LIVE_PATH : WORK_PATH;
}

/** Gecomprimeerde bytes → data. Gooit als de inhoud niet klopt. */
export function decodeSalesData(bytes: Buffer): SalesData {
  const parsed = JSON.parse(gunzipSync(bytes).toString("utf8")) as Partial<SalesData> | null;
  if (!parsed || typeof parsed !== "object" || !parsed.events || typeof parsed.events !== "object") {
    throw new Error("geen wedstrijden in het bestand");
  }
  return {
    productsCursor: parsed.productsCursor ?? null,
    salesCursor: parsed.salesCursor ?? null,
    events: parsed.events,
  };
}

export function encodeSalesData(data: SalesData): Buffer {
  return gzipSync(JSON.stringify(data));
}

/** `null` als het bestand niet bestaat; gooit `CorruptStoreError` als het niet te lezen is. */
export async function readSalesData(kind: SalesDataKind): Promise<SalesData | null> {
  const path = pathOf(kind);
  const bytes = await readPrivateBlob(path);
  if (!bytes) return null;
  try {
    return decodeSalesData(bytes);
  } catch (error) {
    throw new CorruptStoreError(path, error);
  }
}

export async function writeSalesData(kind: SalesDataKind, data: SalesData): Promise<void> {
  await put(pathOf(kind), encodeSalesData(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/gzip",
  });
}

/**
 * De verkoop per dag van alle wedstrijden, met alle soorten tickets. Leeg
 * zolang de eerste doorloop nog niet compleet is.
 */
export async function readEventSales(exclude: readonly SalesCategory[] = []): Promise<Record<string, EventSales>> {
  const [data, seats] = await Promise.all([readSalesData("live"), readSeatSeriesOrNull()]);
  const sales: Record<string, EventSales> = {};
  if (!data) return sales;
  for (const [id, event] of Object.entries(data.events)) {
    // De stoelstatus weet het beter: voor komende wedstrijden de laatste stand
    // per ticket, voor pas gespeelde de eindstand daarvan.
    const fromSeats = seats?.upcoming[id] ?? seats?.frozen[id];
    sales[id] = toEventSales(fromSeats ? { ...event, stand: fromSeats.stand, other: fromSeats.other } : event, exclude);
  }
  return sales;
}

/** Zonder dit bestand werken de pagina's ook, met de tellingen van de verkoop-ingest. */
async function readSeatSeriesOrNull() {
  try {
    return await readSeatSeries();
  } catch (error) {
    console.error("[ringside] reeksen uit de stoelstatus niet te lezen:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * De verkoop per dag zonder seizoenkaarten en vrijkaarten: wat er voor deze
 * wedstrijd zelf gekocht is (losse verkoop en resale). Dit lezen de grafieken,
 * het tempo en de vergelijking van Ticketing Stadion.
 */
export function readMatchSales(): Promise<Record<string, EventSales>> {
  return readEventSales(["seizoenkaart", "vrijkaart"]);
}

/**
 * Naam en datum van alle bekende producten, voor de stoelstatus: daarmee
 * vallen verkoopregels van gespeelde wedstrijden meteen af. Tijdens de eerste
 * vulling uit de lopende doorloop. Gooit nooit; zonder lijst werkt de
 * stoelstatus ook, alleen minder zuinig.
 */
export async function readKnownProducts(): Promise<Pick<StoredEvent, "productId" | "name" | "eventDate">[]> {
  try {
    const data = (await readSalesData("live")) ?? (await readSalesData("work"));
    return data ? Object.values(data.events).map(({ productId, name, eventDate }) => ({ productId, name, eventDate })) : [];
  } catch (error) {
    console.error("[ringside] productenlijst niet te lezen:", error instanceof Error ? error.message : error);
    return [];
  }
}
