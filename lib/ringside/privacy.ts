/**
 * Persoonsgegevens uit Ringside: wat Tools nooit binnenlaat, en wat de probe
 * wél mag laten zien.
 *
 * Twee lagen, met een bewust verschillende aanpak:
 *
 * 1. **`stripIdentity`**: een verbodslijst die in `ringsideFetch` op élk
 *    antwoord draait. Naam, e-mail, telefoon en adresregels gebruikt geen enkele
 *    tool, dus die verdwijnen direct nadat het antwoord binnen is — voordat welke
 *    code dan ook ze te zien krijgt. Postcode, land, geboortedatum en de
 *    klant-GUID blijven staan: de wachtlijst rekent daarmee (en bewaart alleen
 *    geboortejaar, een postcodecode en een hash van de GUID).
 *
 * 2. **`isProbeVisibleColumn`**: een toestaanlijst voor de probe. Daar is het
 *    omgekeerd: alleen kolommen waarvan we weten dat ze niet over een persoon
 *    gaan, tonen hun waarde. Een nieuwe kolom bij SeatGeek blijft zo gemaskeerd
 *    tot iemand hem hier bewust toevoegt.
 */

/**
 * Kolommen die Tools nooit binnenlaat. Anker op het achtervoegsel: dezelfde
 * gegevens heten per tabel anders — `fname` in payments, `primary_first_name`
 * in attendance, `own_lname_or_accnt_name` in sales.
 */
const IDENTITY_COLUMN_PATTERN = new RegExp(
  [
    // Namen.
    "(^|_)(fname|lname|mname)($|_)",
    "(^|_)(first|last|middle|full|preferred|prefered|contact|account|accnt)_name$",
    "(^|_)initials$",
    // E-mail en telefoon (ook de bijbehorende `_id`-kolommen; die zijn nergens nodig).
    "(^|_)e_?mail($|_)",
    "(^|_)(phone|mobile|telephone|fax)($|_)",
    // Adresregels. Postcode, plaats en land blijven: daar draaien analyses op.
    "(^|_)address_line(_?\\d+)?$",
    "(^|_)(street|house_number|housenumber)($|_)",
    // JSON-velden met extra adressen en contactgegevens.
    "^secondary_(addresses|contact_details)$",
  ].join("|"),
  "i"
);

/** Hoort deze kolom bij naam, e-mail, telefoon of adresregel? */
export function isIdentityColumn(column: string): boolean {
  return IDENTITY_COLUMN_PATTERN.test(column.replace(/^"+|"+$/g, ""));
}

/**
 * Haalt de identiteitsvelden weg uit een (geparsed) Ringside-antwoord, op elk
 * niveau. Kolommen verdwijnen helemaal; `metadata.table_definition` blijft
 * staan, want een kolomnaam is geen persoonsgegeven.
 */
export function stripIdentity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripIdentity);
  if (typeof value !== "object" || value === null) return value;
  const result: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (!isIdentityColumn(key)) result[key] = stripIdentity(inner);
  }
  return result;
}

/**
 * Kolommen waarvan de probe de waarde mag tonen: de kolommen die de tools zelf
 * gebruiken, plus wat bij het verkennen van de tabellen nodig bleek (zie
 * `docs/ringside-api.md`). Alleen gegevens over events, producten, stoelen,
 * verkoopregels en scans — niets dat zegt wie iemand is.
 */
const PROBE_VISIBLE_COLUMNS = new Set([
  // Ringside zelf.
  "_ringside_sequence",
  "_ringside_operation",
  "last_touched_at",
  // Producten en events.
  "product_id",
  "product_name",
  "product_description",
  "product_details",
  "product_type",
  "product_item_id",
  "event_id",
  "event_name",
  "event_date",
  "event_sales_status",
  "price_type",
  "price_type_group",
  "price_level",
  "supplier_org_unit",
  "supplier_org_units",
  // Stadion.
  "venue",
  "venue_city",
  "venue_country",
  "venue_marquee_city",
  "venue_state",
  "venue_timezone",
  // Stoelindeling.
  "manifest_id",
  "capacity",
  "section",
  "section_name",
  "stand",
  "area",
  "area_name",
  "row",
  "row_name",
  "seat",
  "seat_type",
  "manifest_sector_name",
  "manifest_row_name",
  "manifest_seat_name",
  // Prijzen en bedragen per verkoopregel (voor de recette). Geen persoonsgegevens.
  "reference_price",
  "base_price",
  "list_price",
  "adjusted_price",
  "total_price",
  "price_after_discount",
  "total_commission",
  "total_comission_included",
  "total_tax",
  "total_tax_included",
  "total_vat",
  "total_vat_included",
  "total_discount",
  "total_extra_charge",
  "total_processing_fees",
  "total_payment",
  "total_plan_amount",
  "price_type_reporting_shortname",
  "sale_point",
  "sale_mode",
  "application_channel",
  // Verkoopregels.
  "sales_item_id",
  "transaction_id",
  "transaction_date",
  "item_type",
  "sale_type",
  "current_status",
  "resale_status",
  "forward_item_id",
  "previous_ticket_id",
  "primary_ticket_id",
  "subscription_instance_id",
  "sales_channel",
  "affiliate_id",
  "placement_id",
  // Scans.
  "action",
  "scan_date",
  "scan_succeeded",
  "scan_failure_reason_code",
  "scanned_item",
  "scanned_item_id",
  "scanner_name",
  "scanner_controlled_entrance_type",
  "first_scan",
  "gate_id",
  "turnstile_name",
  "device_group_id",
  "device_group_name",
  "reference_id",
  // Klanttabel: alleen wat over het record gaat, niet over de persoon.
  "client_status",
  "record_type",
  "creation_datetime",
]);

/** Ja/nee-vlaggen zijn veilig, behalve deze. */
const PERSONAL_FLAGS = new Set(["is_deceased"]);

/** Mag de probe de waarde van deze kolom tonen? */
export function isProbeVisibleColumn(column: string): boolean {
  const name = column.replace(/^"+|"+$/g, "").toLowerCase();
  if (isIdentityColumn(name) || PERSONAL_FLAGS.has(name)) return false;
  return PROBE_VISIBLE_COLUMNS.has(name) || /^(is|has)_/.test(name);
}

export const MASKED = "«gemaskeerd»";

/**
 * Maskeert alles wat niet op de toestaanlijst staat. `null` blijft staan: dat
 * een veld leeg is, is zelf geen persoonsgegeven en juist nuttig om te zien.
 */
export function maskForProbe(row: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    masked[key] = value === null || isProbeVisibleColumn(key) ? value : MASKED;
  }
  return masked;
}
