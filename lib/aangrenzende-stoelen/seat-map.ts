import {
  isExcludedArea,
  normalizeArea,
  seatKey,
  seatStatus,
  type NeighborRow,
  type SeatInfo,
  type TicketInfo,
} from "./neighbors";

/**
 * Per vak de stoelen met hun status, voor de vakweergave naast de plattegrond.
 *
 * Het gaat in één antwoord mee met de lijst, dus compact: per rij het
 * rijnummer, het eerste stoelnummer, en vanaf daar één teken per stoelnummer.
 * Een nummer zonder stoel (trap, gat) is een punt. Het hele stadion is zo een
 * paar tientallen kilobytes. Uitgesloten vakken zitten er niet in.
 */

export const SEAT_CODE = {
  vrij: "v",
  resale: "r",
  /** Bezet door een seizoenkaarthouder die op de lijst staat. */
  lijst: "l",
  bezet: "b",
  geblokkeerd: "g",
  geen: ".",
} as const;

export type SeatCode = (typeof SEAT_CODE)[keyof typeof SEAT_CODE];

export type SeatMapRow = [row: number, firstSeat: number, codes: string];

/** Per vak de rijen, oplopend op rijnummer. */
export type SeatMaps = Record<string, SeatMapRow[]>;

export function buildSeatMaps(
  seats: Iterable<SeatInfo>,
  tickets: Iterable<TicketInfo>,
  listed: readonly NeighborRow[]
): SeatMaps {
  const ticketsByKey = new Map<string, TicketInfo[]>();
  for (const ticket of tickets) {
    const list = ticketsByKey.get(ticket.key);
    if (list) list.push(ticket);
    else ticketsByKey.set(ticket.key, [ticket]);
  }

  const listedKeys = new Set<string>();
  for (const row of listed) {
    for (const seat of row.seats) {
      const key = seatKey(seat.area, seat.row, seat.seat);
      if (key) listedKeys.add(key);
    }
  }

  // vak → rij → stoelnummer → teken
  const areas = new Map<string, Map<number, Map<number, SeatCode>>>();
  for (const seat of seats) {
    if (isExcludedArea(seat.area)) continue;
    const key = seatKey(seat.area, seat.row, seat.seat);
    if (!key) continue;
    const status = seatStatus(seat, ticketsByKey.get(key) ?? []);
    const code = status === "bezet" && listedKeys.has(key) ? SEAT_CODE.lijst : SEAT_CODE[status];

    const area = normalizeArea(seat.area);
    let rows = areas.get(area);
    if (!rows) {
      rows = new Map();
      areas.set(area, rows);
    }
    let row = rows.get(seat.row);
    if (!row) {
      row = new Map();
      rows.set(seat.row, row);
    }
    row.set(seat.seat, code);
  }

  const maps: SeatMaps = {};
  for (const [area, rows] of areas) {
    maps[area] = [...rows]
      .sort((a, b) => a[0] - b[0])
      .map(([rowNumber, row]) => {
        const numbers = [...row.keys()];
        const first = Math.min(...numbers);
        const last = Math.max(...numbers);
        let codes = "";
        for (let seat = first; seat <= last; seat++) codes += row.get(seat) ?? SEAT_CODE.geen;
        return [rowNumber, first, codes];
      });
  }
  return maps;
}
