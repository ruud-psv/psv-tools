import { test } from "node:test";
import assert from "node:assert/strict";
import { findNeighbors, seatKey, type Holder, type SeatInfo, type TicketInfo } from "./neighbors";
import { buildSeatMaps } from "./seat-map";

function seat(area: string, row: number, number: number, sellable = true): SeatInfo {
  return { area, row, seat: number, sellable };
}

function ticket(area: string, row: number, number: number, resalePosted = false): TicketInfo {
  return { key: seatKey(area, row, number)!, resalePosted, owner: null };
}

test("per rij één teken per stoelnummer, met een punt voor een gat", () => {
  // Rij 1: stoel 1 bezet door een houder op de lijst, 2 vrij, 3 bestaat niet,
  // 4 via de resale vrij, 5 bezet. Rij 2: 2 geblokkeerd.
  const seats = [1, 2, 4, 5].map((n) => seat("n", 1, n)).concat(seat("N", 2, 2, false));
  const tickets = [ticket("N", 1, 1), ticket("N", 1, 4, true), ticket("N", 1, 5)];
  const holders: Holder[] = [{ relationNumber: "1", area: "N", row: 1, seat: 1 }];
  const { rows } = findNeighbors(seats, tickets, holders);
  assert.deepEqual(buildSeatMaps(seats, tickets, rows), {
    N: [
      [1, 1, "lv.rb"],
      [2, 2, "g"],
    ],
  });
});

test("een bezette stoel blijft bezet, ook als Ringside hem niet meetelt", () => {
  const seats = [seat("A", 1, 1, false)];
  assert.deepEqual(buildSeatMaps(seats, [ticket("A", 1, 1)], []), { A: [[1, 1, "b"]] });
});

test("uitgesloten vakken staan er niet in", () => {
  const seats = [seat("RSA", 1, 1), seat("V", 1, 1), seat("Bezoekers", 1, 1), seat("VV", 1, 1)];
  assert.deepEqual(Object.keys(buildSeatMaps(seats, [], [])), ["VV"]);
});

test("evenveel vrije stoelen als in de telling", () => {
  const seats: SeatInfo[] = [];
  for (const area of ["N", "O"]) for (let row = 1; row <= 6; row++) for (let n = 1; n <= 8; n++) seats.push(seat(area, row, n, n !== 7));
  const tickets = seats.filter((s) => (s.row * s.seat) % 3 !== 0).map((s) => ticket(s.area, s.row, s.seat, s.seat === 8));
  const { rows, stats } = findNeighbors(seats, tickets, []);
  const maps = buildSeatMaps(seats, tickets, rows);
  for (const area of ["N", "O"]) {
    const codes = maps[area].map(([, , c]) => c).join("");
    assert.equal(codes.replace(/[^vr]/g, "").length, stats.freeByArea[area], area);
    assert.equal(codes.replace(/[^r]/g, "").length, stats.freeFromResaleByArea[area] ?? 0, area);
  }
});
