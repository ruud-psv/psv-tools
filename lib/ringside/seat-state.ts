/**
 * De stoelstatus van komende wedstrijden, bijgehouden uit Ringside.
 *
 * Ringside kan niet per wedstrijd opvragen: het levert alleen een stroom van
 * mutaties over de tabellen van SeatGeek. Wie wil weten welke stoelen nu vrij
 * zijn, moet die stroom dus zelf bijhouden. Hier staat hoe één rij uit die
 * stroom de opgeslagen toestand verandert — puur, zodat het te testen is.
 *
 * Per wedstrijd twee verzamelingen:
 *
 * - **Stoelen** uit `/v1/manifests`, op `manifest_id`. Elke stoel van de
 *   stoelenkaart, met of hij geblokkeerd is. Of een stoel verkocht is staat hier
 *   volgens de documentatie uitdrukkelijk níet in.
 * - **Geldige tickets** uit `/v1/sales`, op `sales_item_id`. Alleen tickets die
 *   nu een stoel bezet houden; vervalt een ticket (retour, doorverkocht), dan
 *   verdwijnt het. Ringside levert elke nieuwe versie van een rij opnieuw aan,
 *   dus bijwerken is altijd "laatste versie wint" — nooit optellen.
 *
 * Alleen komende wedstrijden worden bewaard. De stroom begint bij de oudste
 * historie; al het andere valt bij het lezen meteen af.
 */

import { createHash } from "node:crypto";
import { seatKey, toSeatNumber, type SeatInfo, type TicketInfo } from "../aangrenzende-stoelen/neighbors";

/** `[vak, rij, stoel, vlaggen]`; vlag 1 = niet geblokkeerd, 2 = staanvak. */
export type SeatTuple = [area: string, row: string, seat: string, flags: number];

/** `[manifest_id, vak, rij, stoel, in resale (1/0), gehashte eigenaar]`. */
export type TicketTuple = [manifestId: string, area: string, row: string, seat: string, posted: number, owner: string];

export const SEAT_SELLABLE = 1;
export const SEAT_GA = 2;

export interface EventSeatState {
  eventId: string;
  name: string | null;
  /** Datum en tijd van de wedstrijd zoals Ringside hem geeft (lokale tijd). */
  eventDate: string | null;
  seats: Record<string, SeatTuple>;
  tickets: Record<string, TicketTuple>;
}

export type EventStates = Map<string, EventSeatState>;

/** De velden uit `/v1/manifests` die hier nodig zijn. */
export interface ManifestFeedRow {
  _ringside_operation?: unknown;
  manifest_id?: unknown;
  event_id?: unknown;
  event_name?: unknown;
  event_date?: unknown;
  product_type?: unknown;
  area?: unknown;
  row?: unknown;
  seat?: unknown;
  is_ga?: unknown;
  is_counted_as_available?: unknown;
}

/** De velden uit `/v1/sales` die hier nodig zijn. */
export interface SalesFeedRow {
  _ringside_operation?: unknown;
  sales_item_id?: unknown;
  product_id?: unknown;
  manifest_id?: unknown;
  area?: unknown;
  row?: unknown;
  seat?: unknown;
  item_type?: unknown;
  sale_type?: unknown;
  current_status?: unknown;
  forward_item_id?: unknown;
  resale_status?: unknown;
  own_client_guid?: unknown;
}

/**
 * Welke `sale_type` een stoel bezet houdt.
 *
 * Breder dan de definitie van "verkocht" in `./sales.ts`: een openstaande
 * reservering is nog geen verkoop, maar de stoel is ook niet meer vrij te koop.
 */
const OCCUPYING_SALE_TYPES = new Set(["Sale", "Reservation", "Reservation Confirmation", "Update - New"]);

function isTrue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

/** Ids komen soms als uuid en soms als tekst binnen; kleine letters maken ze gelijk. */
function id(value: unknown): string | null {
  const raw = text(value);
  return raw ? raw.toLowerCase() : null;
}

function isDelete(row: { _ringside_operation?: unknown }): boolean {
  return row._ringside_operation === "D";
}

/** Of deze verkoopregel op dit moment een stoel bezet houdt. */
export function isOccupyingTicket(row: SalesFeedRow): boolean {
  if (row.item_type !== "Ticket") return false;
  if (typeof row.sale_type !== "string" || !OCCUPYING_SALE_TYPES.has(row.sale_type)) return false;
  if (!isTrue(row.current_status)) return false;
  return row.forward_item_id === null || row.forward_item_id === undefined;
}

/**
 * Een korte, niet terug te rekenen vingerafdruk van de eigenaar.
 *
 * De tool hoeft niet te weten wie iemand is, alleen of twee tickets van
 * dezelfde persoon zijn. De GUID zelf wordt dus nooit opgeslagen.
 */
export function ownerFingerprint(guid: unknown): string {
  const raw = id(guid);
  return raw ? createHash("sha256").update(raw).digest("hex").slice(0, 16) : "";
}

/** De datum (`YYYY-MM-DD`) van vandaag in Nederland: de grens tussen voorbij en komend. */
export function todayInAmsterdam(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(now);
}

function emptyEvent(eventId: string): EventSeatState {
  return { eventId, name: null, eventDate: null, seats: {}, tickets: {} };
}

/**
 * Verwerkt één rij uit `/v1/manifests`.
 *
 * `cutoff` is de datum van vandaag: stoelen van eerdere wedstrijden worden niet
 * bewaard. Geeft het event-id terug als er iets veranderde.
 */
