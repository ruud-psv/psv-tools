/**
 * De verkoop per dag van één wedstrijd, uitgesplitst naar soort ticket.
 *
 * Puur rekenwerk, zodat het te testen is: hoe één regel uit `/v1/sales` wordt
 * ingedeeld, en hoe de opgeslagen tellingen per kalenderdag worden omgezet naar
 * "dagen tot de wedstrijd".
 *
 * De indeling is vastgesteld op de echte data (probe, 10 november 2026):
 *
 * | Reeks | Regel |
 * |---|---|
 * | `resale` | `is_venue_resale = true`: het ticket van de koper uit de resale |
 * | `vrijkaart` | `price_type_group = 'Vrijkaarten'`, of `price_type` begint met `Vrijkaart` |
 * | `seizoenkaart` | `subscription_instance_id` gevuld: het ticket hoort bij een seizoenkaart of andere reeks |
 * | `vrij` | de rest: losse verkoop |
 *
 * De eerste regel die past, wint. Een doorverkocht ticket telt alleen bij
 * `resale`: de kaart van de verkoper is dan vervallen (`current_status = false`)
 * en valt dus af. Of die kaart zijn oorspronkelijke verkoopdatum houdt, meet de
 * ingest (`ResaleProbe`); tot dat duidelijk is tellen we hem niet apart mee.
 *
 * We bewaren per **kalenderdag** (Nederlandse tijd) en niet per dag-tot-de-
 * wedstrijd: wordt een wedstrijd verplaatst, dan kloppen de tellingen nog en
 * verschuift alleen de as.
 */

import { isPsvHomeMatch } from "../aangrenzende-stoelen/events";
import { normalizeArea } from "../aangrenzende-stoelen/neighbors";
import { STADIUM_AREAS } from "../aangrenzende-stoelen/stadium";
import { isHerdgangMatch } from "../ticketing-herdgang/events";
import { HERDGANG_AREAS, mapArea } from "../ticketing-herdgang/herdgang";
import { isSoldTicket } from "./sales";

export const SALES_CATEGORIES = ["vrij", "resale", "seizoenkaart", "vrijkaart"] as const;
export type SalesCategory = (typeof SALES_CATEGORIES)[number];

/** `YYYY-MM-DD` → aantal. */
export type DayCounts = Record<string, number>;
/** `dagen tot de wedstrijd` (als tekst) → aantal. */
export type OffsetCounts = Record<string, number>;

export type CategoryDays = Partial<Record<SalesCategory, DayCounts>>;

/** Eén wedstrijd zoals hij wordt opgeslagen. */
export interface StoredEvent {
  productId: string;
  name: string;
  eventDate: string;
  productType: string;
  category: string;
  season: string;
  /** Tickets in de tribunevakken van de plattegrond. */
  stand: CategoryDays;
  /** Parkeren en alles wat verder niet op de plattegrond staat. */
  other: CategoryDays;
  /**
   * De opbrengst van dezelfde tickets, in **centen**, met dezelfde indeling als
   * `stand` en `other`; zie `ticketPriceCents()`. Ontbreekt in bestanden van
   * vóór de recette, tot een nieuwe doorloop ze vult.
   */
  standCents?: CategoryDays;
  otherCents?: CategoryDays;
  /**
   * Alleen bij thuiswedstrijden van PSV 1: per vak hoe vaak elke lijstprijs
   * (`list_price`, in centen) voorkwam bij tickets met prijssoort `Normaal`.
   * De meest voorkomende is de prijs van dat vak in de vrije verkoop, en
   * daarmee ook de prijs in de resale (die is altijd gelijk aan de vrije
   * verkoop van het vak). Zie `areaPrices()`.
   */
  listPrices?: Record<string, Record<string, number>>;
}

