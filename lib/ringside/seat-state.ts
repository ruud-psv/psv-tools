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

/**
 * `[vak, rij, stoel, vlaggen, capaciteit]`; vlag 1 = niet geblokkeerd,
 * 2 = staanvak, 4 = telt niet mee in de capaciteit. De capaciteit staat er
 * alleen als hij niet 1 is: een staanvak is één rij met bijvoorbeeld 703 plaatsen.
 */
export type SeatTuple = [area: string, row: string, seat: string, flags: number, capacity?: number];

/**
 * `[manifest_id, vak, rij, stoel, resale, gehashte eigenaar, reservering]`.
 *
 * `resale` is een optelling van vlaggen: `RESALE_POSTED` (1) staat nu in de
 * resale, `RESALE_BOUGHT` (2) is via de resale gekocht. Eerder was het alleen
 * 0 of 1; die waarden betekenen nog steeds hetzelfde.
 *
 * De laatste staat er alleen bij een openstaande reservering (1): de plaats is
 * bezet, maar nog niet afgenomen.
 */
export type TicketTuple = [
  manifestId: string,
  area: string,
  row: string,
  seat: string,
  resale: number,
  owner: string,
  reservation?: number,
];

/** In de resale aangeboden: `resale_status = 'Posted'`. */
export const RESALE_POSTED = 1;
/**
 * Via de resale gekocht: `is_venue_resale = true`. Dit is het ticket van de
 * koper; de kaart van de verkoper is dan vervallen (`Resold - Refunded`).
 */
export const RESALE_BOUGHT = 2;

/** Een openstaande reservering: `sale_type = 'Reservation'`, nog niet bevestigd. */
export function isReservation(row: SalesFeedRow): boolean {
  return row.sale_type === "Reservation";
}

export const SEAT_SELLABLE = 1;
export const SEAT_GA = 2;
export const SEAT_EXCLUDED = 4;

/** Capaciteit van een rij uit de stoelenkaart; zonder waarde is dat 1. */
export function seatCapacity(seat: SeatTuple): number {
  return seat[4] ?? 1;
}

export interface EventSeatState {
  eventId: string;
  name: string | null;
  /**
   * Datum en tijd van de wedstrijd in Nederlandse tijd, met de offset erbij
   * (`2026-11-28T18:45:00+01:00`); zie `manifestDateToAmsterdam()`. Komt hij
   * uit de productenlijst, dan is het tekst zonder offset
   * (`2026-11-28 18:45:00`).
   */
  eventDate: string | null;
  seats: Record<string, SeatTuple>;
  tickets: Record<string, TicketTuple>;
  /**
   * Tickets die via de resale zijn doorverkocht (`Resold - Refunded`): de kaart
   * van de verkoper. Houdt geen stoel bezet, dus apart van `tickets`; alleen
   * voor de export. Ontbreekt in bestanden van vóór die export.
   */
  resold?: Record<string, ResoldTuple>;
}

/** `[manifest_id, vak, rij, stoel, gehashte eigenaar]` van een doorverkocht ticket. */
export type ResoldTuple = [manifestId: string, area: string, row: string, seat: string, owner: string];

/** `resale_status` van de kaart van de verkoper nadat hij in de resale verkocht is. */
export const RESOLD_STATUS = "Resold - Refunded";

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
  capacity?: unknown;
  is_excluded_from_reported_capacity?: unknown;
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
  is_venue_resale?: unknown;
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
 * Of dit de kaart van een verkoper is die in de resale verkocht is.
 *
 * Na de doorverkoop heeft de oorspronkelijke verkoopregel `Resold - Refunded`
 * en `current_status = false`. Er komt ook een `Return` met dezelfde status
 * bij; die telt niet, anders staat hetzelfde ticket er twee keer in.
 */
export function isResoldTicket(row: SalesFeedRow): boolean {
  if (row.item_type !== "Ticket" || row.resale_status !== RESOLD_STATUS) return false;
  return typeof row.sale_type === "string" && SOLD_FOR_RESALE.has(row.sale_type);
}

const SOLD_FOR_RESALE = new Set(["Sale", "Reservation Confirmation", "Update - New"]);

/**
 * De resale-vlaggen van een verkoopregel.
 *
 * Zo ziet een doorverkoop eruit in `/v1/sales` (gemeten op 2026-11-04):
 * aangeboden is `Sale` met `Posted`, nog geldig. Na verkoop wordt die regel
 * `Resold - Refunded` en ongeldig, er komt een `Return` met dezelfde status
 * bij, en de koper krijgt een nieuw `Sale`-ticket met `is_venue_resale = true`.
 */
export function resaleFlags(row: SalesFeedRow): number {
  return (row.resale_status === "Posted" ? RESALE_POSTED : 0) | (isTrue(row.is_venue_resale) ? RESALE_BOUGHT : 0);
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

const AMSTERDAM_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Amsterdam",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZoneName: "longOffset",
});