export function applyManifestRow(events: EventStates, row: ManifestFeedRow, cutoff: string): string | null {
  const manifestId = id(row.manifest_id);
  if (!manifestId) return null;

  if (isDelete(row)) {
    for (const event of events.values()) {
      if (event.seats[manifestId]) {
        delete event.seats[manifestId];
        return event.eventId;
      }
    }
    return null;
  }

  // Een seizoenkaart heeft ook een stoelenkaart (`Series`); die is niet per wedstrijd.
  if (row.product_type !== "Event") return null;
  const eventId = id(row.event_id);
  const eventDate = text(row.event_date);
  if (!eventId || !eventDate || eventDate.slice(0, 10) < cutoff) return null;

  let event = events.get(eventId);
  if (!event) {
    event = emptyEvent(eventId);
    events.set(eventId, event);
  }
  event.eventDate = eventDate;
  if (!event.name && text(row.event_name)) event.name = text(row.event_name);

  const flags = (isTrue(row.is_counted_as_available) ? SEAT_SELLABLE : 0) | (isTrue(row.is_ga) ? SEAT_GA : 0);
  event.seats[manifestId] = [text(row.area), text(row.row), text(row.seat), flags];
  return eventId;
}

/**
 * Verwerkt één rij uit `/v1/sales`.
 *
 * `isPast` zegt of een product een wedstrijd is die al geweest is; die regels
 * vallen af. Een onbekend product wordt bewaard — dat is een nieuwe wedstrijd
 * die nog niet in de productenlijst staat. Geeft het event-id terug als er iets
 * veranderde.
 */
export function applySalesRow(
  events: EventStates,
  row: SalesFeedRow,
  isPast: (productId: string) => boolean
): string | null {
  const salesItemId = id(row.sales_item_id);
  if (!salesItemId) return null;
  const productId = id(row.product_id);

  if (isDelete(row) || !isOccupyingTicket(row)) {
    // Vervallen of verwijderd: weg uit de wedstrijd waar hij in stond. Meestal
    // weten we die via het product; alleen een delete heeft soms niets dan de
    // sleutel. Dat onderscheid scheelt veel: bij de eerste vulling komen
    // miljoenen oude regels langs die nergens in staan.
    const owner = productId ? events.get(productId) : undefined;
    const candidates = productId && !isDelete(row) ? (owner ? [owner] : []) : events.values();
    for (const event of candidates) {
      if (event.tickets[salesItemId]) {
        delete event.tickets[salesItemId];
        return event.eventId;
      }
    }
    return null;
  }

  if (!productId || isPast(productId)) return null;

  let event = events.get(productId);
  if (!event) {
    event = emptyEvent(productId);
    events.set(productId, event);
  }
  event.tickets[salesItemId] = [
    id(row.manifest_id) ?? "",
    text(row.area),
    text(row.row),
    text(row.seat),
    row.resale_status === "Posted" ? 1 : 0,
    ownerFingerprint(row.own_client_guid),
  ];
  return productId;
}

/**
 * Haalt wedstrijden weg die voorbij zijn.
 *
 * `knownDates` vult de datum aan voor wedstrijden waarvan alleen verkoop is
 * gezien (de stoelenkaart kan later in de stroom staan).
 */
export function prunePastEvents(events: EventStates, cutoff: string, knownDates: Map<string, string>): string[] {
  const removed: string[] = [];
  for (const [eventId, event] of events) {
    const date = event.eventDate ?? knownDates.get(eventId) ?? null;
    if (date && date.slice(0, 10) < cutoff) {
      events.delete(eventId);
      removed.push(eventId);
    }
  }
  return removed;
}

/** Zet de opgeslagen toestand om naar de invoer van `findNeighbors()`. */
export function toNeighborInput(event: EventSeatState): { seats: SeatInfo[]; tickets: TicketInfo[] } {
  const seats: SeatInfo[] = [];
  for (const [area, row, seat, flags] of Object.values(event.seats)) {
    if (flags & SEAT_GA) continue;
    const r = toSeatNumber(row);
    const s = toSeatNumber(seat);
    if (!area || r === null || s === null) continue;
    seats.push({ area, row: r, seat: s, sellable: Boolean(flags & SEAT_SELLABLE) });
  }

  const tickets: TicketInfo[] = [];
  for (const [manifestId, area, row, seat, posted, owner] of Object.values(event.tickets)) {
    // De stoel uit de stoelenkaart is leidend; de velden op het ticket zelf
    // zijn de terugval als die stoel (nog) niet bekend is.
    const fromManifest = manifestId ? event.seats[manifestId] : undefined;
    const key = fromManifest
      ? seatKey(fromManifest[0], fromManifest[1], fromManifest[2])
      : seatKey(area, row, seat);
    if (!key) continue;
    tickets.push({ key, resalePosted: posted === 1, owner: owner || null });
  }

  return { seats, tickets };
}

/** Telling voor het overzicht, zonder de stoelen zelf mee te sturen. */
export function summarizeEvent(event: EventSeatState): { seats: number; sellable: number; tickets: number } {
  let sellable = 0;
  const seats = Object.values(event.seats);
  for (const [, , , flags] of seats) if (flags & SEAT_SELLABLE && !(flags & SEAT_GA)) sellable++;
  return { seats: seats.length, sellable, tickets: Object.keys(event.tickets).length };
}