/** De velden uit `/v1/sales` die de indeling nodig heeft. Geen persoonsgegevens. */
export interface SalesSeriesRow {
  _ringside_operation?: unknown;
  sales_item_id?: unknown;
  product_id?: unknown;
  product_item_id?: unknown;
  primary_ticket_id?: unknown;
  previous_ticket_id?: unknown;
  transaction_date?: unknown;
  item_type?: unknown;
  sale_type?: unknown;
  current_status?: unknown;
  forward_item_id?: unknown;
  is_venue_resale?: unknown;
  resale_status?: unknown;
  subscription_instance_id?: unknown;
  price_type?: unknown;
  price_type_group?: unknown;
  area?: unknown;
  price_after_discount?: unknown;
  total_price?: unknown;
  list_price?: unknown;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isTrue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return typeof value === "string" && value.toLowerCase() === "true";
}

/** In welke reeks een verkocht ticket valt. */
export function categoryOf(row: SalesSeriesRow): SalesCategory {
  if (isTrue(row.is_venue_resale)) return "resale";
  if (text(row.price_type_group).toLowerCase() === "vrijkaarten") return "vrijkaart";
  if (text(row.price_type).toLowerCase().startsWith("vrijkaart")) return "vrijkaart";
  if (text(row.subscription_instance_id)) return "seizoenkaart";
  return "vrij";
}

/* ---------- Prijs ---------- */

/**
 * Wat de koper voor dit ticket betaalde, in centen, inclusief btw.
 *
 * Vastgesteld op de echte data (probe, 24 november 2026):
 *
 * - `price_after_discount` is de prijs na korting: bij een losse kaart gelijk
 *   aan `list_price`, bij een wedstrijdkaart uit een seizoenkaart 0 (met
 *   `total_discount` gelijk aan de lijstprijs), bij een resale-aankoop de prijs
 *   die de koper betaalde.
 * - `total_price` (type `money`, tekst als `€ 19,12`) is hetzelfde bedrag, maar
 *   soms leeg. Alleen de terugval.
 * - `total_payment` is níet bruikbaar: die staat ook op 0 bij verkochte
 *   tickets (de betaling hoort bij de transactie).
 * - Btw en servicekosten staan in deze dataset altijd op 0; de prijzen zijn dus
 *   consumentenprijzen inclusief btw, net als het target.
 */
export function ticketPriceCents(row: Pick<SalesSeriesRow, "price_after_discount" | "total_price">): number {
  const numeric = toAmount(row.price_after_discount);
  if (numeric !== null) return Math.round(numeric * 100);
  const money = parseMoney(row.total_price);
  return money === null ? 0 : Math.round(money * 100);
}

function toAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(value)) return Number(value);
  return null;
}

/** `€ 1.234,50` → 1234.5. */
export function parseMoney(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^\d,.-]/g, "");
  if (!/\d/.test(cleaned)) return null;
  // Nederlandse notatie: punt voor duizendtallen, komma voor decimalen.
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

/**
 * Per vak de prijs in de vrije verkoop, in centen: de lijstprijs die bij
 * `Normaal`-tickets het vaakst voorkwam. Ook een wedstrijdkaart uit een
 * seizoenkaart heeft die lijstprijs (met de korting apart), dus elk verkocht
 * vak heeft er een.
 */
export function areaPrices(event: Pick<StoredEvent, "listPrices">): Record<string, number> {
  const prices: Record<string, number> = {};
  for (const [area, counts] of Object.entries(event.listPrices ?? {})) {
    let best = -1;
    let bestCount = 0;
    for (const [cents, count] of Object.entries(counts)) {
      const value = Number(cents);
      if (count > bestCount || (count === bestCount && value > best)) {
        best = value;
        bestCount = count;
      }
    }
    if (best > 0) prices[area] = best;
  }
  return prices;
}

/* ---------- Tribune of niet ---------- */

const STADIUM_STANDS = new Set(STADIUM_AREAS.map((shape) => normalizeArea(shape.area)));
const HERDGANG_STANDS = new Set(HERDGANG_AREAS.map((shape) => mapArea(shape.area)));

/**
 * Of een ticket in een tribunevak zit. Parkeerkaarten staan in Ringside ook
 * als ticket op de wedstrijd en maakten de verkoopcijfers te hoog.
 *
 * Alleen voor wedstrijden waarvan we de plattegrond kennen (PSV 1 thuis in het
 * Philips Stadion, Jong PSV en PSV Vrouwen op De Herdgang). Bij al het andere
 * telt elk vak mee. Speelt zo'n wedstrijd toch elders, dan past geen enkel vak
 * en valt alles in `other`; `toEventSales()` gebruikt dat dan als de verkoop.
 */
