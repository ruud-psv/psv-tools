/**
 * De export van één wedstrijd als CSV: per stoel een regel, net als de
 * plattegrond op de wedstrijdpagina.
 *
 * Gebruikt dezelfde stoelstatus als de wedstrijdpagina (`readEventSeats()`); er
 * gaat geen verzoek naar Ringside.
 *
 * - **Plattegrond** is de status van de stoel, met dezelfde functie en
 *   dezelfde termen als de plattegrond (`seatStatus()`): vrij, vrij via resale,
 *   bezet, doorverkocht via resale of geblokkeerd. Alleen de vakken van de
 *   plattegrond; staanvakken hebben geen stoelen en heten "Staanvak".
 * - Staat er een ticket op de stoel, dan komen daar **Sales type** en
 *   **Status** bij: `sale_type` en `resale_status` zoals Ringside ze levert, dus
 *   ook waarden die we nog niet kennen. Een stoel met twee tickets krijgt twee
 *   regels.
 * - De kaart van een verkoper die in de resale is doorverkocht
 *   (`Resold - Refunded`) staat als extra regel onder die stoel.
 * - Een vrije of geblokkeerde stoel heeft geen ticket; die kolommen zijn leeg.
 *
 * Geen CRM ID: die wordt niet bewaard (alleen een hash van de eigenaar, zie
 * `ownerFingerprint()`).
 */

import { seatKey, seatStatus, type SeatStatus, type TicketInfo } from "../aangrenzende-stoelen/neighbors";
import {
  RESALE_BOUGHT,
  RESALE_POSTED,
  RESOLD_STATUS,
  SEAT_GA,
  SEAT_SELLABLE,
  type EventSeatState,
} from "../ringside/seat-state";
import { isStadiumStand } from "./summary";

export const EXPORT_COLUMNS = [
  "Wedstrijd",
  "Datum",
  "Vak",
  "Rij",
  "Stoel",
  "Plattegrond",
  "Sales type",
  "Status",
  "Via resale",
  "Eigenaar (anoniem)",
  "Ticket ID",
] as const;

/** Dezelfde termen als de legenda van de plattegrond (`components/area-seat-view.tsx`). */
export const SEAT_STATUS_LABEL: Record<SeatStatus, string> = {
  vrij: "Vrij",
  resale: "Vrij via resale",
  bezet: "Bezet",
  doorverkocht: "Doorverkocht via resale",
  geblokkeerd: "Geblokkeerd",
};

export const STANDING_LABEL = "Staanvak";

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

/** Wat er van een ticket in de export komt, behalve de stoel. */
type TicketCells = [saleType: string, status: string, viaResale: string, owner: string, salesItemId: string];

interface Place {
  area: string;
  row: string;
  seat: string;
  /** Leeg als het ticket niet op een stoel van de stoelenkaart staat. */
  plattegrond: string;
  tickets: TicketCells[];
}

export function buildSalesExport(event: EventSeatState): string {
  const places = new Map<string, Place>();
  const standingAreas = new Set<string>();

  // Eerst alle stoelen van de plattegrond, ook zonder ticket.
  for (const [area, row, seat, flags] of Object.values(event.seats)) {
    if (flags & SEAT_GA) {
      standingAreas.add(area.trim().toUpperCase());
      continue;
    }
    const key = seatKey(area, row, seat);
    if (!key || !isStadiumStand(area) || places.has(key)) continue;
    places.set(key, { area, row, seat, plattegrond: "", tickets: [] });
  }
  const sellable = new Set<string>();
  for (const [area, row, seat, flags] of Object.values(event.seats)) {
    const key = seatKey(area, row, seat);
    if (key && flags & SEAT_SELLABLE && !(flags & SEAT_GA)) sellable.add(key);
  }

  // De stoel van een ticket: die uit de stoelenkaart gaat voor, net als op de
  // wedstrijdpagina (`toNeighborInput()`).
  const placeOf = (manifestId: string, area: string, row: string, seat: string, salesItemId: string): Place => {
    const fromManifest = manifestId ? event.seats[manifestId] : undefined;
    const [a, r, s] = fromManifest ? [fromManifest[0], fromManifest[1], fromManifest[2]] : [area, row, seat];
    const key = seatKey(a, r, s) ?? `ticket|${salesItemId}`;
    let place = places.get(key);
    if (!place) {
      place = { area: a, row: r, seat: s, plattegrond: "", tickets: [] };
      places.set(key, place);
    }
    return place;
  };

  const onSeat = new Map<string, TicketInfo[]>();
  for (const [salesItemId, [manifestId, area, row, seat, resale, owner, reservation]] of Object.entries(event.tickets)) {
    const place = placeOf(manifestId, area, row, seat, salesItemId);
    const { saleType, status } = ticketStatus(resale, reservation, event.details?.[salesItemId]);
    place.tickets.push([saleType, status, resale & RESALE_BOUGHT ? "ja" : "nee", owner, salesItemId]);

    const key = seatKey(place.area, place.row, place.seat);
    if (!key) continue;
    const list = onSeat.get(key) ?? [];
    list.push({
      key,
      resalePosted: (resale & RESALE_POSTED) !== 0,
      resaleBought: (resale & RESALE_BOUGHT) !== 0,
      owner: owner || null,
    });
    onSeat.set(key, list);
  }
  // Na de geldige tickets, zodat de verkoper onder de koper staat.
  for (const [salesItemId, [manifestId, area, row, seat, owner, saleType]] of Object.entries(event.resold ?? {})) {
    placeOf(manifestId, area, row, seat, salesItemId).tickets.push([saleType || "Sale", RESOLD_STATUS, "", owner, salesItemId]);
  }

  // De status van elke stoel, met dezelfde regels als de plattegrond.
  for (const [key, place] of places) {
    if (key.startsWith("ticket|")) {
      if (standingAreas.has(place.area.trim().toUpperCase())) place.plattegrond = STANDING_LABEL;
      continue;
    }
    const status = seatStatus(
      { area: place.area, row: 0, seat: 0, sellable: sellable.has(key) },
      onSeat.get(key) ?? []
    );
    place.plattegrond = SEAT_STATUS_LABEL[status];
  }

  const sorted = [...places.values()].sort(
    (a, b) => compare(a.area, b.area) || compare(a.row, b.row) || compare(a.seat, b.seat)
  );

  const name = event.name ?? "";
  const date = event.eventDate ?? "";
  const lines: string[][] = [[...EXPORT_COLUMNS]];
  for (const place of sorted) {
    const seatCells = [name, date, place.area, place.row, place.seat, place.plattegrond];
    if (place.tickets.length === 0) lines.push([...seatCells, "", "", "", "", ""]);
    for (const ticket of place.tickets) lines.push([...seatCells, ...ticket]);
  }

  // De BOM laat Excel de tekst als UTF-8 lezen.
  return "﻿" + lines.map((line) => line.map(cell).join(";")).join("\r\n") + "\r\n";
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
