/**
 * Bezetting per vak van één wedstrijd, uit de stoelstatus van Ringside.
 *
 * Gemaakt voor De Herdgang, waar alleen staanvakken zijn: Ringside geeft zo'n
 * vak als één rij in de stoelenkaart met een capaciteit (bijvoorbeeld 703), en
 * elk ticket wijst via `manifest_id` naar die rij. Genummerde stoelen werken
 * op dezelfde manier, met capaciteit 1 per stoel.
 *
 * - **Capaciteit**: de som van `capacity`, zonder rijen die Ringside buiten de
 *   gerapporteerde capaciteit houdt.
 * - **Verkocht**: geldige tickets (zie `isOccupyingTicket()`), dus ook
 *   openstaande reserveringen en tickets die in de resale staan.
 * - **In de resale**: het deel van verkocht dat de houder heeft aangeboden.
 * - **Vrij**: per rij die te koop is de capaciteit min de tickets erop. Een rij
 *   die geblokkeerd is, telt niet als vrij.
 */

import { normalizeArea } from "../aangrenzende-stoelen/neighbors";
import { SEAT_EXCLUDED, SEAT_SELLABLE, seatCapacity, type EventSeatState } from "../ringside/seat-state";

export interface Occupancy {
  capacity: number;
  /** Capaciteit van rijen die te koop zijn (niet geblokkeerd). */
  sellable: number;
  sold: number;
  resale: number;
  free: number;
}

export interface AreaOccupancy extends Occupancy {
  area: string;
  /** Staanvak: geen rijen en stoelnummers. */
  standing: boolean;
}

export interface OccupancyResult {
  areas: AreaOccupancy[];
  total: Occupancy;
  /** Tickets waarvan de rij in de stoelenkaart (nog) niet bekend is; meegeteld bij hun eigen vak. */
  ticketsWithoutManifest: number;
}

function empty(area: string): AreaOccupancy {
  return { area, standing: false, capacity: 0, sellable: 0, sold: 0, resale: 0, free: 0 };
}

export function occupancyByArea(event: EventSeatState): OccupancyResult {
  const byArea = new Map<string, AreaOccupancy>();
  const entry = (area: string) => {
    const key = normalizeArea(area) || "ONBEKEND";
    let found = byArea.get(key);
    if (!found) {
      found = empty(key);
      byArea.set(key, found);
    }
    return found;
  };

  // Tickets per rij van de stoelenkaart.
  const ticketsPerSeat = new Map<string, number>();
  let ticketsWithoutManifest = 0;
  for (const [manifestId, area, , , posted] of Object.values(event.tickets)) {
    const seat = manifestId ? event.seats[manifestId] : undefined;
    const target = entry(seat ? seat[0] : area);
    target.sold++;
    if (posted === 1) target.resale++;
    if (seat) ticketsPerSeat.set(manifestId, (ticketsPerSeat.get(manifestId) ?? 0) + 1);
    else ticketsWithoutManifest++;
  }

  for (const [manifestId, seat] of Object.entries(event.seats)) {
    const [area, row, number, flags] = seat;
    if (flags & SEAT_EXCLUDED) continue;
    const target = entry(area);
    const capacity = seatCapacity(seat);
    target.capacity += capacity;
    if (!row && !number) target.standing = true;
    if (flags & SEAT_SELLABLE) {
      target.sellable += capacity;
      target.free += Math.max(capacity - (ticketsPerSeat.get(manifestId) ?? 0), 0);
    }
  }

  const areas = [...byArea.values()].sort((a, b) => a.area.localeCompare(b.area, "nl", { numeric: true }));
  const total: Occupancy = { capacity: 0, sellable: 0, sold: 0, resale: 0, free: 0 };
  for (const area of areas) {
    total.capacity += area.capacity;
    total.sellable += area.sellable;
    total.sold += area.sold;
    total.resale += area.resale;
    total.free += area.free;
  }
  return { areas, total, ticketsWithoutManifest };
}
