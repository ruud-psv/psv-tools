import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findNeighbors,
  isExcludedArea,
  seatKey,
  toCsv,
  type Holder,
  type SeatInfo,
  type TicketInfo,
} from "./neighbors";

/** Een vak met `rows` rijen van `seats` stoelen, allemaal verkoopbaar. */
function block(area: string, rows: number[], seats: number[], sellable = true): SeatInfo[] {
  return rows.flatMap((row) => seats.map((seat) => ({ area, row, seat, sellable })));
}

function ticket(area: string, row: number, seat: number, extra: Partial<TicketInfo> = {}): TicketInfo {
  return { key: seatKey(area, row, seat)!, resalePosted: false, owner: null, ...extra };
}

/** Elke stoel bezet door een seizoenkaarthouder met een eigen relatienummer, behalve `free`. */
function fullHouse(seats: SeatInfo[], free: string[]) {
  const holders: Holder[] = [];
  const tickets: TicketInfo[] = [];
  for (const seat of seats) {
    const key = seatKey(seat.area, seat.row, seat.seat)!;
    if (free.includes(key)) continue;
    const relationNumber = `${seat.area}${seat.row}-${seat.seat}`;
    holders.push({ relationNumber, area: seat.area, row: seat.row, seat: seat.seat });
    tickets.push(ticket(seat.area, seat.row, seat.seat, { owner: relationNumber }));
  }
  return { holders, tickets };
}

function relations(result: ReturnType<typeof findNeighbors>): string[] {
  return result.rows.map((row) => row.relationNumber).sort();
}

test("één vrije stoel levert de vier buren op", () => {
  const seats = block("N", [10, 11, 12], [1, 2, 3, 4, 5]);
  const { holders, tickets } = fullHouse(seats, ["N|11|3"]);
  const result = findNeighbors(seats, tickets, holders);
  assert.deepEqual(relations(result), ["N10-3", "N11-2", "N11-4", "N12-3"]);
  assert.equal(result.stats.freeSeats, 1);
  assert.deepEqual(result.stats.freeByArea, { N: 1 });
  assert.deepEqual(result.stats.freeFromResaleByArea, {});
  assert.deepEqual(result.stats.listedSeatsByArea, { N: 4 });
});

test("een gat in de nummering is geen buur", () => {
  // Stoel 3 bestaat niet (trap): 2 en 4 zijn geen buren van elkaar.
  const seats = block("A", [5], [1, 2, 4, 5]);
  const { holders, tickets } = fullHouse(seats, ["A|5|4"]);
  const result = findNeighbors(seats, tickets, holders);
  assert.deepEqual(relations(result), ["A5-5"]);
});

test("buren alleen binnen hetzelfde vak", () => {
  const seats = [...block("N", [1], [1, 2]), ...block("O", [1], [3])];
  const { holders, tickets } = fullHouse(seats, ["N|1|2"]);
  const result = findNeighbors(seats, tickets, holders);
  // O|1|3 heeft wel nummer 3, maar ligt in een ander vak.
  assert.deepEqual(relations(result), ["N1-1"]);
});

test("bij een blok vrije stoelen alleen de randen, plus voor en achter", () => {
  const seats = block("P", [1, 2], [1, 2, 3, 4, 5]);
  const { holders, tickets } = fullHouse(seats, ["P|1|2", "P|1|3", "P|1|4"]);
  const result = findNeighbors(seats, tickets, holders);
  assert.deepEqual(relations(result), ["P1-1", "P1-5", "P2-2", "P2-3", "P2-4"]);
});

test("geblokkeerde stoelen en uitgesloten vakken tellen niet als vrij", () => {
  const killed = block("K", [1], [1, 2, 3]).map((seat) => ({ ...seat, sellable: seat.seat !== 2 }));
  const wheelchair = block("RSA", [1], [1, 2, 3]);
  const seats = [...killed, ...wheelchair];
  const { holders, tickets } = fullHouse(seats, ["K|1|2", "RSA|1|2"]);
  const result = findNeighbors(seats, tickets, holders);
  assert.equal(result.stats.freeSeats, 0);
  assert.deepEqual(result.rows, []);
});

test("uitgesloten vakken", () => {
  for (const area of ["RSA", "rsk", "V", "W", "X", "Y", "Bezoekers"]) assert.equal(isExcludedArea(area), true, area);
  for (const area of ["*N", "VV", "N", "A"]) assert.equal(isExcludedArea(area), false, area);
});

test("een stoel in de resale telt als vrij", () => {
  const seats = block("T", [3], [1, 2, 3]);
  const { holders, tickets } = fullHouse(seats, []);
  const posted = tickets.map((t) => (t.key === "T|3|2" ? { ...t, resalePosted: true } : t));
  const result = findNeighbors(seats, posted, holders);
  assert.deepEqual(relations(result), ["T3-1", "T3-3"]);
  assert.equal(result.stats.freeFromResale, 1);
  assert.deepEqual(result.stats.freeFromResaleByArea, { T: 1 });
  assert.deepEqual(result.stats.listedSeatsByArea, { T: 2 });
});

