/**
 * Het effect van een mail over aangrenzende stoelen.
 *
 * Kaartverkoop mailt seizoenkaarthouders die naast een vrije stoel zitten. Hier
 * staat hoe je achteraf ziet wat daarvan terechtkwam: per relatienummer welke
 * buurstoelen op het moment van de mail vrij waren, of die daarna verkocht
 * zijn, en of de houder hem zelf kocht of iemand anders. Puur rekenwerk, zodat
 * de regels te testen zijn; de data komt uit `./effect-data.ts`.
 *
 * - **Buurstoel**: links of rechts (stoelnummer ±1) en voor of achter
 *   (rijnummer ±1, zelfde stoelnummer), in hetzelfde vak. Dezelfde regel als de
 *   lijst zelf (`./neighbors.ts`). Uitgesloten vakken doen niet mee.
 * - **Bezet op een moment**: een ticket dat nu nog geldig is en vóór dat moment
 *   gekocht is; of een vervallen ticket van vóór dat moment zonder retour of
 *   annulering op die stoel tussen die aankoop en dat moment.
 * - **Vrij bij de mail**: niet bezet op het moment van de mail, en volgens de
 *   stoelenkaart niet geblokkeerd. Of: bezet door een kaart die daarna via de
 *   resale is doorverkocht ("in de resale"). Wanneer die kaart werd aangeboden,
 *   staat niet in Ringside; hij kan ook pas na de mail aangeboden zijn.
 * - **Verkocht na de mail**: er staat nu een geldig ticket op dat op of na het
 *   moment van de mail gekocht is, ook een openstaande reservering.
 * - **Zelf of iemand anders**: de koper is "zelf" als zijn eigenaar (de hash van
 *   de klant in Ringside) dezelfde is als die van de seizoenkaart van de houder
 *   voor deze wedstrijd. Koopt iemand met een ander account, dan telt het als
 *   iemand anders.
 * - **Extra kaarten zelf**: alle tickets voor deze wedstrijd die de houder na de
 *   mail zelf kocht, ergens in het stadion, buiten zijn eigen stoelen.
 *
 * Ter vergelijking telt het ook alle andere vrije stoelen in het stadion: welk
 * deel daarvan na de mail verkocht is, zonder dat iemand ernaast een mail kreeg.
 */

import { isExcludedArea, normalizeArea, seatKey, type Holder, type SeatInfo, type SeatRef } from "./neighbors";
import { STADIUM_AREAS } from "./stadium";
import {
  TICKET_CURRENT,
  TICKET_RESERVATION,
  TICKET_RESOLD,
  TICKET_SEASON,
  TICKET_VENUE_RESALE,
  type EffectTicket,
} from "./effect-data";
import { formatAmsterdamDateTime } from "./effect-input";

/** Hoe ver vóór de mail een verkoop nog "net verkocht" heet. */
export const SHORTLY_BEFORE_SECONDS = 24 * 60 * 60;

/** Waar de buurstoel ligt ten opzichte van de eigen stoel. Rij 1 ligt aan het veld. */
export type Direction = "naast" | "voor" | "achter";

/**
 * Hoe de buurstoel er bij de mail bij lag. `net verkocht` telt niet als vrije
 * buurstoel: hij was al verkocht, in de 24 uur vóór de mail. Dat verklaart
 * waarom iemand op de lijst stond terwijl er bij de mail niets meer vrij was.
 */
export type AtMail = "vrij" | "resale" | "net verkocht";

export type Buyer = "zelf" | "ander" | "onbekend";

export interface EffectNeighbor extends SeatRef {
  direction: Direction;
  /** De eigen stoel waar hij naast, voor of achter ligt. */
  from: SeatRef;
  atMail: AtMail;
  /** Wanneer hij gekocht is, in seconden sinds 1970; `null` als hij niet verkocht is. */
  soldAt: number | null;
  buyer: Buyer | null;
  viaResale: boolean;
  reservation: boolean;
}

export const OUTCOMES = [
  "zelf gekocht",
  "zelf gekocht, andere stoel",
  "door ander gekocht",
  "verkocht, koper onbekend",
  "niet verkocht",
  "geen vrije buurstoel",
  "niet in de lijst",
] as const;

export type Outcome = (typeof OUTCOMES)[number];