export function isStandTicket(eventName: string, area: unknown): boolean {
  const raw = text(area);
  if (isPsvHomeMatch(eventName)) return STADIUM_STANDS.has(normalizeArea(raw));
  if (isHerdgangMatch(eventName)) return HERDGANG_STANDS.has(mapArea(raw));
  return true;
}

/* ---------- Dagen ---------- */

const AMSTERDAM_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" });

/**
 * De Nederlandse kalenderdag van een `transaction_date`.
 *
 * Ringside levert dat veld als `timestamp` zonder tijdzone, in UTC. Een
 * verkoop om 23:30 Nederlandse tijd staat er dus als 21:30 of 22:30 en hoort
 * bij dezelfde dag, maar een verkoop om 00:30 staat op de dag ervoor.
 */
export function amsterdamDay(value: unknown): string | null {
  const raw = text(value);
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(raw);
  if (!match) return null;
  if (!match[2]) return match[1];
  const zone = match[3] ? (match[3] === "Z" ? "Z" : match[3].replace(/^([+-]\d{2})(\d{2})$/, "$1:$2")) : "Z";
  const instant = new Date(`${match[1]}T${match[2]}${zone}`);
  return isNaN(instant.getTime()) ? null : AMSTERDAM_DAY.format(instant);
}

function dayNumber(day: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!match) return null;
  return Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000);
}

/**
 * Tellingen per kalenderdag → per dagen-tot-de-wedstrijd. Positief is ervoor,
 * 0 is de wedstrijddag. `eventDate` is de aftrap in Nederlandse tijd; alleen
 * de dag telt.
 */
export function daysToOffsets(days: DayCounts | undefined, eventDate: string): OffsetCounts {
  const offsets: OffsetCounts = {};
  const eventDay = dayNumber(eventDate);
  if (!days || eventDay === null) return offsets;
  for (const [day, count] of Object.entries(days)) {
    const number = dayNumber(day);
    if (number === null || !count) continue;
    const key = String(eventDay - number);
    offsets[key] = (offsets[key] ?? 0) + count;
  }
  return offsets;
}

export function totalOf(counts: Record<string, number> | undefined): number {
  let total = 0;
  if (counts) for (const count of Object.values(counts)) total += count;
  return total;
}

/* ---------- Een pagina verwerken ---------- */

/** Wat een pagina opleverde, voor de voortgang. */
export interface PageResult {
  /** Regels die als (nieuw) verkocht ticket zijn geteld. */
  counted: number;
  /**
   * Tickets van een komende wedstrijd die opnieuw binnenkwamen (gewijzigd) en
   * waarvan de eerdere telling vervangen is in plaats van opgeteld.
   */
  replaced: number;
  /** Tickets van een komende wedstrijd die niet meer verkocht zijn (retour, doorverkocht, verwijderd) en eraf gingen. */
  removed: number;
  /** Verkochte tickets van een product dat (nog) niet in de productenlijst staat. */
  unknownProduct: number;
  earliest: string | null;
  latest: string | null;
}

/**
 * Wat één verkocht ticket bijdraagt aan de tellingen van zijn wedstrijd:
 * `[tribune (1) of niet (0), reeks, dag, centen, vak, lijstprijs in centen]`.
 * De laatste twee alleen als het ticket meetelt voor de vakprijs (`listPrices`).
 */
export type TicketContribution = [
  onStand: 0 | 1,
  category: number,
  day: string,
  cents: number,
  listArea?: string,
  listCents?: number,
];

/**
 * Per komende wedstrijd wat elk verkocht ticket bijdraagt, op een korte
 * sleutel van `sales_item_id` (`ticketKey()`).
 *
 * Ringside levert een regel opnieuw aan als hij wijzigt: een kaart die in de
 * resale gezet wordt, een retour, een doorverkoop. Optellen telde zo'n ticket
 * dan nog een keer en haalde een retour er niet af. Met dit register wint de
 * laatste versie: de oude bijdrage gaat eraf, de nieuwe erbij. Alleen voor
 * wedstrijden die nog niet gespeeld zijn; daarna verandert er niets meer en
 * valt het register voor die wedstrijd weg.
 */
