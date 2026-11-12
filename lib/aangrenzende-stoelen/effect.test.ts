import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyEffectSale,
  emptyEffectData,
  TICKET_CURRENT,
  TICKET_POSTED,
  TICKET_RESOLD,
  TICKET_SEASON,
  TICKET_VENUE_RESALE,
  type EffectTicket,
} from "./effect-data";
import {
  analyzeMailEffect,
  formatAmsterdamDateTime,
  occupiedAt,
  parseAmsterdamDateTime,
  parseRelationNumbers,
  toEffectCsv,
} from "./effect";
import type { Holder, SeatInfo } from "./neighbors";

const MAIL = parseAmsterdamDateTime("2026-11-03T20:00")!;
const HOUR = 3600;
const DAY = 24 * HOUR;

test("Nederlandse tijd heen en terug, in de winter en de zomer", () => {
  assert.equal(new Date(MAIL * 1000).toISOString(), "2026-11-03T19:00:00.000Z");
  assert.equal(new Date(parseAmsterdamDateTime("2026-07-01 20:00")! * 1000).toISOString(), "2026-07-01T18:00:00.000Z");
  assert.equal(formatAmsterdamDateTime(MAIL), "2026-11-03 20:00");
  assert.equal(formatAmsterdamDateTime(MAIL + 4 * HOUR + 30 * 60), "2026-11-04 00:30");
  assert.equal(parseAmsterdamDateTime("3 november"), null);
});

test("relatienummers uit geplakte tekst", () => {
  assert.deepEqual(parseRelationNumbers("4039525, 4045477\n93081795;0004039525 4045477"), [
    "4039525",
    "4045477",
    "93081795",
  ]);
  assert.deepEqual(parseRelationNumbers(""), []);
});

test("een verkoopregel: alleen tickets van deze wedstrijd, laatste versie wint, delete haalt weg", () => {
  const data = emptyEffectData("match");
  const row = {
    sales_item_id: "S1",
    product_id: "MATCH",
    item_type: "Ticket",
    sale_type: "Sale",
    current_status: true,
    resale_status: "Posted",
    subscription_instance_id: "abc",
    transaction_date: "2026-11-03T19:30:00",
    own_client_guid: "client-1",
    area: "a",
    row: "10",
    seat: "6",
  };
  assert.equal(applyEffectSale(data, { ...row, product_id: "other" }), false);
  assert.equal(applyEffectSale(data, { ...row, item_type: "Merchandise" }), false);
  assert.equal(applyEffectSale(data, row), true);
  const [ticket] = Object.values(data.tickets);
  assert.deepEqual(ticket.slice(0, 4), ["a", "10", "6", MAIL + 30 * 60]);
  assert.equal(ticket[4], TICKET_CURRENT | TICKET_POSTED | TICKET_SEASON);
  assert.equal(ticket[6], "Sale");
  assert.ok(ticket[5]);

  // Een nieuwe versie die geen ticket meer is, en een delete zonder product.
  applyEffectSale(data, { ...row, current_status: false, resale_status: "Resold - Refunded" });
  assert.equal(Object.values(data.tickets)[0][4], TICKET_RESOLD | TICKET_SEASON);
  assert.equal(applyEffectSale(data, { _ringside_operation: "D", sales_item_id: "S1" }), true);
  assert.deepEqual(data.tickets, {});
});

test("bezet op een moment: geldig ticket, of vervallen zonder retour ertussen", () => {
  const sale = (at: number, current: boolean) => ({ at, flags: current ? TICKET_CURRENT : 0, owner: "x", saleType: "Sale" });
  const end = (at: number, saleType = "Return") => ({ at, flags: 0, owner: "x", saleType });
  assert.equal(occupiedAt([sale(MAIL - DAY, true)], MAIL), true);
  assert.equal(occupiedAt([sale(MAIL + HOUR, true)], MAIL), false);
  // Teruggegeven vóór de mail: vrij. Na de mail: bij de mail nog bezet.
  assert.equal(occupiedAt([sale(MAIL - DAY, false), end(MAIL - HOUR)], MAIL), false);
  assert.equal(occupiedAt([sale(MAIL - DAY, false), end(MAIL + HOUR)], MAIL), true);
  // Een geannuleerde reservering.
  assert.equal(occupiedAt([end(MAIL - HOUR, "Reservation Cancellation"), sale(MAIL - DAY, false)], MAIL), false);
  // Doorgezet zonder retour: de stoel bleef bezet.
  assert.equal(occupiedAt([sale(MAIL - DAY, false)], MAIL), true);
});