export interface EffectRelation {
  relationNumber: string;
  outcome: Outcome;
  /** De eigen stoelen volgens de lijst seizoenkaarthouders. */
  seats: SeatRef[];
  /** Vrije buurstoelen bij de mail, en buurstoelen die net daarvoor verkocht waren. */
  neighbors: EffectNeighbor[];
  /** Tickets voor deze wedstrijd die de houder na de mail zelf kocht, buiten zijn eigen stoelen. */
  extraTickets: number;
  /** Of de eigenaar van de eigen stoelen in Ringside bekend is. Zonder kan "zelf" niet worden vastgesteld. */
  ownerKnown: boolean;
}

export interface EffectTotals {
  relations: number;
  byOutcome: Record<Outcome, number>;
  /** Unieke vrije buurstoelen bij de mail; een stoel tussen twee houders telt één keer. */
  freeNeighborSeats: number;
  /** Waarvan bezet door een kaart die later via de resale is doorverkocht. */
  freeNeighborFromResale: number;
  soldNeighborSeats: number;
  /** Gekocht door een gemailde houder die ernaast zit. */
  soldNeighborSeatsSelf: number;
  soldNeighborSeatsWithin24h: number;
  /** Alle andere vrije stoelen in het stadion bij de mail, ter vergelijking. */
  otherFreeSeats: number;
  otherSoldSeats: number;
  /** Alle kaarten die de gemailde houders na de mail zelf kochten. */
  extraTicketsSelf: number;
}

export interface EffectDiagnostics {
  tickets: number;
  /** Retouren en annuleringen zonder stoel: daar kan een stoel ten onrechte bezet lijken. */
  endsWithoutSeat: number;
  seatMapSeats: number;
}

export interface EffectResult {
  mailAt: number;
  relations: EffectRelation[];
  totals: EffectTotals;
  diagnostics: EffectDiagnostics;
}

export interface EffectInput {
  tickets: Iterable<EffectTicket>;
  /** De stoelenkaart: welke stoelen er zijn en of ze geblokkeerd zijn. */
  seats: Iterable<SeatInfo>;
  holders: readonly Holder[];
  relationNumbers: readonly string[];
  /** Het moment van de mail, in seconden sinds 1970. */
  mailAt: number;
}

interface SeatEvent {
  at: number;
  flags: number;
  owner: string;
  saleType: string;
}

/** `sale_type` die een stoel in gebruik neemt. */
const START_TYPES = new Set(["Sale", "Reservation", "Reservation Confirmation", "Update - New"]);

/** `Return`, `Reservation Cancellation`, `Confirmed Reservation Return` en wat er verder zo heet. */
function isEnd(saleType: string): boolean {
  return /return|cancel/i.test(saleType);
}

function isCurrent(event: SeatEvent): boolean {
  return (event.flags & TICKET_CURRENT) !== 0;
}

/** Of de stoel op moment `t` bezet was; zie de regels bovenaan. */
export function occupiedAt(events: readonly SeatEvent[], t: number): boolean {
  let lastStart: number | null = null;
  let lastEnd: number | null = null;
  for (const event of events) {
    if (event.at >= t) continue;
    if (isCurrent(event)) return true;
    if (START_TYPES.has(event.saleType)) lastStart = Math.max(lastStart ?? event.at, event.at);
    else if (isEnd(event.saleType)) lastEnd = Math.max(lastEnd ?? event.at, event.at);
  }
  return lastStart !== null && (lastEnd === null || lastStart >= lastEnd);
}

/** Het eerste geldige ticket dat op of na `t` gekocht is. */
function firstCurrentFrom(events: readonly SeatEvent[], t: number): SeatEvent | null {
  let found: SeatEvent | null = null;
  for (const event of events) {
    if (isCurrent(event) && event.at >= t && (!found || event.at < found.at)) found = event;
  }
  return found;
}

/** Het geldige ticket dat in de 24 uur vóór `t` gekocht is, als dat er is. */
function currentShortlyBefore(events: readonly SeatEvent[], t: number): SeatEvent | null {
  for (const event of events) {
    if (isCurrent(event) && event.at < t && event.at >= t - SHORTLY_BEFORE_SECONDS) return event;
  }
  return null;
}

/**
 * Of een stoel bij de mail vrij was: `vrij`, `resale`, of `null` (bezet of
 * geblokkeerd). `sellable` komt uit de stoelenkaart.
 */
