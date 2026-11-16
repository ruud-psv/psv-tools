/**
 * De wachtlijst uit Ringside: wat we bewaren en hoe een rij uit de stroom
 * daarin terechtkomt.
 *
 * De wachtlijst is in SeatGeek een product. Wie zich inschrijft, krijgt een
 * verkoopregel op dat product in `/v1/sales`. Ringside kan niet op product
 * filteren, dus wordt de stroom doorgelopen en blijven alleen de regels van de
 * wachtlijst bewaard (`applySale()`). Leeftijd en postcode staan niet op de
 * verkoopregel maar bij de klant in `/v1/clients` (`applyClient()`).
 *
 * Persoonsgegevens: we bewaren geen naam, adres, geboortedatum of klantnummer.
 * Per persoon blijft over: een vingerafdruk van de klant-GUID (niet terug te
 * rekenen), het geboortejaar en de vier cijfers van de postcode. De pagina
 * toont alleen aantallen.
 *
 * Dit bestand is puur: geen opslag en geen netwerk, zodat de tests het direct
 * kunnen gebruiken.
 */

import { getProductDisplayName } from "../ringside/products";
import { SOLD_SALE_TYPES } from "../ringside/sales";
import { amsterdamDay } from "../ringside/sales-series";
import { ownerFingerprint } from "../ringside/seat-state";

/** Een product is de wachtlijst als de naam hierop past. */
const WAITLIST_NAME = /wacht\s*lijst|waiting\s*list|wait\s*list/i;

export const ROW_CURRENT = 1;
export const ROW_FORWARDED = 2;

/**
 * Eén verkoopregel van de wachtlijst, compact. `item` is `product_item_id`
 * (de inschrijving; meerdere regels kunnen bij dezelfde inschrijving horen),
 * `owner` de vingerafdruk van de klant, `day` de Nederlandse kalenderdag van
 * `transaction_date` en `touched` die van `last_touched_at`.
 */
export type WaitlistRow = [
  product: string,
  item: string,
  owner: string,
  day: string,
  saleType: string,
  flags: number,
  touched: string,
];

/** Geboortejaar en postcode van een klant; zie `postcodeCode()`. */
export type WaitlistClient = [birthYear: number | null, postcode: string];

export interface WaitlistProduct {
  name: string;
  type: string;
}

/** Welke kolommen de data bleek te hebben. Kolomnamen, geen waarden. */
export interface WaitlistColumns {
  salesOwner: string | null;
  clientKey: string | null;
  birth: string | null;
  postcode: string | null;
  country: string | null;
}

export interface WaitlistData {
  productsCursor: string | null;
  salesCursor: string | null;
  clientsCursor: string | null;
  productsRead: number;
  salesRead: number;
  clientsRead: number;
  /** `true` zodra `/v1/sales` één keer tot het eind is gelezen. */
  salesComplete: boolean;
  /** Wanneer de verkoop voor het laatst tot het eind van de stroom is bijgewerkt. */
  salesCaughtUpAt: string | null;
  /** De producten die als wachtlijst tellen. */
  products: Record<string, WaitlistProduct>;
  /** Producten van het type Memberships: de kandidaten als de naam niet past. */
  candidates: Record<string, WaitlistProduct>;
  /** Met de hand gekozen producten (`?productId=`); `null` is kiezen op naam. */
  chosen: string[] | null;
  /** Per `sales_item_id` de laatste versie van de regel. */
  rows: Record<string, WaitlistRow>;
  /** Per vingerafdruk wat we van de klant weten. */
  clients: Record<string, WaitlistClient>;
  /** Een volledige doorloop van `/v1/clients` is bezig voor deze mensen. */
  pending: string[];
  /** Na een volledige doorloop niet gevonden in `/v1/clients`. */
  unmatched: string[];
  clientsPass: "idle" | "running";
  clientsPassStartedAt: string | null;
  clientsPassDoneAt: string | null;
  columns: WaitlistColumns;
}