function t(
  area: string,
  row: number,
  seat: number,
  at: number,
  owner: string,
  flags = TICKET_CURRENT,
  saleType = "Sale"
): EffectTicket {
  return [area, String(row), String(seat), at, flags, owner, saleType];
}

function seatMap(...keys: [string, number, number, boolean?][]): SeatInfo[] {
  return keys.map(([area, row, seat, sellable = true]) => ({ area, row, seat, sellable }));
}

const SEASON = TICKET_CURRENT | TICKET_SEASON;
const LONG_AGO = MAIL - 90 * DAY;

test("per relatienummer: vrije buurstoelen bij de mail, wie ze kocht, en ter vergelijking de rest", () => {
  const holders: Holder[] = [
    { relationNumber: "111", area: "A", row: 10, seat: 5 },
    { relationNumber: "222", area: "A", row: 10, seat: 4 },
    { relationNumber: "333", area: "B", row: 1, seat: 1 },
    { relationNumber: "444", area: "C", row: 5, seat: 5 },
    { relationNumber: "555", area: "D", row: 3, seat: 3 },
    { relationNumber: "666", area: "E", row: 7, seat: 7 },
  ];
  const seats = seatMap(
    ["A", 10, 4],
    ["A", 10, 5],
    ["A", 10, 6],
    ["A", 9, 5],
    ["B", 1, 1],
    ["B", 1, 2],
    ["B", 2, 1],
    ["C", 5, 5],
    ["C", 5, 6],
    ["D", 3, 3],
    ["D", 3, 4],
    ["E", 7, 7],
    ["E", 7, 8, false],
    ["H", 1, 1],
    ["H", 1, 2],
    ["V", 1, 1]
  );
  const tickets: EffectTicket[] = [
    // 111 kocht na de mail zelf de stoel naast zich. Voor hem (rij 9) had iemand
    // een kaart die vóór de mail is teruggegeven: vrij, en niet verkocht.
    t("A", 10, 5, LONG_AGO, "o111", SEASON),
    t("A", 10, 4, LONG_AGO, "o222", SEASON),
    t("A", 10, 6, MAIL + 2 * HOUR, "o111"),
    t("A", 9, 5, MAIL - 5 * DAY, "oX", 0),
    t("A", 9, 5, MAIL - 2 * DAY, "oX", 0, "Return"),
    // 333: de stoel naast hem kocht iemand anders, de volgende dag.
    t("B", 1, 1, LONG_AGO, "o333", SEASON),
    t("B", 2, 1, LONG_AGO, "oY", SEASON),
    t("B", 1, 2, MAIL + 30 * HOUR, "oZ"),
    // 444: de stoel naast hem stond (waarschijnlijk) in de resale en is na de mail doorverkocht.
    t("C", 5, 5, LONG_AGO, "o444", SEASON),
    t("C", 5, 6, LONG_AGO, "oS", TICKET_RESOLD | TICKET_SEASON),
    t("C", 5, 6, MAIL + HOUR, "oS", 0, "Return"),
    t("C", 5, 6, MAIL + HOUR, "oB", TICKET_CURRENT | TICKET_VENUE_RESALE),
    // 555: de stoel naast hem was twee uur voor de mail al verkocht.
    t("D", 3, 3, LONG_AGO, "o555", SEASON),
    t("D", 3, 4, MAIL - 2 * HOUR, "oQ"),
    // 666: geen vrije buurstoel (E 7 8 is geblokkeerd), maar kocht na de mail een kaart in H.
    t("E", 7, 7, LONG_AGO, "o666", SEASON),
    t("H", 1, 1, MAIL + DAY, "o666"),
    // Parkeren telt niet als extra kaart, het sfeervak V doet niet mee.
    t("P1", 1, 1, MAIL + DAY, "o666"),
  ];

  const result = analyzeMailEffect({
    tickets,
    seats,
    holders,
    relationNumbers: ["111", "333", "444", "555", "666", "999"],
    mailAt: MAIL,
  });
  const by = Object.fromEntries(result.relations.map((relation) => [relation.relationNumber, relation]));

  assert.equal(by["111"].outcome, "zelf gekocht");
  assert.deepEqual(
    by["111"].neighbors.map((n) => [n.row, n.seat, n.direction, n.atMail, n.buyer, n.soldAt]),
    [
      [9, 5, "voor", "vrij", null, null],
      [10, 6, "naast", "vrij", "zelf", MAIL + 2 * HOUR],
    ]
  );
  assert.equal(by["111"].extraTickets, 1);

  assert.equal(by["333"].outcome, "door ander gekocht");
  assert.deepEqual(by["333"].neighbors.map((n) => [n.row, n.seat, n.buyer]), [[1, 2, "ander"]]);

  assert.equal(by["444"].outcome, "door ander gekocht");
  assert.deepEqual(
    by["444"].neighbors.map((n) => [n.atMail, n.buyer, n.viaResale]),
    [["resale", "ander", true]]
  );

  assert.equal(by["555"].outcome, "geen vrije buurstoel");
  assert.deepEqual(by["555"].neighbors.map((n) => [n.atMail, n.soldAt]), [["net verkocht", MAIL - 2 * HOUR]]);

  assert.equal(by["666"].outcome, "zelf gekocht, andere stoel");
  assert.equal(by["666"].extraTickets, 1);
  assert.deepEqual(by["666"].neighbors, []);

  assert.equal(by["999"].outcome, "niet in de lijst");

  const { totals } = result;
  assert.equal(totals.relations, 6);
  assert.equal(totals.byOutcome["zelf gekocht"], 1);
  assert.equal(totals.byOutcome["door ander gekocht"], 2);
  assert.equal(totals.freeNeighborSeats, 4);
  assert.equal(totals.freeNeighborFromResale, 1);
  assert.equal(totals.soldNeighborSeats, 3);
  assert.equal(totals.soldNeighborSeatsSelf, 1);
  assert.equal(totals.soldNeighborSeatsWithin24h, 2);
  // H 1 1 (door 666 gekocht) en H 1 2; V is uitgesloten, E 7 8 geblokkeerd.
  assert.equal(totals.otherFreeSeats, 2);
  assert.equal(totals.otherSoldSeats, 1);
  assert.equal(totals.extraTicketsSelf, 2);
});