export function freeAtMail(events: readonly SeatEvent[], sellable: boolean, mailAt: number): "vrij" | "resale" | null {
  const buyer = firstCurrentFrom(events, mailAt);
  if (!occupiedAt(events, mailAt)) return sellable || buyer ? "vrij" : null;
  const resoldBefore = events.some((event) => event.flags & TICKET_RESOLD && event.at < mailAt);
  if (buyer && buyer.flags & TICKET_VENUE_RESALE && resoldBefore) return "resale";
  return null;
}

const STAND_AREAS = new Set(STADIUM_AREAS.map((shape) => normalizeArea(shape.area)));

/** Een tribunevak dat meedoet: op de plattegrond en niet uitgesloten. Parkeren valt zo af. */
function isCountedArea(area: string): boolean {
  return STAND_AREAS.has(area) && !isExcludedArea(area);
}

function neighborsOf(seat: SeatRef): { ref: SeatRef; direction: Direction }[] {
  const area = normalizeArea(seat.area);
  const list: { ref: SeatRef; direction: Direction }[] = [];
  if (seat.seat > 0) list.push({ ref: { area, row: seat.row, seat: seat.seat - 1 }, direction: "naast" });
  list.push({ ref: { area, row: seat.row, seat: seat.seat + 1 }, direction: "naast" });
  if (seat.row > 0) list.push({ ref: { area, row: seat.row - 1, seat: seat.seat }, direction: "voor" });
  list.push({ ref: { area, row: seat.row + 1, seat: seat.seat }, direction: "achter" });
  return list;
}

function keyOf(seat: SeatRef): string {
  return `${normalizeArea(seat.area)}|${seat.row}|${seat.seat}`;
}

function refOf(key: string): SeatRef {
  const [area, row, seat] = key.split("|");
  return { area, row: Number(row), seat: Number(seat) };
}

function compareSeats(a: SeatRef, b: SeatRef): number {
  return a.area.localeCompare(b.area) || a.row - b.row || a.seat - b.seat;
}

/**
 * De eigenaren van de eigen stoelen bij de mail: van de seizoenkaart als die er
 * is, anders van elk ticket dat vóór de mail op die stoelen stond (niet via de
 * resale gekocht, want dan is het een koper).
 */
function ownersOf(keys: readonly string[], eventsByKey: Map<string, SeatEvent[]>, mailAt: number): Set<string> {
  const season = new Set<string>();
  const other = new Set<string>();
  for (const key of keys) {
    for (const event of eventsByKey.get(key) ?? []) {
      if (!event.owner || event.at >= mailAt || !START_TYPES.has(event.saleType)) continue;
      if (event.flags & TICKET_VENUE_RESALE) continue;
      (event.flags & TICKET_SEASON ? season : other).add(event.owner);
    }
  }
  return season.size ? season : other;
}

function emptyOutcomes(): Record<Outcome, number> {
  return Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0])) as Record<Outcome, number>;
}