export type TicketRegistry = Record<string, Record<string, TicketContribution>>;

function id(value: unknown): string {
  return text(value).toLowerCase();
}

/**
 * Korte, vaste sleutel van een `sales_item_id`: 12 hex-tekens (48 bits, uit
 * twee 32-bits FNV-1a-hashes). Puur JavaScript en geen `node:crypto`: dit
 * bestand komt via `recette.ts` ook in de browser terecht. Binnen één wedstrijd
 * (tienduizenden tickets) is de kans op twee gelijke sleutels verwaarloosbaar.
 */
export function ticketKey(salesItemId: string): string {
  const value = salesItemId.toLowerCase();
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x01000193) >>> 0;
    b = (b ^ (b >>> 15)) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + (b >>> 16).toString(16).padStart(4, "0");
}

/** Of de wedstrijd vandaag of later is: dan kan zijn verkoop nog veranderen. */
export function isUpcoming(event: Pick<StoredEvent, "eventDate">, today: string): boolean {
  return Boolean(event.eventDate) && event.eventDate.slice(0, 10) >= today;
}

/** Wat een verkoopregel bijdraagt, of `null` als hij geen verkocht ticket is. */
function contributionOf(event: StoredEvent, row: SalesSeriesRow): TicketContribution | null {
  if (!isSoldTicket(row)) return null;
  const day = amsterdamDay(row.transaction_date);
  if (!day) return null;
  const onStand = isStandTicket(event.name, row.area);
  const contribution: TicketContribution = [
    onStand ? 1 : 0,
    SALES_CATEGORIES.indexOf(categoryOf(row)),
    day,
    ticketPriceCents(row),
  ];
  if (event.listPrices && onStand && text(row.price_type).toLowerCase() === "normaal") {
    const list = parseMoney(row.list_price);
    const area = normalizeArea(text(row.area));
    if (list && list > 0 && area) contribution.push(area, Math.round(list * 100));
  }
  return contribution;
}

function bump(map: Record<string, number>, key: string, by: number): void {
  const next = (map[key] ?? 0) + by;
  if (next) map[key] = next;
  else delete map[key];
}

/** Telt een bijdrage op (`sign` 1) of haalt hem eraf (`sign` −1). */
function applyContribution(event: StoredEvent, contribution: TicketContribution, sign: 1 | -1): void {
  const [onStand, categoryIndex, day, cents, listArea, listCents] = contribution;
  const category = SALES_CATEGORIES[categoryIndex];
  if (!category) return;
  bump(((onStand ? event.stand : event.other)[category] ??= {}), day, sign);
  // Alleen bij wedstrijden die vanaf het begin van de doorloop bedragen
  // bijhouden; anders staat er een half bedrag dat compleet lijkt.
  const amounts = onStand ? event.standCents : event.otherCents;
  if (amounts && cents) bump((amounts[category] ??= {}), day, sign * cents);
  if (event.listPrices && listArea && listCents) bump((event.listPrices[listArea] ??= {}), String(listCents), sign);
}

/**
 * Telt de verkochte tickets van één pagina bij de wedstrijden.
 *
 * - **Met register** (`registry` en `today`), voor wedstrijden die nog komen:
 *   de laatste versie van een regel wint, zie `TicketRegistry`.
 * - **Anders** (gespeelde wedstrijden, of data van vóór het register): optellen.
 *   Een regel komt in de eerste vulling één keer langs; binnen een pagina
 *   ontdubbelen we nog op ticket en dag, zoals de definitie van SeatGeek
 *   (`COUNT(DISTINCT product_item_id)`).
 */
