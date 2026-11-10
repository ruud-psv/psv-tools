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
}

/** De velden uit `/v1/sales` die de indeling nodig heeft. Geen persoonsgegevens. */
export interface SalesSeriesRow {
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
  /** Regels die als verkocht ticket zijn geteld. */
  counted: number;
  /** Verkochte tickets van een product dat (nog) niet in de productenlijst staat. */
  unknownProduct: number;
  earliest: string | null;
  latest: string | null;
}

function id(value: unknown): string {
  return text(value).toLowerCase();
}

/**
 * Telt de verkochte tickets van één pagina op bij de wedstrijden.
 *
 * Optellen: een regel komt in de eerste vulling één keer langs (de stroom is
 * dan gesorteerd op `sales_item_id`; de ingest controleert dat). Binnen een
 * pagina ontdubbelen we nog op ticket en dag, zoals de definitie van SeatGeek
 * (`COUNT(DISTINCT product_item_id)`).
 */
export function applySalesPage(events: Record<string, StoredEvent>, rows: readonly SalesSeriesRow[]): PageResult {
  const result: PageResult = { counted: 0, unknownProduct: 0, earliest: null, latest: null };
  const seen = new Set<string>();

  for (const row of rows) {
    if (!isSoldTicket(row)) continue;
    const productId = id(row.product_id);
    if (!productId) continue;
    const event = events[productId];
    if (!event) {
      result.unknownProduct++;
      continue;
    }

    const day = amsterdamDay(row.transaction_date);
    if (!day) continue;
    const transaction = text(row.transaction_date);
    if (!result.earliest || transaction < result.earliest) result.earliest = transaction;
    if (!result.latest || transaction > result.latest) result.latest = transaction;

    const itemId = id(row.product_item_id);
    if (itemId) {
      const key = `${productId}|${day}|${itemId}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }

    const bucket = isStandTicket(event.name, row.area) ? event.stand : event.other;
    const category = categoryOf(row);
    const days = (bucket[category] ??= {});
    days[day] = (days[day] ?? 0) + 1;
    result.counted++;
  }

  return result;
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
  /** Alle verkochte tickets in de tribunevakken, per dagen-tot-de-wedstrijd. */
  perOffset: OffsetCounts;
  total: number;
  /** Dezelfde tickets, uitgesplitst. De vier reeksen tellen op tot `perOffset`. */
  series: Record<SalesCategory, OffsetCounts>;
  /** Parkeren en overige vakken; niet in `perOffset`. */
  otherTotal: number;
}

function sumCategories(bucket: CategoryDays): number {
  let total = 0;
  for (const category of SALES_CATEGORIES) total += totalOf(bucket[category]);
  return total;
}

export function toEventSales(event: StoredEvent): EventSales {
  // Past geen enkel vak op de plattegrond (een wedstrijd elders), dan telt alles.
  const standTotal = sumCategories(event.stand);
  const bucket = standTotal > 0 ? event.stand : event.other;

  const series = {} as Record<SalesCategory, OffsetCounts>;
  const perOffset: OffsetCounts = {};
  for (const category of SALES_CATEGORIES) {
    series[category] = daysToOffsets(bucket[category], event.eventDate);
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