export function analyzeMailEffect({ tickets, seats, holders, relationNumbers, mailAt }: EffectInput): EffectResult {
  const diagnostics: EffectDiagnostics = { tickets: 0, endsWithoutSeat: 0, seatMapSeats: 0 };

  const eventsByKey = new Map<string, SeatEvent[]>();
  /** Geldige tickets van na de mail, per eigenaar: voor de extra kaarten. */
  const boughtAfterByOwner = new Map<string, { key: string; event: SeatEvent }[]>();
  for (const [area, row, seat, at, flags, owner, saleType] of tickets) {
    diagnostics.tickets++;
    const key = seatKey(area, row, seat);
    if (!key) {
      if (isEnd(saleType)) diagnostics.endsWithoutSeat++;
      continue;
    }
    const event: SeatEvent = { at, flags, owner, saleType };
    const list = eventsByKey.get(key);
    if (list) list.push(event);
    else eventsByKey.set(key, [event]);
    if (owner && flags & TICKET_CURRENT && at >= mailAt && !(flags & TICKET_SEASON)) {
      const bought = boughtAfterByOwner.get(owner);
      if (bought) bought.push({ key, event });
      else boughtAfterByOwner.set(owner, [{ key, event }]);
    }
  }

  const sellableByKey = new Map<string, boolean>();
  for (const seat of seats) {
    const key = seatKey(seat.area, seat.row, seat.seat);
    if (!key) continue;
    sellableByKey.set(key, seat.sellable);
    diagnostics.seatMapSeats++;
  }

  const holdersByRelation = new Map<string, Holder[]>();
  for (const holder of holders) {
    const list = holdersByRelation.get(holder.relationNumber);
    if (list) list.push(holder);
    else holdersByRelation.set(holder.relationNumber, [holder]);
  }

  /** Per vrije buurstoel: of hij verkocht is, en of een gemailde houder hem zelf kocht. */
  const neighborSeats = new Map<string, { resale: boolean; soldAt: number | null; self: boolean }>();
  const relations: EffectRelation[] = [];
  let extraTicketsSelf = 0;

  for (const relationNumber of relationNumbers) {
    const own = (holdersByRelation.get(relationNumber) ?? [])
      .map((holder): SeatRef => ({ area: normalizeArea(holder.area), row: holder.row, seat: holder.seat }))
      .sort(compareSeats);
    if (own.length === 0) {
      relations.push({ relationNumber, outcome: "niet in de lijst", seats: [], neighbors: [], extraTickets: 0, ownerKnown: false });
      continue;
    }

    const ownKeys = own.map(keyOf);
    const ownKeySet = new Set(ownKeys);
    const owners = ownersOf(ownKeys, eventsByKey, mailAt);
    const buyerOf = (event: SeatEvent): Buyer =>
      owners.size === 0 ? "onbekend" : event.owner && owners.has(event.owner) ? "zelf" : "ander";

    const neighbors: EffectNeighbor[] = [];
    const seen = new Set<string>();
    for (const from of own) {
      for (const { ref, direction } of neighborsOf(from)) {
        const key = keyOf(ref);
        if (seen.has(key) || ownKeySet.has(key) || !isCountedArea(ref.area)) continue;
        seen.add(key);
        const events = eventsByKey.get(key) ?? [];
        const sellable = sellableByKey.get(key);
        // Niet in de stoelenkaart en nooit een ticket: die stoel bestaat niet.
        if (sellable === undefined && events.length === 0) continue;

        const free = freeAtMail(events, sellable ?? true, mailAt);
        if (free) {
          const buyer = firstCurrentFrom(events, mailAt);
          neighbors.push({
            ...ref,
            direction,
            from,
            atMail: free,
            soldAt: buyer?.at ?? null,
            buyer: buyer ? buyerOf(buyer) : null,
            viaResale: Boolean(buyer && buyer.flags & TICKET_VENUE_RESALE),
            reservation: Boolean(buyer && buyer.flags & TICKET_RESERVATION),
          });
          const seat = neighborSeats.get(key) ?? { resale: free === "resale", soldAt: buyer?.at ?? null, self: false };
          if (buyer && buyerOf(buyer) === "zelf") seat.self = true;
          neighborSeats.set(key, seat);
          continue;
        }

        const before = currentShortlyBefore(events, mailAt);
        if (before) {
          neighbors.push({
            ...ref,
            direction,
            from,
            atMail: "net verkocht",
            soldAt: before.at,
            buyer: buyerOf(before),
            viaResale: Boolean(before.flags & TICKET_VENUE_RESALE),
            reservation: Boolean(before.flags & TICKET_RESERVATION),
          });
        }
      }
    }
    neighbors.sort((a, b) => compareSeats(a, b));

    let extraTickets = 0;
    for (const owner of owners) {
      for (const { key } of boughtAfterByOwner.get(owner) ?? []) {
        if (!ownKeySet.has(key) && isCountedArea(key.split("|")[0])) extraTickets++;
      }
    }
    extraTicketsSelf += extraTickets;

    const free = neighbors.filter((neighbor) => neighbor.atMail !== "net verkocht");
    const sold = free.filter((neighbor) => neighbor.soldAt !== null);
    let outcome: Outcome;
    if (sold.some((neighbor) => neighbor.buyer === "zelf")) outcome = "zelf gekocht";
    else if (extraTickets > 0) outcome = "zelf gekocht, andere stoel";
    else if (sold.some((neighbor) => neighbor.buyer === "ander")) outcome = "door ander gekocht";
    else if (sold.length > 0) outcome = "verkocht, koper onbekend";
    else if (free.length > 0) outcome = "niet verkocht";
    else outcome = "geen vrije buurstoel";

    relations.push({ relationNumber, outcome, seats: own, neighbors, extraTickets, ownerKnown: owners.size > 0 });
  }

  // Ter vergelijking: alle andere vrije stoelen in het stadion bij de mail.
  let otherFreeSeats = 0;
  let otherSoldSeats = 0;
  for (const key of new Set([...sellableByKey.keys(), ...eventsByKey.keys()])) {
    if (neighborSeats.has(key) || !isCountedArea(refOf(key).area)) continue;
    const events = eventsByKey.get(key) ?? [];
    if (!freeAtMail(events, sellableByKey.get(key) ?? true, mailAt)) continue;
    otherFreeSeats++;
    if (firstCurrentFrom(events, mailAt)) otherSoldSeats++;
  }

  const byOutcome = emptyOutcomes();
  for (const relation of relations) byOutcome[relation.outcome]++;

  const seatsList = [...neighborSeats.values()];
  const soldSeats = seatsList.filter((seat) => seat.soldAt !== null);
  return {
    mailAt,
    relations,
    totals: {
      relations: relations.length,
      byOutcome,
      freeNeighborSeats: seatsList.length,
      freeNeighborFromResale: seatsList.filter((seat) => seat.resale).length,
      soldNeighborSeats: soldSeats.length,
      soldNeighborSeatsSelf: soldSeats.filter((seat) => seat.self).length,
      soldNeighborSeatsWithin24h: soldSeats.filter((seat) => (seat.soldAt as number) - mailAt < 24 * 60 * 60).length,
      otherFreeSeats,
      otherSoldSeats,
      extraTicketsSelf,
    },
    diagnostics,
  };
}

