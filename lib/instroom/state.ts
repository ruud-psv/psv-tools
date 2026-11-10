/**
 * De instroom van één gespeelde wedstrijd: welke stoel wanneer gescand is.
 *
 * Twee stromen uit Ringside, allebei gefilterd op het product van de wedstrijd:
 *
 * - **Tickets** uit `/v1/sales`, op `sales_item_id`: de stoel van elk ticket, of
 *   het nog geldig is, en de ids waaronder een scan ernaar kan verwijzen.
 * - **Scans** uit `/v1/attendance`, op `barcode_usage_id`: het tijdstip, of de
 *   scan slaagde, en naar welk ticket hij wijst.
 *
 * De stoel staat in de praktijk niet op de scan zelf (`area_name`, `row_name`
 * en `seat` waren leeg op 4.998 van de 5.000 rijen die we maten), dus die komt
 * via het ticket. Staat hij er wel, dan bewaren we hem mee.
 *
 * Ringside levert elke nieuwe versie van een rij opnieuw: bijwerken is dus
 * "de laatste versie wint", net als bij de stoelstatus. Hier staat alleen hoe
 * één rij de opgeslagen toestand verandert — puur, zodat het te testen is.
 *
 * Er worden geen persoonsgegevens bewaard: geen namen, relatienummers of
 * barcodes. Ids van tickets en scans gaan er alleen gehasht in.
 */

import { createHash } from "node:crypto";
import { isOccupyingTicket, isReservation, type SalesFeedRow } from "../ringside/seat-state";

/**
 * `[vak, rij, stoel, geldig, primair ticket, product-item]`.
 *
 * `geldig` is 1 voor een afgenomen ticket dat nu een plaats bezet houdt (geen
 * openstaande reservering). De twee ids zijn gehasht; een scan kan naar elk van
 * beide verwijzen, en naar de sleutel van de regel zelf.
 */
export type InstroomTicket = [
  area: string,
  row: string,
  seat: string,
  valid: 0 | 1,
  primaryTicket: string,
  productItem: string,
];

/**
 * `[tijdstip, vlaggen, primair ticket, gescand item, vak?, rij?, stoel?]`.
 *
 * Het tijdstip is in seconden sinds 1970 (UTC). De plek staat er alleen bij als
 * Ringside hem op de scan zelf meegaf.
 */
export type InstroomScan = [
  at: number,
  flags: number,
  primaryTicket: string,
  scannedItem: string,
  area?: string,
  row?: string,
  seat?: string,
];

/** De scan slaagde (`scan_succeeded`). */
export const SCAN_OK = 1;
/** Een scan naar binnen: `action` is `Entry` of `Re-Entry`. */
export const SCAN_ENTRY = 2;

export interface InstroomData {
  productId: string;
  /** Op de gehashte `sales_item_id`. */
  tickets: Record<string, InstroomTicket>;
  /** Op de gehashte `barcode_usage_id`. */
  scans: Record<string, InstroomScan>;
}

export function emptyInstroomData(productId: string): InstroomData {
  return { productId, tickets: {}, scans: {} };
}

/** De velden uit `/v1/sales` die hier nodig zijn. */
export interface InstroomSalesRow extends SalesFeedRow {
  primary_ticket_id?: unknown;
  product_item_id?: unknown;
}

/** De velden uit `/v1/attendance` die hier nodig zijn. */
export interface AttendanceFeedRow {
  _ringside_operation?: unknown;
  barcode_usage_id?: unknown;
  product_id?: unknown;
  primary_ticket_id?: unknown;
  scanned_item_id?: unknown;
  scan_date?: unknown;
  scan_succeeded?: unknown;
  action?: unknown;
  area_name?: unknown;
  row_name?: unknown;
  seat?: unknown;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function isTrue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function isDelete(row: { _ringside_operation?: unknown }): boolean {
  return row._ringside_operation === "D";
}

/**
 * Een korte, niet terug te rekenen vingerafdruk van een id uit Ringside.
 *
 * Genoeg om een scan aan zijn ticket te koppelen; het id zelf wordt nergens
 * bewaard. Leeg als er geen id is.
 */
export function idHash(value: unknown): string {
  const raw = text(value).toLowerCase();
  return raw ? createHash("sha256").update(raw).digest("hex").slice(0, 16) : "";
}

/**
 * `scan_date` als seconden sinds 1970.
 *
 * Ringside levert een `timestamp` zonder tijdzone, op de seconde, en volgens de
 * documentatie in UTC (`2019-10-25T17:31:50`). Staat er toch een zone achter,
 * dan geldt die. Geeft `null` als de waarde geen tijdstip is.
 */
export function parseScanDate(value: unknown): number | null {
  const raw = text(value);
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(raw);
  if (!match) return null;
  const zone = match[3] ? (match[3] === "Z" ? "Z" : match[3].replace(/^([+-]\d{2})(\d{2})$/, "$1:$2")) : "Z";
  const ms = new Date(`${match[1]}T${match[2]}${zone}`).getTime();
  return Number.isNaN(ms) ? null : Math.round(ms / 1000);
}

/**
 * De soorten verkoopregels die een stoel dragen. Een doorgezet of doorverkocht
 * ticket telt niet als verkocht (dat doet alleen `Ticket`), maar een scan kan er
 * wel naar verwijzen.
 */
const SEATED_ITEM_TYPES = new Set(["Ticket", "Transfer", "Resale"]);

/**
 * Verwerkt één rij uit `/v1/sales`. Geeft `true` als de toestand veranderde.
 *
 * Elke ticketregel van de wedstrijd blijft bewaard, ook een vervallen: een scan
 * kan naar een eerdere versie van het ticket verwijzen, en de stoel is dezelfde.
 */
export function applyInstroomSale(data: InstroomData, row: InstroomSalesRow): boolean {
  const key = idHash(row.sales_item_id);
  if (!key) return false;

  const ours = text(row.product_id).toLowerCase() === data.productId && SEATED_ITEM_TYPES.has(text(row.item_type));
  if (isDelete(row) || !ours) {
    if (!data.tickets[key]) return false;
    delete data.tickets[key];
    return true;
  }

  data.tickets[key] = [
    text(row.area),
    text(row.row),
    text(row.seat),
    isOccupyingTicket(row) && !isReservation(row) ? 1 : 0,
    idHash(row.primary_ticket_id),
    idHash(row.product_item_id),
  ];
  return true;
}

/** Verwerkt één rij uit `/v1/attendance`. Geeft `true` als de toestand veranderde. */
export function applyInstroomScan(data: InstroomData, row: AttendanceFeedRow): boolean {
  const key = idHash(row.barcode_usage_id);
  if (!key) return false;

  const at = parseScanDate(row.scan_date);
  const ours = text(row.product_id).toLowerCase() === data.productId && at !== null;
  if (isDelete(row) || !ours) {
    if (!data.scans[key]) return false;
    delete data.scans[key];
    return true;
  }

  const action = text(row.action);
  const flags = (isTrue(row.scan_succeeded) ? SCAN_OK : 0) | (action === "Entry" || action === "Re-Entry" ? SCAN_ENTRY : 0);
  const scan: InstroomScan = [at as number, flags, idHash(row.primary_ticket_id), idHash(row.scanned_item_id)];
  const area = text(row.area_name);
  if (area) scan.push(area, text(row.row_name), text(row.seat));
  data.scans[key] = scan;
  return true;
}
