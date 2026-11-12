/**
 * De verkoopregels van één wedstrijd, met het moment van verkoop, voor het
 * effect van een mail over aangrenzende stoelen (zie `./effect.ts`).
 *
 * De stoelstatus (`lib/ringside/seat-state.ts`) is hier niet genoeg: die
 * bewaart alleen wie nu op een stoel zit, niet sinds wanneer, en hij wist een
 * wedstrijd zodra die gespeeld is. Daarom wordt `/v1/sales` voor de gekozen
 * wedstrijd één keer helemaal doorgelezen, net als bij de instroom, en blijft
 * elke ticketregel van die wedstrijd bewaard: ook vervallen regels en retouren,
 * zodat terug te rekenen is wie er op het moment van de mail op een stoel zat.
 *
 * Ringside levert elke nieuwe versie van een rij opnieuw: "de laatste versie
 * wint", net als bij de stoelstatus. Hier staat alleen hoe één rij de
 * opgeslagen data verandert, puur, zodat het te testen is.
 *
 * Geen persoonsgegevens: de eigenaar alleen als korte hash (dezelfde als in de
 * stoelstatus), het ticket-id alleen gehasht.
 */

import { idHash, parseScanDate } from "../instroom/state";
import {
  isOccupyingTicket,
  isReservation,
  isResoldTicket,
  ownerFingerprint,
  resaleFlags,
  RESALE_BOUGHT,
  RESALE_POSTED,
  type SalesFeedRow,
} from "../ringside/seat-state";

/**
 * `[vak, rij, stoel, verkocht op, vlaggen, eigenaar, sale_type]`.
 *
 * "Verkocht op" is `transaction_date` in seconden sinds 1970 (UTC). De eigenaar
 * is de hash van `own_client_guid` (`ownerFingerprint()`), leeg als die er niet
 * is. `sale_type` staat er zoals Ringside hem levert.
 */
export type EffectTicket = [
  area: string,
  row: string,
  seat: string,
  at: number,
  flags: number,
  owner: string,
  saleType: string,
];

/** Houdt nu een stoel bezet (`isOccupyingTicket()`), ook een openstaande reservering. */
export const TICKET_CURRENT = 1;
/** Een openstaande reservering: `sale_type = 'Reservation'`. */
export const TICKET_RESERVATION = 2;
/** In de resale aangeboden: `resale_status = 'Posted'`. */
export const TICKET_POSTED = 4;
/** Via de resale gekocht: `is_venue_resale = true`. */
export const TICKET_VENUE_RESALE = 8;
/** De kaart van een verkoper die in de resale is doorverkocht (`Resold - Refunded`). */
export const TICKET_RESOLD = 16;
/** Hoort bij een seizoenkaart of andere reeks: `subscription_instance_id` gevuld. */
export const TICKET_SEASON = 32;

export interface EffectData {
  productId: string;
  /** Op de gehashte `sales_item_id`. */
  tickets: Record<string, EffectTicket>;
}

export function emptyEffectData(productId: string): EffectData {
  return { productId, tickets: {} };
}

/** De velden uit `/v1/sales` die hier nodig zijn. */
export interface EffectSalesRow extends SalesFeedRow {
  transaction_date?: unknown;
  subscription_instance_id?: unknown;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

export function effectFlags(row: EffectSalesRow): number {
  const resale = resaleFlags(row);
  let flags = 0;
  if (isOccupyingTicket(row)) flags |= TICKET_CURRENT;
  if (isReservation(row)) flags |= TICKET_RESERVATION;
  if (resale & RESALE_POSTED) flags |= TICKET_POSTED;
  if (resale & RESALE_BOUGHT) flags |= TICKET_VENUE_RESALE;
  if (isResoldTicket(row)) flags |= TICKET_RESOLD;
  if (text(row.subscription_instance_id)) flags |= TICKET_SEASON;
  return flags;
}

/**
 * Verwerkt één rij uit `/v1/sales`. Geeft `true` als de data veranderde.
 *
 * Alleen tickets (`item_type = 'Ticket'`) van deze wedstrijd met een
 * leesbare `transaction_date`. Regels van andere producten vallen meteen af,
 * zonder te hashen: bij een volledige doorloop zijn dat er miljoenen.
 */
export function applyEffectSale(data: EffectData, row: EffectSalesRow): boolean {
  const deleted = row._ringside_operation === "D";
  if (!deleted && text(row.product_id).toLowerCase() !== data.productId) return false;

  const key = idHash(row.sales_item_id);
  if (!key) return false;

  const at = parseScanDate(row.transaction_date);
  if (deleted || row.item_type !== "Ticket" || at === null) {
    if (!data.tickets[key]) return false;
    delete data.tickets[key];
    return true;
  }

  data.tickets[key] = [
    text(row.area),
    text(row.row),
    text(row.seat),
    at,
    effectFlags(row),
    ownerFingerprint(row.own_client_guid),
    text(row.sale_type),
  ];
  return true;
}