export function applySalesPage(
  events: Record<string, StoredEvent>,
  rows: readonly SalesSeriesRow[],
  options: { registry?: TicketRegistry; today?: string } = {}
): PageResult {
  const result: PageResult = { counted: 0, replaced: 0, removed: 0, unknownProduct: 0, earliest: null, latest: null };
  const seen = new Set<string>();
  const { registry, today } = options;

  const note = (row: SalesSeriesRow) => {
    const transaction = text(row.transaction_date);
    if (!transaction) return;
    if (!result.earliest || transaction < result.earliest) result.earliest = transaction;
    if (!result.latest || transaction > result.latest) result.latest = transaction;
  };

  for (const row of rows) {
    const productId = id(row.product_id);
    const salesItemId = id(row.sales_item_id);
    const isDelete = row._ringside_operation === "D";

    if (registry && today && salesItemId) {
      const key = ticketKey(salesItemId);
      // Een verwijderde regel heeft soms alleen zijn sleutel; dan zoeken.
      let eventId = productId && events[productId] ? productId : null;
      if (!eventId && isDelete) eventId = Object.keys(registry).find((candidate) => registry[candidate][key]) ?? null;
      const event = eventId ? events[eventId] : undefined;
      if (eventId && event && isUpcoming(event, today)) {
        const tickets = (registry[eventId] ??= {});
        const previous = tickets[key];
        const next = isDelete ? null : contributionOf(event, row);
        if (previous) applyContribution(event, previous, -1);
        if (next) {
          applyContribution(event, next, 1);
          tickets[key] = next;
          if (previous) result.replaced++;
          else result.counted++;
          note(row);
        } else if (previous) {
          delete tickets[key];
          result.removed++;
        }
        continue;
      }
    }

    if (isDelete || !isSoldTicket(row) || !productId) continue;
    const event = events[productId];
    if (!event) {
      result.unknownProduct++;
      continue;
    }
    const contribution = contributionOf(event, row);
    if (!contribution) continue;

    const itemId = id(row.product_item_id);
    if (itemId) {
      const dedupe = `${productId}|${contribution[2]}|${itemId}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
    }
    applyContribution(event, contribution, 1);
    note(row);
    result.counted++;
  }

  return result;
}

/** Haalt wedstrijden uit het register die gespeeld zijn of niet meer bestaan. */
export function pruneRegistry(registry: TicketRegistry, events: Record<string, StoredEvent>, today: string): void {
  for (const eventId of Object.keys(registry)) {
    const event = events[eventId];
    if (!event || !isUpcoming(event, today)) delete registry[eventId];
  }
}

/* ---------- Wat de pagina's lezen ---------- */

/** Eén wedstrijd zoals de pagina's hem lezen. */
export interface EventSales {
  productId: string;
  name: string;
  eventDate: string;
  productType: string;
  category: string;
  season: string;
  /** Verkochte tickets in de tribunevakken, per dagen-tot-de-wedstrijd; zie `exclude` bij `toEventSales()`. */
  perOffset: OffsetCounts;
  total: number;
  /** Alle tickets, uitgesplitst. Zonder `exclude` tellen de vier reeksen op tot `perOffset`. */
  series: Record<SalesCategory, OffsetCounts>;
  /** Parkeren en overige vakken; niet in `perOffset`. */
  otherTotal: number;
  /**
   * De opbrengst in centen per reeks, per dagen-tot-de-wedstrijd, uit dezelfde
   * vakken als `series`. `null` als de opgeslagen data nog geen bedragen heeft.
   */
  revenueCents: Record<SalesCategory, OffsetCounts> | null;
  /** Prijs per vak in de vrije verkoop (en resale), in centen; zie `areaPrices()`. Leeg zonder bedragen. */
  areaPriceCents: Record<string, number>;
}

function sumCategories(bucket: CategoryDays): number {
  let total = 0;
  for (const category of SALES_CATEGORIES) total += totalOf(bucket[category]);
  return total;
}

/**
 * `exclude` laat reeksen weg uit `perOffset` en `total`. De pagina's van
 * Ticketing Stadion laten zo de seizoenkaarten en vrijkaarten weg: die zijn
 * geen verkoop voor deze wedstrijd. Seizoenkaarten staan bovendien als één
 * grote piek op de dag dat ze zijn aangemaakt.
 * `series` blijft compleet.
 */
export function toEventSales(event: StoredEvent, exclude: readonly SalesCategory[] = []): EventSales {
  // Past geen enkel vak op de plattegrond (een wedstrijd elders), dan telt alles.
  const standTotal = sumCategories(event.stand);
  const bucket = standTotal > 0 ? event.stand : event.other;

  const series = {} as Record<SalesCategory, OffsetCounts>;
  const amounts = standTotal > 0 ? event.standCents : event.otherCents;
  const hasAmounts = event.standCents !== undefined || event.otherCents !== undefined;
  const revenueCents = hasAmounts ? ({} as Record<SalesCategory, OffsetCounts>) : null;
  const perOffset: OffsetCounts = {};
  for (const category of SALES_CATEGORIES) {
    series[category] = daysToOffsets(bucket[category], event.eventDate);
    if (revenueCents) revenueCents[category] = daysToOffsets(amounts?.[category], event.eventDate);
    if (exclude.includes(category)) continue;
    for (const [offset, count] of Object.entries(series[category])) {
      perOffset[offset] = (perOffset[offset] ?? 0) + count;
    }
  }

  return {
    productId: event.productId,
    name: event.name,
    eventDate: event.eventDate,
    productType: event.productType,
    category: event.category,
    season: event.season,
    perOffset,
    total: totalOf(perOffset),
    series,
    otherTotal: standTotal > 0 ? sumCategories(event.other) : 0,
    revenueCents,
    areaPriceCents: areaPrices(event),
  };
}

/* ---------- Metingen tijdens de eerste vulling ---------- */

/**
 * Meet of de kaart van een verkoper na doorverkoop zijn oorspronkelijke
 * verkoopdatum houdt.
 *
 * De regel van de koper wijst met `previous_ticket_id` naar het ticket van de
 * verkoper. Welk id van de verkoper dat is, staat nergens; we proberen ze alle
 * drie. Om niet miljoenen ids te bewaren nemen we een steekproef: alleen ids
 * die op `00` eindigen (1 op de 256), met een bovengrens.
 */
export interface ResaleProbe {
  /** `id` → dag van de vervallen `Sale`-regel van de verkoper. */
  sellers: Record<string, string>;
  /** `previous_ticket_id` → dag van de aankoop via de resale. */
  buyers: Record<string, string>;
}

export const EMPTY_RESALE_PROBE: ResaleProbe = { sellers: {}, buyers: {} };

const PROBE_LIMIT = 2_000;

function sampled(value: string): boolean {
  return value.endsWith("00");
}

export function probeResale(probe: ResaleProbe, rows: readonly SalesSeriesRow[]): void {
  for (const row of rows) {
    if (row.item_type !== "Ticket" || row.sale_type !== "Sale") continue;
    const day = amsterdamDay(row.transaction_date);
    if (!day) continue;

    if (isTrue(row.is_venue_resale)) {
      const previous = id(row.previous_ticket_id);
      if (previous && sampled(previous) && Object.keys(probe.buyers).length < PROBE_LIMIT) probe.buyers[previous] = day;
    } else if (row.resale_status === "Resold - Refunded") {
      for (const field of ["sales_item_id", "product_item_id", "primary_ticket_id"] as const) {
        const value = id(row[field]);
        if (value && sampled(value) && Object.keys(probe.sellers).length < PROBE_LIMIT) {
          probe.sellers[`${field}:${value}`] = day;
        }
      }
    }
  }
}

export interface ResaleProbeSummary {
  buyers: number;
  /** Per id-veld van de verkoper: hoeveel kopers eraan te koppelen waren. */
  matched: Record<string, { pairs: number; sellerEarlier: number; sameDay: number; sellerLater: number }>;
}

export function summarizeResaleProbe(probe: ResaleProbe): ResaleProbeSummary {
  const matched: ResaleProbeSummary["matched"] = {};
  for (const [key, sellerDay] of Object.entries(probe.sellers)) {
    const split = key.indexOf(":");
    const field = key.slice(0, split);
    const buyerDay = probe.buyers[key.slice(split + 1)];
    if (!buyerDay) continue;
    const entry = (matched[field] ??= { pairs: 0, sellerEarlier: 0, sameDay: 0, sellerLater: 0 });
    entry.pairs++;
    if (sellerDay < buyerDay) entry.sellerEarlier++;
    else if (sellerDay === buyerDay) entry.sameDay++;
    else entry.sellerLater++;
  }
  return { buyers: Object.keys(probe.buyers).length, matched };
}