test("wie zelf de stoel ernaast aanbiedt, wordt niet benaderd", () => {
  const seats = block("C", [8], [1, 2, 3]);
  const holders: Holder[] = [
    { relationNumber: "111", area: "C", row: 8, seat: 1 },
    { relationNumber: "222", area: "C", row: 8, seat: 2 },
    { relationNumber: "222", area: "C", row: 8, seat: 3 },
  ];
  const tickets = [
    ticket("C", 8, 1, { owner: "eigenaar-111" }),
    ticket("C", 8, 2, { owner: "eigenaar-222", resalePosted: true }),
    ticket("C", 8, 3, { owner: "eigenaar-222" }),
  ];
  const result = findNeighbors(seats, tickets, holders);
  assert.deepEqual(relations(result), ["111"]);
  assert.equal(result.stats.skippedOwnResale, 1);
});

test("zonder eigenaar uit Ringside valt de vergelijking terug op het relatienummer", () => {
  const seats = block("C", [8], [1, 2, 3]);
  const holders: Holder[] = [
    { relationNumber: "111", area: "C", row: 8, seat: 1 },
    { relationNumber: "222", area: "C", row: 8, seat: 2 },
    { relationNumber: "222", area: "C", row: 8, seat: 3 },
  ];
  const tickets = [ticket("C", 8, 1), ticket("C", 8, 2, { resalePosted: true }), ticket("C", 8, 3)];
  assert.deepEqual(relations(findNeighbors(seats, tickets, holders)), ["111"]);
});

test("alleen wie er deze wedstrijd ook zit", () => {
  const seats = block("D", [4], [1, 2, 3, 4, 5]);
  const holders: Holder[] = [1, 2, 4, 5].map((seat) => ({ relationNumber: `r${seat}`, area: "D", row: 4, seat }));
  const tickets = [
    // r2 heeft zijn eigen kaart in de resale gezet: zijn stoel is zelf vrij.
    ticket("D", 4, 2, { resalePosted: true, owner: "x" }),
    // r4 heeft een geldig ticket.
    ticket("D", 4, 4, { owner: "y" }),
    // r5 heeft geen ticket voor deze wedstrijd.
  ];
  const result = findNeighbors(seats, tickets, holders);
  // Vrij: 2 (resale), 3 (leeg), 5 (leeg; r5 heeft geen ticket), 1 (leeg).
  // Alleen r4 zit er echt en grenst aan 3 en 5.
  assert.deepEqual(relations(result), ["r4"]);
  assert.deepEqual(result.rows[0].seats, [{ area: "D", row: 4, seat: 4 }]);
});

test("grens op het aantal stoelen per relatienummer", () => {
  const seats = block("E", [1], [1, 2, 3]);
  const holders: Holder[] = [
    { relationNumber: "groot", area: "E", row: 1, seat: 1 },
    { relationNumber: "groot", area: "E", row: 1, seat: 3 },
  ];
  const tickets = [ticket("E", 1, 1), ticket("E", 1, 3)];
  assert.deepEqual(relations(findNeighbors(seats, tickets, holders)), ["groot"]);
  const capped = findNeighbors(seats, tickets, holders, { maxSeatsPerRelation: 1 });
  assert.deepEqual(capped.rows, []);
  assert.equal(capped.stats.skippedTooManySeats, 1);
});

test("één regel per relatienummer, met alleen de aangrenzende stoelen", () => {
  const seats = block("F", [1], [1, 2, 3, 4, 5, 6]);
  const holders: Holder[] = [
    { relationNumber: "123", area: "F", row: 1, seat: 1 },
    { relationNumber: "123", area: "F", row: 1, seat: 3 },
    { relationNumber: "123", area: "F", row: 1, seat: 6 },
  ];
  const tickets = [ticket("F", 1, 1), ticket("F", 1, 3), ticket("F", 1, 6)];
  // Vrij: 2, 4, 5. Stoel 1, 3 en 6 grenzen allemaal aan een vrije stoel.
  const result = findNeighbors(seats, tickets, holders);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(
    result.rows[0].seats.map((seat) => seat.seat),
    [1, 3, 6]
  );
  assert.equal(
    toCsv(result.rows, true),
    "﻿relatienummer;vak;rij;stoel\r\n123;F, F, F;1, 1, 1;1, 3, 6\r\n"
  );
  assert.equal(toCsv(result.rows, false), "﻿relatienummer\r\n123\r\n");
});

test("seizoenkaartstoelen die niet in de stoelenkaart staan worden geteld", () => {
  const seats = block("G", [1], [1, 2]);
  const holders: Holder[] = [
    { relationNumber: "1", area: "G", row: 1, seat: 1 },
    { relationNumber: "2", area: "G", row: 9, seat: 9 },
  ];
  const result = findNeighbors(seats, [ticket("G", 1, 1)], holders);
  assert.equal(result.stats.holderSeatsUnknown, 1);
});