export function emptyWaitlistData(): WaitlistData {
  return {
    productsCursor: null,
    salesCursor: null,
    clientsCursor: null,
    productsRead: 0,
    salesRead: 0,
    clientsRead: 0,
    salesComplete: false,
    salesCaughtUpAt: null,
    products: {},
    candidates: {},
    chosen: null,
    rows: {},
    clients: {},
    pending: [],
    unmatched: [],
    clientsPass: "idle",
    clientsPassStartedAt: null,
    clientsPassDoneAt: null,
    columns: { salesOwner: null, clientKey: null, birth: null, postcode: null, country: null },
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function isTrue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return typeof value === "string" && value.toLowerCase() === "true";
}

const SOLD: ReadonlySet<string> = new Set(SOLD_SALE_TYPES);

/** Of een regel een geldende inschrijving is: dezelfde definitie als een verkocht ticket, zonder `item_type`. */
export function isActiveRow(row: WaitlistRow): boolean {
  return SOLD.has(row[4]) && (row[5] & ROW_CURRENT) !== 0 && (row[5] & ROW_FORWARDED) === 0;
}

/** Of een regel een inschrijving is of was (ook een latere, vervallen versie). */
export function isSignupRow(row: WaitlistRow): boolean {
  return SOLD.has(row[4]);
}

/* ---------- Producten ---------- */

export interface ProductFeedRow {
  product_id?: unknown;
  product_type?: unknown;
  product_description?: unknown;
  product_details?: unknown;
}

/** Werkt de wachtlijst-producten bij uit een pagina van `/v1/products`. */
export function applyProducts(data: WaitlistData, rows: readonly ProductFeedRow[]): void {
  for (const row of rows) {
    const productId = text(row.product_id).toLowerCase();
    if (!productId) continue;
    const type = text(row.product_type);
    const name = getProductDisplayName(row) ?? text(row.product_description) ?? "";
    const names = `${name} ${text(row.product_description)}`;

    if (type === "Memberships") data.candidates[productId] = { name: name || "Onbekend", type };

    const wanted = data.chosen ? data.chosen.includes(productId) : WAITLIST_NAME.test(names);
    if (!wanted) continue;
    data.products[productId] = { name: name || "Onbekend", type };
  }
}

/* ---------- Verkoop ---------- */

export interface SalesFeedRow {
  _ringside_operation?: unknown;
  sales_item_id?: unknown;
  product_id?: unknown;
  product_item_id?: unknown;
  sale_type?: unknown;
  current_status?: unknown;
  forward_item_id?: unknown;
  transaction_date?: unknown;
  last_touched_at?: unknown;
  [column: string]: unknown;
}

/** Waar de klant op een verkoopregel kan staan; de eerste die gevuld is, telt. */
const SALES_OWNER_COLUMNS = ["own_client_guid", "client_guid", "own_client_id", "client_id"] as const;

/**
 * Verwerkt één verkoopregel. Geeft `true` als er iets veranderde. Een latere
 * versie van dezelfde regel (zelfde `sales_item_id`) vervangt de vorige, dus
 * een retour of wijziging komt vanzelf goed.
 */
export function applySale(data: WaitlistData, row: SalesFeedRow): boolean {
  const salesItemId = text(row.sales_item_id).toLowerCase();
  if (!salesItemId) return false;

  if (row._ringside_operation === "D") {
    if (!data.rows[salesItemId]) return false;
    delete data.rows[salesItemId];
    return true;
  }

  const productId = text(row.product_id).toLowerCase();
  if (!data.products[productId]) return false;

  const ownerColumn = SALES_OWNER_COLUMNS.find((column) => text(row[column]));
  if (ownerColumn && !data.columns.salesOwner) data.columns.salesOwner = ownerColumn;

  const forwarded = row.forward_item_id !== null && row.forward_item_id !== undefined && text(row.forward_item_id) !== "";
  data.rows[salesItemId] = [
    productId,
    text(row.product_item_id).toLowerCase() || salesItemId,
    ownerColumn ? ownerFingerprint(row[ownerColumn]) : "",
    amsterdamDay(row.transaction_date) ?? "",
    text(row.sale_type),
    (isTrue(row.current_status) ? ROW_CURRENT : 0) | (forwarded ? ROW_FORWARDED : 0),
    amsterdamDay(row.last_touched_at) ?? "",
  ];
  return true;
}

/* ---------- Klanten ---------- */

export type ClientFeedRow = Record<string, unknown>;

/**
 * De kolommen van `/v1/clients` zijn niet vooraf gemeten, dus zoeken we ze op
 * naam. Voor de sleutel komt elke kolom in aanmerking die op `guid` of `id`
 * eindigt; welke het is, blijkt uit de eerste klant die we herkennen.
 */
const KEY_COLUMN = /(^|_)(guid|id)$/i;
const BIRTH_COLUMN = /birth|(^|_)dob($|_)|geboorte/i;
const POSTCODE_COLUMN = /post_?code|postal|(^|_)zip/i;
const COUNTRY_COLUMN = /country|(^|_)land($|_)/i;

/** Voorkeur bij meerdere postcodekolommen: het eigen adres vóór factuur of bezorging. */
function columnRank(column: string): number {
  if (/bill|invoice|factuur/i.test(column)) return 2;
  if (/deliver|ship|bezorg/i.test(column)) return 3;
  return /prim|home|main|own/i.test(column) ? 0 : 1;
}

function firstFilled(row: ClientFeedRow, pattern: RegExp): { column: string; value: string } | null {
  const hits = Object.keys(row)
    .filter((column) => pattern.test(column) && text(row[column]))
    .sort((a, b) => columnRank(a) - columnRank(b));
  return hits.length ? { column: hits[0], value: text(row[hits[0]]) } : null;
}

/** Het geboortejaar uit een datum; `null` als het geen aannemelijk jaar is. */
export function birthYear(value: string, thisYear: number): number | null {
  const match = /^(\d{4})-\d{2}-\d{2}/.exec(value) ?? /^\d{1,2}[-/.]\d{1,2}[-/.](\d{4})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  // 1900-01-01 en dergelijke zijn invulwaarden, geen geboortedatum.
  return year > 1905 && year <= thisYear ? year : null;
}

/**
 * De postcode zoals we hem bewaren: de vier cijfers van een Nederlandse
 * postcode, `BE` of `DE` voor de buurlanden, `XX` voor al het andere dat wel
 * ingevuld is, en leeg als er niets stond.
 *
 * Vier cijfers zonder letters zijn zonder land niet te plaatsen (Nederlands
 * zonder letters, of Belgisch); die tellen als `XX`.
 */
export function postcodeCode(postcode: string, country: string): string {
  const raw = postcode.toUpperCase().replace(/[\s.-]/g, "");
  if (!raw) return "";
  const land = country.trim().toUpperCase();
  const isNl = /^(NL|NLD|NEDERLAND|NETHERLANDS|THE NETHERLANDS|HOLLAND)$/.test(land);
  const isBe = /^(BE|BEL|BELGIE|BELGIË|BELGIUM|BELGIQUE)$/.test(land);
  const isDe = /^(DE|DEU|DUITSLAND|GERMANY|DEUTSCHLAND)$/.test(land);

  const withLetters = /^(?:NL)?([1-9]\d{3})[A-Z]{2}$/.exec(raw);
  if (withLetters && !isBe && !isDe) return withLetters[1];
  const digits = /^(?:[A-Z]{1,2})?([1-9]\d{3})$/.exec(raw);
  if (digits && isNl) return digits[1];
  if (isBe) return "BE";
  if (isDe) return "DE";
  return "XX";
}

/**
 * Verwerkt één klant, als hij op de wachtlijst staat. `wanted` zijn de
 * vingerafdrukken van iedereen op de wachtlijst.
 */
export function applyClient(
  data: WaitlistData,
  row: ClientFeedRow,
  wanted: ReadonlySet<string>,
  thisYear: number
): boolean {
  // Zodra bekend is in welke kolom de GUID staat, hoeft alleen die nog.
  const keyColumns = data.columns.clientKey ? [data.columns.clientKey] : Object.keys(row).filter((c) => KEY_COLUMN.test(c));
  let owner = "";
  for (const column of keyColumns) {
    const fingerprint = ownerFingerprint(row[column]);
    if (fingerprint && wanted.has(fingerprint)) {
      owner = fingerprint;
      data.columns.clientKey = column;
      break;
    }
  }
  if (!owner) return false;

  if (row._ringside_operation === "D") {
    if (!data.clients[owner]) return false;
    delete data.clients[owner];
    return true;
  }

  const birth = firstFilled(row, BIRTH_COLUMN);
  const postcode = firstFilled(row, POSTCODE_COLUMN);
  const country = firstFilled(row, COUNTRY_COLUMN);
  if (birth) data.columns.birth = birth.column;
  if (postcode) data.columns.postcode = postcode.column;
  if (country) data.columns.country = country.column;

  data.clients[owner] = [
    birth ? birthYear(birth.value, thisYear) : null,
    postcode ? postcodeCode(postcode.value, country?.value ?? "") : "",
  ];
  return true;
}

/** De vingerafdrukken van iedereen met een regel op de wachtlijst. */
export function waitlistOwners(data: WaitlistData, onlyActive = false): Set<string> {
  const owners = new Set<string>();
  for (const row of Object.values(data.rows)) {
    if (row[2] && (!onlyActive || isActiveRow(row))) owners.add(row[2]);
  }
  return owners;
}

/** Mensen die nu op de wachtlijst staan en nog nooit in `/v1/clients` zijn opgezocht. */
export function ownersToLookUp(data: WaitlistData): string[] {
  const skip = new Set(data.unmatched);
  return [...waitlistOwners(data, true)].filter((owner) => !data.clients[owner] && !skip.has(owner));
}
