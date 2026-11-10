/**
 * Controle voor de instroom: wat staat er werkelijk in Ringside?
 *
 * Twee vragen die de eerste keer inlezen openliet (0 scans van de gekozen
 * wedstrijd op 44.335 rijen):
 *
 * - **Van welke evenementen en jaren zijn de scans in `/v1/attendance`?** Dan is
 *   te zien of er iets van dit seizoen tussen zit, en onder welk product-id.
 * - **Wat staat er in `sales.barcode_history`?** Mogelijk staat daar per barcode
 *   of en wanneer hij gebruikt is. Alleen de vorm komt terug, nooit een barcode.
 *
 * Puur, zodat het te testen is; het lezen doet de route.
 */

export interface AttendanceCheckRow {
  product_id?: unknown;
  scan_date?: unknown;
  scan_succeeded?: unknown;
  action?: unknown;
  scanned_item?: unknown;
  scanner_name?: unknown;
  turnstile_name?: unknown;
  area_name?: unknown;
}

export interface ProductScans {
  productId: string;
  scans: number;
  firstScan: string | null;
  lastScan: string | null;
}

export interface AttendanceSummary {
  rows: number;
  /** Aantal scans per jaar van `scan_date`. */
  years: Record<string, number>;
  products: Map<string, ProductScans>;
  /** Welke waarden deze kolommen aannemen, met het aantal. */
  values: Record<"action" | "scanned_item" | "scanner_name" | "turnstile_name", Record<string, number>>;
  succeeded: number;
  withArea: number;
}

export function emptyAttendanceSummary(): AttendanceSummary {
  return {
    rows: 0,
    years: {},
    products: new Map(),
    values: { action: {}, scanned_item: {}, scanner_name: {}, turnstile_name: {} },
    succeeded: 0,
    withArea: 0,
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function count(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

export function addAttendanceRow(summary: AttendanceSummary, row: AttendanceCheckRow): void {
  summary.rows++;
  const date = text(row.scan_date);
  count(summary.years, /^\d{4}/.test(date) ? date.slice(0, 4) : "onbekend");
  if (row.scan_succeeded === true || text(row.scan_succeeded).toLowerCase() === "true") summary.succeeded++;
  if (text(row.area_name)) summary.withArea++;
  for (const column of ["action", "scanned_item", "scanner_name", "turnstile_name"] as const) {
    count(summary.values[column], text(row[column]) || "leeg");
  }

  const productId = text(row.product_id).toLowerCase() || "leeg";
  let product = summary.products.get(productId);
  if (!product) summary.products.set(productId, (product = { productId, scans: 0, firstScan: null, lastScan: null }));
  product.scans++;
  if (date) {
    if (!product.firstScan || date < product.firstScan) product.firstScan = date;
    if (!product.lastScan || date > product.lastScan) product.lastScan = date;
  }
}

/* ---------- De vorm van barcode_history ---------- */

const DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
/** Sleutels waarvan de waarde een toegangsbewijs kan zijn. */
const SECRET_KEY = /barcode|code|number|token|pin/i;

/**
 * De vorm van een waarde, zonder iets te laten zien dat toegang geeft. Datums,
 * booleans, getallen en korte woorden (een status) blijven staan; al het andere
 * wordt alleen zijn type. Een sleutel die naar een barcode ruikt, wordt altijd
 * gemaskeerd, behalve als er een datum of boolean in staat.
 */
export function describeShape(value: unknown, key = ""): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 3).map((item) => describeShape(item, key));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([name, inner]) => [name, describeShape(inner, name)]));
  }
  if (typeof value === "string" && DATE.test(value.trim())) return value.trim();
  if (SECRET_KEY.test(key)) return "«gemaskeerd»";
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    // Een kort woord zonder lange cijferreeks is een status, geen code.
    return trimmed.length <= 30 && !/\d{6,}/.test(trimmed) && !/^[0-9a-f-]{20,}$/i.test(trimmed) ? trimmed : `«tekst, ${trimmed.length} tekens»`;
  }
  return typeof value;
}

/** `barcode_history` is tekst met JSON erin; geeft de vorm, of `null` als het leeg of onleesbaar is. */
export function describeBarcodeHistory(value: unknown): unknown {
  if (value === null || value === undefined || value === "") return null;
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return `«geen JSON, ${value.length} tekens»`;
    }
  }
  if (Array.isArray(parsed) && parsed.length === 0) return null;
  return describeShape(parsed);
}
