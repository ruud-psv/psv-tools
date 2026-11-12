/**
 * De export van één wedstrijd: per ticket een regel, als CSV.
 *
 * Gebruikt dezelfde stoelstatus als de wedstrijdpagina (`readEventSeats()`); er
 * gaat geen verzoek naar Ringside. Daardoor staan er alleen tickets in die de
 * stoel nu bezet houden. Teruggegeven en geannuleerde tickets vallen bij het
 * inlezen al af, en een CRM ID wordt niet bewaard (alleen een hash van de
 * eigenaar, zie `ownerFingerprint()`).
 */

import { RESALE_BOUGHT, RESALE_POSTED, type EventSeatState } from "../ringside/seat-state";

export const EXPORT_COLUMNS = [
  "Wedstrijd",
  "Datum",
  "Vak",
  "Rij",
  "Stoel",
  "Sales type",
  "Eigenaar (anoniem)",
  "Ticket ID",
] as const;

/** Wat er met het ticket aan de hand is, in de woorden van Ringside waar dat kan. */
export function salesType(resale: number, reservation?: number): string {
  if (reservation === 1) return "Reservation";
  if (resale & RESALE_POSTED) return "Resale - Posted";
  if (resale & RESALE_BOUGHT) return "Resale - Bought";
  return "Sale";
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

  const rows = Object.entries(event.tickets).map(([salesItemId, [manifestId, area, row, seat, resale, owner, reservation]]) => {
    // De plek van de stoelenkaart gaat voor, net als op de wedstrijdpagina (`toNeighborInput()`).
    const fromManifest = manifestId ? event.seats[manifestId] : undefined;
    return [
      name,
      date,
      fromManifest?.[0] ?? area,
      fromManifest?.[1] ?? row,
      fromManifest?.[2] ?? seat,
      salesType(resale, reservation),
      owner,
      salesItemId,
    ];
  });

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