test("zonder eigenaar van de eigen stoel is de koper onbekend", () => {
  const result = analyzeMailEffect({
    tickets: [t("A", 1, 1, LONG_AGO, "", SEASON), t("A", 1, 2, MAIL + HOUR, "oZ")],
    seats: seatMap(["A", 1, 1], ["A", 1, 2]),
    holders: [{ relationNumber: "1", area: "A", row: 1, seat: 1 }],
    relationNumbers: ["1"],
    mailAt: MAIL,
  });
  assert.equal(result.relations[0].outcome, "verkocht, koper onbekend");
  assert.equal(result.relations[0].ownerKnown, false);
});

test("CSV: een regel per buurstoel, en een regel zonder buurstoel", () => {
  const result = analyzeMailEffect({
    tickets: [t("A", 10, 5, LONG_AGO, "o1", SEASON), t("A", 10, 6, MAIL + 2 * HOUR, "o1")],
    seats: seatMap(["A", 10, 5], ["A", 10, 6]),
    holders: [
      { relationNumber: "1", area: "A", row: 10, seat: 5 },
      { relationNumber: "2", area: "B", row: 1, seat: 1 },
    ],
    relationNumbers: ["1", "2", "3"],
    mailAt: MAIL,
  });
  const lines = toEffectCsv(result.relations).split("\r\n");
  assert.ok(lines[0].startsWith("﻿relatienummer;uitkomst;vak;rij;stoel;buurstoel rij"));
  assert.equal(lines[1], "1;zelf gekocht;A;10;5;10;6;naast;vrij;ja;2026-11-03 22:00;houder zelf;nee;nee;1");
  assert.equal(lines[2], "2;geen vrije buurstoel;B;1;1;;;;;;;;;;0");
  assert.equal(lines[3], "3;niet in de lijst;;;;;;;;;;;;;0");
});
