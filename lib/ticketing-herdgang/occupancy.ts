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
 * - **Verkocht**: afgenomen tickets (zie `isOccupyingTicket()`), zonder
 *   openstaande reserveringen. Tickets die in de resale staan tellen mee.
 * - **Gereserveerd**: openstaande reserveringen. Die houden een plaats bezet,
 *   maar zijn nog niet afgenomen.
 * - **In de resale**: het deel van verkocht dat de houder heeft aangeboden.
 * - **Vrij**: per rij die te koop is de capaciteit min alle tickets erop, ook
 *   reserveringen. Een rij die geblokkeerd is, telt niet als vrij.
 *
 * Vakken die geen tribune zijn (parkeren, en alles wat niet op de plattegrond
 * staat) komen apart en tellen niet mee in het totaal: anders tellen
 * parkeerkaarten als verkochte tickets.
 */

import { normalizeArea } from "../aangrenzende-stoelen/neighbors";
import { SEAT_EXCLUDED, SEAT_SELLABLE, seatCapacity, type EventSeatState } from "../ringside/seat-state";

export interface Occupancy {
  capacity: number;
  /** Capaciteit van rijen die te koop zijn (niet geblokkeerd). */
  sellable: number;
  sold: number;
  reserved: number;
  resale: number;
  free: number;
}

export interface AreaOccupancy extends Occupancy {
  area: string;
  /** Staanvak: geen rijen en stoelnummers. */
  standing: boolean;
}

export interface OccupancyResult {
  /** Tribunevakken: die tellen mee in `total`. */
  areas: AreaOccupancy[];
  total: Occupancy;
  /** Overige vakken, zoals parkeren: apart, niet in `total`. */
  other: AreaOccupancy[];
  otherTotal: Occupancy;
  /** Tickets waarvan de rij in de stoelenkaart (nog) niet bekend is; meegeteld bij hun eigen vak. */
  ticketsWithoutManifest: number;
}

function emptyTotal(): Occupancy {
  return { capacity: 0, sellable: 0, sold: 0, reserved: 0, resale: 0, free: 0 };
}

function sum(rows: readonly Occupancy[]): Occupancy {
  const total = emptyTotal();
  for (const row of rows) {
    total.capacity += row.capacity;
    total.sellable += row.sellable;
    total.sold += row.sold;
    total.reserved += row.reserved;
    total.resale += row.resale;
    total.free += row.free;
  }
  return total;
}

/**
 * Telt per vak. `isStand` zegt welke vakken tribune zijn; zonder, of als geen
 * enkel vak erop past (een evenement elders), tellen alle vakken mee.
 */
export function occupancyByArea(event: EventSeatState, isStand?: (area: string) => boolean): OccupancyResult {
  const byArea = new Map<string, AreaOccupancy>();
  const entry = (area: string) => {
    const key = normalizeArea(area) || "ONBEKEND";
    let found = byArea.get(key);
    if (!found) {
      found = { area: key, standing: false, ...emptyTotal() };
      byArea.set(key, found);
    }
    return found;
  };

  // Tickets per rij van de stoelenkaart.
  const ticketsPerSeat = new Map<string, number>();
  let ticketsWithoutManifest = 0;
  for (const [manifestId, area, , , posted, , reservation] of Object.values(event.tickets)) {
    const seat = manifestId ? event.seats[manifestId] : undefined;
    const target = entry(seat ? seat[0] : area);
    if (reservation === 1) target.reserved++;
    else {
      target.sold++;
      if (posted === 1) target.resale++;
    }
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

  const all = [...byArea.values()].sort((a, b) => a.area.localeCompare(b.area, "nl", { numeric: true }));
  const anyStand = isStand ? all.some((row) => isStand(row.area)) : false;
  const areas = anyStand ? all.filter((row) => isStand!(row.area)) : all;
  const other = anyStand ? all.filter((row) => !isStand!(row.area)) : [];
  return { areas, total: sum(areas), other, otherTotal: sum(other), ticketsWithoutManifest };
}
