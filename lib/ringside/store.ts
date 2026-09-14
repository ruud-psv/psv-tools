/**
 * Opslag voor de Ringside-ingest.
 *
 * De verkooptabel is te groot om per vraag te doorlopen — de meting gaf ruim
 * 2.300 rijen per seconde en de tabel loopt in de miljoenen — maar het
 * *resultaat* is klein. Per wedstrijd bewaren we niet de verkoopregels maar één
 * getal per dagen-tot-de-wedstrijd. Dat is een paar honderd getallen per
 * wedstrijd, dus enkele kilobytes; alles samen ruim binnen wat Vercel Blob
 * aankan, zonder database.
 *
 * Twee dingen liggen hier vast:
 *
 * - **De cursor**, zodat een volgende cron-run verdergaat waar de vorige
 *   stopte in plaats van opnieuw bij het begin. Zonder die cursor is de eerste
 *   vulling nooit af.
 * - **De aggregaten per product**, die na elke run worden bijgewerkt.
 *
 * De feed is niet op datum geordend maar op sleutel: in de eerste 110.000
 * verkooprijen zaten transacties van 2015 tot 2026 door elkaar. Er is dus geen
 * manier om "alleen het recente deel" te lezen — de rijen van één wedstrijd
 * liggen verspreid over de hele tabel. Compleet worden kan alleen door één keer
 * helemaal door te lopen; daarna volstaat bijhouden vanaf de cursor.
 */

import { get, put } from "@vercel/blob";

const STATE_PATH = "ringside/ingest-state.json";
const EVENTS_PATH = "ringside/sales-by-event.json";

/** Verkoop van één product, als `dagen tot het event` → `aantal`. */
export type OffsetCounts = Record<string, number>;

export interface EventSales {
  productId: string;
  name: string;
  eventDate: string;
  /** `product_type` uit Ringside, om wedstrijden van merchandise te scheiden. */
  productType: string;
  category: string;
  season: string;
  /** Verkocht per dagen-tot-de-wedstrijd. Sleutel is het getal als tekst. */
  perOffset: OffsetCounts;
  total: number;
}

export interface IngestState {
  /** Waar de volgende run verdergaat. `null` betekent: begin bij het begin. */
  salesCursor: string | null;
  productsCursor: string | null;
  /** `true` zodra de hele tabel één keer doorlopen is. */
  salesComplete: boolean;
  productsComplete: boolean;
  rowsRead: number;
  productsRead: number;
  runs: number;
  updatedAt: string;
  lastError: string | null;
  /**
   * Tot wanneer een run bezig is, als ISO-tijd.
   *
   * Zonder dit slot kan de cron afgaan terwijl een ketting nog loopt. Beide
   * runs lezen dan dezelfde cursor, lezen dezelfde rijen, en tellen die
   * allebei op bij de aggregaten — dubbeltellen dus, wat aan de cijfers niet
   * te zien is. Een verlopen slot wordt genegeerd, zodat een gecrashte run de
   * boel niet blokkeert.
   */
  runningUntil: string | null;
  /**
   * Vroegste en laatste `transaction_date` die we tegenkwamen.
   *
   * De tabel is geordend op sleutel, niet op datum, maar in de praktijk lopen
   * die grotendeels gelijk op: de verkoop van het lopende seizoen komt pas aan
   * het eind in beeld. Dit bereik laat zien tot waar we zijn.
   */
  salesDateSeen: { earliest: string | null; latest: string | null };
}

export const EMPTY_STATE: IngestState = {
  salesCursor: null,
  productsCursor: null,
  salesComplete: false,
  productsComplete: false,
  rowsRead: 0,
  productsRead: 0,
  runs: 0,
  updatedAt: "",
  lastError: null,
  runningUntil: null,
  salesDateSeen: { earliest: null, latest: null },
};

/** Of er op dit moment een andere run bezig is. */
export function isLocked(state: IngestState, now = Date.now()): boolean {
  if (!state.runningUntil) return false;
  const until = new Date(state.runningUntil).getTime();
  return Number.isFinite(until) && until > now;
}

async function readJson<T>(path: string): Promise<T | null> {
  const result = await get(path, { access: "private", useCache: false });
  if (!result || !result.stream) return null;
  try {
    return JSON.parse(await new Response(result.stream).text()) as T;
  } catch {
    // Een stukgelopen bestand mag de ingest niet blokkeren: dan begint hij
    // opnieuw, wat traag is maar wel tot een juist resultaat leidt.
    console.error(`[ringside] ${path} niet te lezen.`);
    return null;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await put(path, JSON.stringify(value), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function readState(): Promise<IngestState> {
  const state = await readJson<IngestState>(STATE_PATH);
  return state ? { ...EMPTY_STATE, ...state } : { ...EMPTY_STATE };
}

export async function writeState(state: IngestState): Promise<void> {
  await writeJson(STATE_PATH, { ...state, updatedAt: new Date().toISOString() });
}

export async function readEventSales(): Promise<Record<string, EventSales>> {
  return (await readJson<Record<string, EventSales>>(EVENTS_PATH)) ?? {};
}

export async function writeEventSales(events: Record<string, EventSales>): Promise<void> {
  await writeJson(EVENTS_PATH, events);
}

/**
 * Telt de verkoop van een run bij de bestaande aggregaten op.
 *
 * Optellen en niet vervangen: een run leest maar een deel van de tabel, en de
 * rijen van één wedstrijd liggen verspreid. Pas als de hele tabel doorlopen is,
 * is een totaal compleet.
 */
export function mergeOffsets(existing: OffsetCounts, addition: Map<number, number>): OffsetCounts {
  const merged: OffsetCounts = { ...existing };
  for (const [offset, count] of addition) {
    const key = String(offset);
    merged[key] = (merged[key] ?? 0) + count;
  }
  return merged;
}

export function totalOf(counts: OffsetCounts): number {
  let total = 0;
  for (const count of Object.values(counts)) total += count;
  return total;
}