/* ---------- Invoer ---------- */

export { parseRelationNumbers, parseAmsterdamDateTime, formatAmsterdamDateTime } from "./effect-input";

/* ---------- Export ---------- */

const AT_MAIL_LABELS: Record<AtMail, string> = {
  vrij: "vrij",
  resale: "in de resale",
  "net verkocht": "al verkocht (24 uur ervoor)",
};

const BUYER_LABELS: Record<Buyer, string> = {
  zelf: "houder zelf",
  ander: "iemand anders",
  onbekend: "onbekend",
};

/**
 * CSV voor Excel: één regel per buurstoel, en één regel voor een relatienummer
 * zonder vrije buurstoel. Puntkomma, BOM en `\r\n`, net als de lijst zelf.
 */
export function toEffectCsv(relations: readonly EffectRelation[]): string {
  const header = [
    "relatienummer",
    "uitkomst",
    "vak",
    "rij",
    "stoel",
    "buurstoel rij",
    "buurstoel stoel",
    "positie",
    "bij de mail",
    "verkocht na de mail",
    "gekocht op",
    "koper",
    "via resale",
    "reservering",
    "extra kaarten zelf",
  ];
  const lines: string[] = [];
  for (const relation of relations) {
    const base = [relation.relationNumber, relation.outcome];
    const extra = String(relation.extraTickets);
    if (relation.neighbors.length === 0) {
      lines.push(
        [
          ...base,
          [...new Set(relation.seats.map((seat) => seat.area))].join(", "),
          relation.seats.map((seat) => seat.row).join(", "),
          relation.seats.map((seat) => seat.seat).join(", "),
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          extra,
        ].join(";")
      );
      continue;
    }
    for (const neighbor of relation.neighbors) {
      const after = neighbor.atMail !== "net verkocht";
      lines.push(
        [
          ...base,
          neighbor.from.area,
          neighbor.from.row,
          neighbor.from.seat,
          neighbor.row,
          neighbor.seat,
          neighbor.direction,
          AT_MAIL_LABELS[neighbor.atMail],
          after ? (neighbor.soldAt !== null ? "ja" : "nee") : "",
          neighbor.soldAt !== null ? formatAmsterdamDateTime(neighbor.soldAt) : "",
          neighbor.buyer ? BUYER_LABELS[neighbor.buyer] : "",
          neighbor.soldAt !== null ? (neighbor.viaResale ? "ja" : "nee") : "",
          neighbor.soldAt !== null ? (neighbor.reservation ? "ja" : "nee") : "",
          extra,
        ].join(";")
      );
    }
  }
  return `﻿${[header.join(";"), ...lines].join("\r\n")}\r\n`;
}
