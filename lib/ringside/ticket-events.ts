/**
 * Van Ringside-rijen naar de `TicketEvent`-vorm die Ticket Inzichten toont.
 *
 * De oude XML-feed gaf per event één regel met `SoldTickets` en
 * `AvailableCapacity` erin. Ringside geeft losse tabellen op stoelniveau, dus
 * die getallen moeten hier ontstaan:
 *
 * - `manifests` levert de capaciteit: één rij per stoel, of één rij per
 *   staanvak met de capaciteit van het hele vak. Optellen dus, niet tellen.
 * - `sales` levert de verkoop, volgens de definitie in `./sales.ts`.
 * - `products` levert naam, datum en verkoopstatus.
 *
 * Alles hier is puur: rijen in, aggregaten uit. Waar die rijen vandaan komen —
 * een live aanroep of een opgeslagen tussenstand — maakt niet uit.
 */

import { countSoldTickets, isSoldTicket, type SalesRow } from "./sales";
import { getProductDisplayName, type ProductRow } from "./products";

/* ---------- Capaciteit uit manifests ---------- */

export interface ManifestRow {
  manifest_id?: unknown;
  event_id?: unknown;
  event_name?: unknown;
  event_date?: unknown;
  product_id?: unknown;
  product_name?: unknown;
  capacity?: unknown;
  is_counted_as_available?: unknown;
  is_excluded_from_reported_capacity?: unknown;
  is_held_for_subscriber?: unknown;
  is_hospitality?: unknown;
  is_ga?: unknown;
}