/**
 * Zet `manifests.event_date` om naar Nederlandse tijd.
 *
 * Ringside levert dat veld als `timestamp` zonder tijdzone, en het staat in
 * UTC. Vastgesteld op 2026-11-04: PSV - Real Sociedad (16-09-2021, aftrap
 * 21:00 zomertijd) staat er als 19:00, PSV - Go Ahead Eagles (28-11-2026,
 * aftrap 18:45 wintertijd) als 17:45. De uitkomst krijgt de offset erbij,
 * zodat zichtbaar is dat hij al is omgezet en elke `new Date()` hem goed leest.
 * Geeft `null` als de waarde geen tijdstip is.
 */
export function manifestDateToAmsterdam(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const zone = match[3] ? (match[3] === "Z" ? "Z" : match[3].replace(/^([+-]\d{2})(\d{2})$/, "$1:$2")) : "Z";
  const instant = new Date(`${match[1]}T${match[2]}${zone}`);
  if (isNaN(instant.getTime())) return null;

  const parts: Record<string, string> = {};
  for (const part of AMSTERDAM_PARTS.formatToParts(instant)) parts[part.type] = part.value;
  // `longOffset` geeft "GMT+01:00"; precies op UTC alleen "GMT".
  const offset = parts.timeZoneName.replace("GMT", "") || "+00:00";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

/**
 * Eenmalig: tijden van vóór `manifestDateToAmsterdam()` staan nog in UTC.
 *
 * Die zijn te herkennen: een `T` en geen offset. Een tijd met offset is al
 * omgezet, en een tijd uit de productenlijst heeft een spatie; die blijven
 * staan. Daardoor kan dit gerust bij elke run draaien. Geeft de event-ids
 * terug die veranderden.
 */
export function localizeStoredEventDates(events: EventStates): string[] {
  const changed: string[] = [];
  for (const event of events.values()) {
    const value = event.eventDate;
    if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(value)) continue;
    const local = manifestDateToAmsterdam(value);
    if (local && local !== value) {
      event.eventDate = local;
      changed.push(event.eventId);
    }
  }
  return changed;
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
  const raw = text(row.event_date);
  const eventDate = raw ? (manifestDateToAmsterdam(raw) ?? raw) : "";
  if (!eventId || !eventDate || eventDate.slice(0, 10) < cutoff) return null;

  let event = events.get(eventId);
  if (!event) {
    event = emptyEvent(eventId);
    events.set(eventId, event);
  }
  event.eventDate = eventDate;
  if (!event.name && text(row.event_name)) event.name = text(row.event_name);

  const flags =
    (isTrue(row.is_counted_as_available) ? SEAT_SELLABLE : 0) |
    (isTrue(row.is_ga) ? SEAT_GA : 0) |
    (isTrue(row.is_excluded_from_reported_capacity) ? SEAT_EXCLUDED : 0);
  const tuple: SeatTuple = [text(row.area), text(row.row), text(row.seat), flags];
  const capacity = capacityOf(row);
  if (capacity !== 1) tuple.push(capacity);
  event.seats[manifestId] = tuple;
  return eventId;
}

function capacityOf(row: ManifestFeedRow): number {
  const value = Number(row.capacity);
  return Number.isInteger(value) && value >= 0 ? value : 1;
}

/**
 * Vult de capaciteit aan op een stoel die al bekend is.
 *
 * Voor de eenmalige tweede ronde door `/v1/manifests`: de capaciteit werd
 * eerst niet bewaard. Verandert alleen capaciteit en de vlag "telt niet mee";
 * of een stoel geblokkeerd is blijft zoals de gewone stroom hem zette. Geeft
 * het event-id terug als er iets veranderde.
 */
export function applyManifestCapacity(events: EventStates, row: ManifestFeedRow): string | null {
  const manifestId = id(row.manifest_id);
  if (!manifestId || isDelete(row)) return null;
  const eventId = id(row.event_id);
  const event = eventId ? events.get(eventId) : undefined;
  const seat = event?.seats[manifestId];
  if (!event || !seat) return null;

  const flags = (seat[3] & ~SEAT_EXCLUDED) | (isTrue(row.is_excluded_from_reported_capacity) ? SEAT_EXCLUDED : 0);
  const capacity = capacityOf(row);
  if (flags === seat[3] && capacity === seatCapacity(seat)) return null;
  const updated: SeatTuple = [seat[0], seat[1], seat[2], flags];
  if (capacity !== 1) updated.push(capacity);
  event.seats[manifestId] = updated;
  return event.eventId;
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
    const resoldIn = applyResold(events, row, salesItemId, productId, isPast);
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
    return resoldIn;
  }

  if (!productId || isPast(productId)) return null;

  let event = events.get(productId);
  if (!event) {
    event = emptyEvent(productId);
    events.set(productId, event);
  }
  const tuple: TicketTuple = [
    id(row.manifest_id) ?? "",
    text(row.area),
    text(row.row),
    text(row.seat),
    resaleFlags(row),
    ownerFingerprint(row.own_client_guid),
  ];
  if (isReservation(row)) tuple.push(1);
  event.tickets[salesItemId] = tuple;
  return productId;
}

