/**
 * Het uitpakken van `products.product_details`.
 *
 * Die kolom is tekst met JSON erin, en de sample queries in de
 * SeatGeek-documentatie laten zien wat erin zit:
 *
 * ```sql
 * COALESCE(PROD.product_details::json->'Display_Name'->>0, PROD.product_description)
 * ```
 *
 * en voor een `Series`-product:
 *
 * ```sql
 * jsonb_array_elements_text((series.product_details::jsonb)->'Event_Id')
 * ```
 *
 * Beide velden zijn dus arrays. `Display_Name` levert de publieksnaam van het
 * event — de naam die je in de UI wil tonen — en `Event_Id` de events die bij
 * een serie horen.
 */

export interface ProductRow {
  product_description?: unknown;
  product_details?: unknown;
  product_type?: unknown;
}

/**
 * Leest `product_details` uit. De kolom kan al geparsed zijn (als de API JSON
 * teruggeeft) of nog tekst zijn; onleesbare inhoud levert null op in plaats van
 * een uitzondering, want één stukgelopen product mag een hele pagina niet
 * laten vallen.
 */
function parseDetails(details: unknown): Record<string, unknown> | null {
  if (details && typeof details === "object") return details as Record<string, unknown>;
  if (typeof details !== "string" || !details.trim()) return null;
  try {
    const parsed = JSON.parse(details);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Pakt het eerste element van een array-veld in `product_details`. */
function firstOf(details: Record<string, unknown> | null, key: string): string | null {
  const value = details?.[key];
  if (Array.isArray(value)) {
    const first = value.find((v) => typeof v === "string" && v.trim());
    return typeof first === "string" ? first : null;
  }
  // Niet elk veld hoeft een array te zijn; een kale string is ook bruikbaar.
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * De naam om te tonen: `Display_Name` uit `product_details`, met
 * `product_description` als terugval — precies de COALESCE uit de
 * documentatie.
 */
export function getProductDisplayName(product: ProductRow): string | null {
  const fromDetails = firstOf(parseDetails(product.product_details), "Display_Name");
  if (fromDetails) return fromDetails;
  return typeof product.product_description === "string" && product.product_description.trim()
    ? product.product_description
    : null;
}

/**
 * De event-ids die bij een `Series`-product horen. Voor een gewoon event is dit
 * een lege lijst.
 */
export function getSeriesEventIds(product: ProductRow): string[] {
  const value = parseDetails(product.product_details)?.["Event_Id"];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}
