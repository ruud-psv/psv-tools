/**
 * Wat telt als verkocht ticket.
 *
 * Deze definitie is niet zelfbedacht maar overgenomen uit de sample queries in
 * de SeatGeek-documentatie, waar hij in drie verschillende rapportages
 * woordelijk terugkomt:
 *
 * ```sql
 * WHERE RS.current_status = 'True'
 *   AND RS.sale_type IN ('Sale', 'Reservation Confirmation', 'Update - New')
 *   AND RS.forward_item_id IS NULL
 *   AND RS.item_type = 'Ticket'
 * ```
 *
 * Elk onderdeel doet iets:
 *
 * - `item_type = 'Ticket'` houdt abonnementen, lidmaatschappen en merchandise
 *   buiten de telling. De documentatie noemt dit "primary tickets only" en
 *   merkt op dat `Resale` en `Transfer` desgewenst mee kunnen — voor Ticket
 *   Inzichten willen we die er juist buiten houden.
 * - `sale_type` laat reserveringen, annuleringen en retouren vallen. Let op
 *   `Update - New`: die waarde zat niet in de eerste pagina die we maten, maar
 *   staat wel in de officiële definitie.
 * - `forward_item_id IS NULL` sluit doorgezette items uit. Zonder die regel telt
 *   een ticket dat is overgedragen twee keer mee.
 * - `current_status` markeert de nog geldende regel; eerdere versies van
 *   dezelfde verkoop staan op false.
 */

/** De `sale_type`-waarden die als verkoop tellen. */
export const SOLD_SALE_TYPES = ["Sale", "Reservation Confirmation", "Update - New"] as const;

const SOLD_SALE_TYPE_SET: ReadonlySet<string> = new Set(SOLD_SALE_TYPES);

/** De velden uit `sales` die de telling nodig heeft. */
export interface SalesRow {
  item_type?: unknown;
  sale_type?: unknown;
  current_status?: unknown;
  forward_item_id?: unknown;
  product_item_id?: unknown;
}

/**
 * De REST-API levert `current_status` als boolean, maar in de voorbeeldqueries
 * — die op een warehouse-tabel draaien — staat het als tekst `'True'`. We
 * accepteren allebei, zodat dezelfde functie werkt ongeacht waar de rij vandaan
 * komt.
 */
function isTrue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

/** Geeft aan of deze verkoopregel meetelt als verkocht ticket. */
export function isSoldTicket(row: SalesRow): boolean {
  if (row.item_type !== "Ticket") return false;
  if (typeof row.sale_type !== "string" || !SOLD_SALE_TYPE_SET.has(row.sale_type)) return false;
  if (!isTrue(row.current_status)) return false;
  // Zowel null als undefined betekent hier "niet doorgezet".
  if (row.forward_item_id !== null && row.forward_item_id !== undefined) return false;
  return true;
}

/**
 * Telt de verkochte tickets in een verzameling verkoopregels.
 *
 * De documentatie telt `COUNT(DISTINCT product_item_id)` en niet het aantal
 * rijen: één ticket kan meerdere regels hebben. Rijen zonder
 * `product_item_id` tellen we elk apart, want dan is er niets om op te
 * ontdubbelen.
 */
export function countSoldTickets(rows: SalesRow[]): number {
  const seen = new Set<string>();
  let withoutId = 0;

  for (const row of rows) {
    if (!isSoldTicket(row)) continue;
    if (typeof row.product_item_id === "string" && row.product_item_id) {
      seen.add(row.product_item_id);
    } else {
      withoutId++;
    }
  }

  return seen.size + withoutId;
}