/**
 * Houdt de lijst met doorverkochte tickets bij: erbij als de regel er een is,
 * eraf als hij verwijderd wordt of niet meer doorverkocht is. Geeft het
 * event-id terug als er iets veranderde.
 */
function applyResold(
  events: EventStates,
  row: SalesFeedRow,
  salesItemId: string,
  productId: string | null,
  isPast: (productId: string) => boolean
): string | null {
  if (!isDelete(row) && isResoldTicket(row)) {
    if (!productId || isPast(productId)) return null;
    let event = events.get(productId);
    if (!event) {
      event = emptyEvent(productId);
      events.set(productId, event);
    }
    const tuple: ResoldTuple = [
      id(row.manifest_id) ?? "",
      text(row.area),
      text(row.row),
      text(row.seat),
      ownerFingerprint(row.own_client_guid),
    ];
    const existing = event.resold?.[salesItemId];
    if (existing && existing.every((value, i) => value === tuple[i])) return null;
    (event.resold ??= {})[salesItemId] = tuple;
    return event.eventId;
  }

  const owner = productId ? events.get(productId) : undefined;
  const candidates = productId && !isDelete(row) ? (owner ? [owner] : []) : events.values();
  for (const event of candidates) {
    if (event.resold?.[salesItemId]) {
      delete event.resold[salesItemId];
      return event.eventId;
    }
  }
  return null;
}

/**
 * Vult de doorverkochte tickets aan voor wedstrijden die al bekend zijn.
 *
 * Voor de eenmalige vierde ronde door `/v1/sales`: die tickets werden eerst
 * niet bewaard. Maakt geen nieuwe wedstrijden aan. Geeft het event-id terug
 * als er iets veranderde.
 */
export function applySalesResold(events: EventStates, row: SalesFeedRow): string | null {
  const salesItemId = id(row.sales_item_id);
  const productId = id(row.product_id);
  if (!salesItemId || !productId || isDelete(row) || !isResoldTicket(row) || !events.has(productId)) return null;
  return applyResold(events, row, salesItemId, productId, () => false);
}

/**
 * Vult bij een ticket dat al bekend is aan of het een openstaande reservering
 * is.
 *
 * Voor de eenmalige tweede ronde door `/v1/sales`: dat onderscheid werd eerst
 * niet bewaard. Verandert verder niets; of een ticket bestaat, bepaalt de
 * gewone stroom. Geeft het event-id terug als er iets veranderde.
 */
export function applySalesReservation(events: EventStates, row: SalesFeedRow): string | null {
  const salesItemId = id(row.sales_item_id);
  const productId = id(row.product_id);
  if (!salesItemId || !productId || isDelete(row) || !isOccupyingTicket(row)) return null;
  const event = events.get(productId);
  const ticket = event?.tickets[salesItemId];
  if (!event || !ticket) return null;

  const reservation = isReservation(row);
  if (reservation === (ticket[6] === 1)) return null;
  const updated: TicketTuple = [ticket[0], ticket[1], ticket[2], ticket[3], ticket[4], ticket[5]];
  if (reservation) updated.push(1);
  event.tickets[salesItemId] = updated;
  return event.eventId;
}

/**
 * Vult bij een ticket dat al bekend is aan of het via de resale gekocht is.
 *
 * Voor de eenmalige derde ronde door `/v1/sales`: `is_venue_resale` werd eerst
 * niet bewaard. Raakt alleen die ene vlag; of het ticket nu in de resale staat
 * en of het bestaat, bepaalt de gewone stroom. Geeft het event-id terug als er
 * iets veranderde.
 */
export function applySalesVenueResale(events: EventStates, row: SalesFeedRow): string | null {
  const salesItemId = id(row.sales_item_id);
  const productId = id(row.product_id);
  if (!salesItemId || !productId || isDelete(row) || !isOccupyingTicket(row)) return null;
  const event = events.get(productId);
  const ticket = event?.tickets[salesItemId];
  if (!event || !ticket) return null;

  const bought = (resaleFlags(row) & RESALE_BOUGHT) !== 0;
  const flags = bought ? ticket[4] | RESALE_BOUGHT : ticket[4] & ~RESALE_BOUGHT;
  if (flags === ticket[4]) return null;
  const updated: TicketTuple = [...ticket];
  updated[4] = flags;
  event.tickets[salesItemId] = updated;
  return event.eventId;
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
  for (const [salesItemId, [manifestId, area, row, seat, resale, owner]] of Object.entries(event.tickets)) {
    // De stoel uit de stoelenkaart is leidend; de velden op het ticket zelf
    // zijn de terugval als die stoel (nog) niet bekend is.
    const fromManifest = manifestId ? event.seats[manifestId] : undefined;
    const key = fromManifest
      ? seatKey(fromManifest[0], fromManifest[1], fromManifest[2])
      : seatKey(area, row, seat);
    if (!key) continue;
    tickets.push({
      key,
      resalePosted: (resale & RESALE_POSTED) !== 0,
      resaleBought: (resale & RESALE_BOUGHT) !== 0,
      owner: owner || null,
      salesItemId,
    });
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
