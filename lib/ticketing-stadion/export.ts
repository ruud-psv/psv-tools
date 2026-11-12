/**
 * De export van één wedstrijd: per ticket een regel, als CSV.
 *
 * Gebruikt dezelfde stoelstatus als de wedstrijdpagina (`readEventSeats()`); er
 * gaat geen verzoek naar Ringside. Er staan in: de tickets die de stoel nu bezet
 * houden, en de kaarten die in de resale zijn doorverkocht (`Resold - Refunded`).
 * "Sales type" en "Status" zijn `sale_type` en `resale_status` uit Ringside, dus
 * ook waarden die we nog niet kennen komen er gewoon in.
 * Teruggegeven en geannuleerde tickets vallen bij het inlezen af, en een CRM ID
 * wordt niet bewaard (alleen een hash van de eigenaar, zie `ownerFingerprint()`).
 */

import { RESALE_BOUGHT, RESALE_POSTED, RESOLD_STATUS, type EventSeatState } from "../ringside/seat-state";

export const EXPORT_COLUMNS = [
  "Wedstrijd",
  "Datum",
  "Vak",
  "Rij",
  "Stoel",
  "Sales type",
  "Status",
  "Via resale",
  "Eigenaar (anoniem)",
  "Ticket ID",
] as const;

/**
 * `sale_type` en `resale_status` zoals Ringside ze levert. Staan ze (nog) niet
 * in de stoelstatus, dan volgen ze uit de vlaggen: een openstaande reservering
 * is `Reservation`, de rest `Sale`, en aangeboden in de resale is `Posted`.
 * Dat geldt voor tickets van vóór de eenmalige ronde van `applySalesDetails()`.
 */
export function ticketStatus(
  resale: number,
  reservation: number | undefined,
  details: [string, string] | undefined
): { saleType: string; status: string } {
  if (details) return { saleType: details[0], status: details[1] };
  return { saleType: reservation === 1 ? "Reservation" : "Sale", status: resale & RESALE_POSTED ? "Posted" : "" };
}

/** Een waarde voor CSV met `;` als scheidingsteken, zoals Excel in het Nederlands verwacht. */
function cell(value: string): string {
  // Een begin met = + - @ leest Excel als formule; een apostrof ervoor voorkomt dat.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function compare(a: string, b: string): number {
  return a.localeCompare(b, "nl", { numeric: true });
}

export function buildSalesExport(event: EventSeatState): string {
  const name = event.name ?? "";
  const date = event.eventDate ?? "";

  const place = (manifestId: string, area: string, row: string, seat: string) => {
    // De plek van de stoelenkaart gaat voor, net als op de wedstrijdpagina (`toNeighborInput()`).
    const fromManifest = manifestId ? event.seats[manifestId] : undefined;
    return [fromManifest?.[0] ?? area, fromManifest?.[1] ?? row, fromManifest?.[2] ?? seat];
  };

  const rows = Object.entries(event.tickets).map(([salesItemId, [manifestId, area, row, seat, resale, owner, reservation]]) => {
    const { saleType, status } = ticketStatus(resale, reservation, event.details?.[salesItemId]);
    return [
      name,
      date,
      ...place(manifestId, area, row, seat),
      saleType,
      status,
      resale & RESALE_BOUGHT ? "ja" : "nee",
      owner,
      salesItemId,
    ];
  });

  // De kaart van de verkoper; de koper staat erbij met "Via resale" ja op dezelfde stoel.
  for (const [salesItemId, [manifestId, area, row, seat, owner, saleType]] of Object.entries(event.resold ?? {})) {
    rows.push([name, date, ...place(manifestId, area, row, seat), saleType || "Sale", RESOLD_STATUS, "", owner, salesItemId]);
  }

  rows.sort((a, b) => compare(a[2], b[2]) || compare(a[3], b[3]) || compare(a[4], b[4]));

  // De BOM laat Excel de tekst als UTF-8 lezen.
  return "﻿" + [EXPORT_COLUMNS as readonly string[], ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}

/** `PSV - Ajax` op 28-11-2026 → `verkoop-psv-ajax-2026-11-28.csv`. */
export function exportFileName(event: EventSeatState): string {
  const slug = (event.name ?? "wedstrijd")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const day = (event.eventDate ?? "").slice(0, 10);
  return `verkoop-${slug || "wedstrijd"}${day ? `-${day}` : ""}.csv`;
}