export interface EventCapacity {
  eventId: string;
  eventName: string | null;
  eventDate: string | null;
  productId: string | null;
  /** Som van `capacity`, exclusief wat buiten de gerapporteerde capaciteit valt. */
  totalCapacity: number;
  /** Som van `capacity` waar `is_counted_as_available` waar is. */
  availableCapacity: number;
  /**
   * Capaciteit waarvan `is_counted_as_available` `null` was. Apart geteld en
   * niet stilzwijgend bij beschikbaar of bezet opgeteld: zolang niet vaststaat
   * wat die kolom betekent, is dit het getal waaraan je dat afleest. Blijft het
   * nul, dan speelt het niet.
   */
  unknownAvailability: number;
  /** Capaciteit die vastzit — handig om te zien wat écht vrij verkoopbaar is. */
  heldForSubscriber: number;
  hospitality: number;
  /** Aantal manifest-rijen, puur ter controle tegen de opgetelde capaciteit. */
  rows: number;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/** `true`/`false` als boolean of als tekst; al het andere is niet waar. */
function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function toText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Houdt per `manifest_id` de laatste versie over.
 *
 * Een change-feed levert mutaties, dus dezelfde stoel kan meerdere keren
 * langskomen — bijvoorbeeld omdat hij verkocht werd en `is_counted_as_available`
 * omklapte. Zonder deze stap telt die stoel twee keer mee in de capaciteit, en
 * één keer als beschikbaar én één keer als bezet. De rijen komen in volgorde
 * binnen, dus de laatste is de geldende.
 *
 * Rijen zonder `manifest_id` laten we ongemoeid: er is dan niets om op te
 * ontdubbelen, en weggooien zou erger zijn dan mogelijk dubbeltellen.
 */
function latestPerManifestId(rows: ManifestRow[]): ManifestRow[] {
  const byId = new Map<string, ManifestRow>();
  const withoutId: ManifestRow[] = [];

  for (const row of rows) {
    const id = toText(row.manifest_id);
    if (id) byId.set(id, row);
    else withoutId.push(row);
  }

  return [...byId.values(), ...withoutId];
}

/**
 * Telt manifest-rijen op per event. Rijen zonder `event_id` vallen weg: zonder
 * sleutel is er niets om bij op te tellen.
 */
export function aggregateManifests(rows: ManifestRow[]): Map<string, EventCapacity> {
  const byEvent = new Map<string, EventCapacity>();

  for (const row of latestPerManifestId(rows)) {
    const eventId = toText(row.event_id);
    if (!eventId) continue;

    let entry = byEvent.get(eventId);
    if (!entry) {
      entry = {
        eventId,
        eventName: toText(row.event_name) ?? toText(row.product_name),
        eventDate: toText(row.event_date),
        productId: toText(row.product_id),
        totalCapacity: 0,
        availableCapacity: 0,
        unknownAvailability: 0,
        heldForSubscriber: 0,
        hospitality: 0,
        rows: 0,
      };
      byEvent.set(eventId, entry);
    }

    entry.rows++;

    // Uitgesloten van de gerapporteerde capaciteit telt nergens in mee — ook
    // niet als beschikbaar, want dan zou beschikbaar groter kunnen zijn dan
    // totaal.
    if (toBool(row.is_excluded_from_reported_capacity)) continue;

    const capacity = toNumber(row.capacity);
    entry.totalCapacity += capacity;

    if (row.is_counted_as_available === null || row.is_counted_as_available === undefined) {
      entry.unknownAvailability += capacity;
    } else if (toBool(row.is_counted_as_available)) {
      entry.availableCapacity += capacity;
    }

    if (toBool(row.is_held_for_subscriber)) entry.heldForSubscriber += capacity;
    if (toBool(row.is_hospitality)) entry.hospitality += capacity;
  }

  return byEvent;
}

/* ---------- Verkoop uit sales ---------- */

export interface SalesAggregateRow extends SalesRow {
  product_id?: unknown;
}

/**
 * Telt verkochte tickets per product. Ontdubbelt op `product_item_id`, zoals
 * de sample queries voorschrijven — over de hele verzameling, zodat een ticket
 * dat in twee pagina's terugkomt niet twee keer meetelt.
 */
export function aggregateSales(rows: SalesAggregateRow[]): Map<string, number> {
  const itemsByProduct = new Map<string, Set<string>>();
  const extraByProduct = new Map<string, number>();

  for (const row of rows) {
    if (!isSoldTicket(row)) continue;
    const productId = toText(row.product_id);
    if (!productId) continue;

    const itemId = toText(row.product_item_id);
    if (itemId) {
      let items = itemsByProduct.get(productId);
      if (!items) {
        items = new Set();
        itemsByProduct.set(productId, items);
      }
      items.add(itemId);
    } else {
      extraByProduct.set(productId, (extraByProduct.get(productId) ?? 0) + 1);
    }
  }

  const sold = new Map<string, number>();
  for (const productId of new Set([...itemsByProduct.keys(), ...extraByProduct.keys()])) {
    sold.set(
      productId,
      (itemsByProduct.get(productId)?.size ?? 0) + (extraByProduct.get(productId) ?? 0)
    );
  }
  return sold;
}

export { countSoldTickets };

/* ---------- Categorie ---------- */

/**
 * De categorie van een event.
 *
 * `product_type` scheidt het grove werk — merchandise, lidmaatschappen en
 * cadeaubonnen horen niet in een ticketoverzicht. Maar binnen `Event` vallen
 * zowel wedstrijden als tours en museumbezoek, en dat onderscheid zit alleen
 * in de naam. Daar blijft dus een naamregel voor nodig, net als in de oude
 * feed — maar nu alleen nog voor die ene splitsing, en niet meer om
 * merchandise van wedstrijden te onderscheiden.
 */
export function categorizeProduct(productType: string | null, name: string | null): string {
  switch (productType) {
    case "Merchandise":
      return "Merchandise";
    case "Memberships":
      return "Abonnementen";
    case "Gift Voucher":
      return "Cadeaubonnen";
    case "Series":
      return "Series";
    case "Delivery":
    case "Price Modifier":
    case "Fund":
    case "Deposit Category":
      return "Overig";
  }

  const n = (name ?? "").toLowerCase();
  if (!n) return "Overig";

  if (
    n.includes("stadiontour") ||
    n.includes("kampioenstour") ||
    n.includes("legend tour") ||
    n.includes("matchday tour")
  ) {
    return "Tours";
  }
  if (n.includes("museum")) return "Museum";
  if (
    /^(psv|jong psv|psv vrouwen)\s*-\s*.+/.test(n) ||
    /^.+\s*-\s*(psv|jong psv|psv vrouwen)\b/.test(n) ||
    /vrouwen.*-.*psv|psv.*vrouwen.*-/.test(n)
  ) {
    return "Wedstrijden";
  }
  if (
    n.includes("minivoetbal") ||
    n.includes("clinic") ||
    n.includes("trainingsmodule") ||
    n.includes("talent day") ||
    n.includes("voetbalgames") ||
    n.includes("voetbaltraining")
  ) {
    return "Jeugd";
  }
  if (
    n.includes("kinderfeestje") ||
    n.includes("open training") ||
    n.includes("funpark") ||
    n.includes("awayday") ||
    n.includes("scholenchallenge") ||
    n.includes("fanclub")
  ) {
    return "Evenementen";
  }
  return "Overig";
}

/** De subcategorie binnen wedstrijden: eerste elftal, Jong PSV of Vrouwen. */
export function matchSubCategory(name: string | null): string {
  const n = (name ?? "").toLowerCase();
  if (n.includes("jong psv")) return "Jong PSV";
  if (n.includes("vrouwen")) return "PSV Vrouwen";
  return "PSV";
}

/* ---------- Samenstellen ---------- */

/** Dezelfde vorm die `/api/ticket-feed` teruggeeft, zodat de UI niets merkt. */
export interface TicketEvent {
  nameAndDate: string;
  showId: string;
  eventId: string;
  eventDate: string;
  saleStatus: string;
  soldTickets: number;
  availableCapacity: number;
  totalCapacity: number;
  startSaleFrom: string;
  endSaleAt: string;
  lastUpdate: string;
  availableForDisplay: boolean;
  category: string;
  subCategory: string;
  matchGroup: string;
  eventName: string;
}

export interface ProductInfo extends ProductRow {
  product_id?: unknown;
  event_date?: unknown;
  event_sales_status?: unknown;
  last_touched_at?: unknown;
}

export interface BuildInput {
  capacityByEvent: Map<string, EventCapacity>;
  soldByProduct: Map<string, number>;
  productsById: Map<string, ProductInfo>;
}

/**
 * Voegt de drie bronnen samen tot de regels die de UI toont.
 *
 * De capaciteit is leidend: zonder manifest weten we niet hoe groot een event
 * is, en een regel zonder capaciteit zegt niets. `products` vult naam, datum en
 * status aan waar die er is.
 */
export function buildTicketEvents(input: BuildInput): TicketEvent[] {
  const events: TicketEvent[] = [];

  for (const capacity of input.capacityByEvent.values()) {
    const product = capacity.productId ? input.productsById.get(capacity.productId) : undefined;
    const productType = toText(product?.product_type);
    const name =
      (product ? getProductDisplayName(product) : null) ?? capacity.eventName ?? "Onbekend event";
    const eventDate = capacity.eventDate ?? toText(product?.event_date) ?? "";
    const category = categorizeProduct(productType, name);
    const sold = (capacity.productId && input.soldByProduct.get(capacity.productId)) || 0;
    const saleStatus = toText(product?.event_sales_status) ?? "";

    events.push({
      nameAndDate: eventDate ? `${name} ${eventDate}` : name,
      showId: capacity.productId ?? "",
      eventId: capacity.eventId,
      eventDate,
      saleStatus,
      soldTickets: sold,
      availableCapacity: capacity.availableCapacity,
      totalCapacity: capacity.totalCapacity,
      // De oude feed had deze velden; Ringside kent ze niet. Leeg laten is
      // eerlijker dan een datum verzinnen — de UI toont ze dan gewoon niet.
      startSaleFrom: "",
      endSaleAt: "",
      lastUpdate: toText(product?.last_touched_at) ?? "",
      availableForDisplay: saleStatus !== "Canceled",
      category,
      subCategory: category === "Wedstrijden" ? matchSubCategory(name) : "",
      matchGroup: category === "Wedstrijden" ? `${name.toLowerCase()}|${eventDate}` : "",
      eventName: name,
    });
  }

  return events;
}
