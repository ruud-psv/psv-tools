import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSalesExport, exportFileName, ticketStatus } from "./export";
import { toNeighborInput, type EventSeatState } from "../ringside/seat-state";
import { buildSeatMaps, SEAT_CODE } from "../aangrenzende-stoelen/seat-map";
import { isStadiumStand } from "./summary";

// Vlaggen van een stoel: 1 = verkoopbaar, 2 = staanvak.
const event: EventSeatState = {
  eventId: "e1",
  name: "PSV - Go Ahead Eagles",
  eventDate: "2026-11-28T18:45:00+01:00",
  seats: {
    m1: ["NN", "10", "2", 1], // bezet, doorverkocht
    m2: ["NN", "2", "5", 1], // aangeboden in de resale
    m3: ["NN", "2", "6", 1], // vrij
    m4: ["NN", "2", "7", 0], // geblokkeerd
    m5: ["NN", "3", "1", 1], // bezet
    m6: ["=X", "1", "1", 1], // geen vak van de plattegrond: weg
    m7: ["OO", "", "", 3, 700], // staanvak
  },
  tickets: {
    s1: ["m1", "", "", "", 2, "koper"],
    s2: ["m2", "", "", "", 1, "def"],
    s4: ["m5", "", "", "", 0, "jkl", 1],
    s5: ["", "OO", "", "", 0, "mno"],
  },
  resold: { s0: ["m1", "", "", "", "verkoper", "Sale"] },
  details: { s2: ["Sale", "Requested"], s4: ["Reservation", ""] },
};

test("status uit Ringside, of anders uit de vlaggen", () => {
  assert.deepEqual(ticketStatus(1, undefined, ["Reservation Confirmation", "Requested"]), {
    saleType: "Reservation Confirmation",
    status: "Requested",
  });
  assert.deepEqual(ticketStatus(0, undefined, undefined), { saleType: "Sale", status: "" });
  assert.deepEqual(ticketStatus(1, undefined, undefined), { saleType: "Sale", status: "Posted" });
  assert.deepEqual(ticketStatus(0, 1, undefined), { saleType: "Reservation", status: "" });
});

test("per stoel een regel met de status van de plattegrond", () => {
  const lines = buildSalesExport(event).replace(/^﻿/, "").trimEnd().split("\r\n");
  assert.equal(
    lines[0],
    "Wedstrijd;Datum;Vak;Rij;Stoel;Plattegrond;Sales type;Status;Via resale;Eigenaar (anoniem);Ticket ID"
  );
  assert.deepEqual(
    lines.slice(1).map((line) => line.split(";").slice(2).join(";")),
    [
      "NN;2;5;Vrij via resale;Sale;Requested;nee;def;s2",
      "NN;2;6;Vrij;;;;;",
      "NN;2;7;Geblokkeerd;;;;;",
      "NN;3;1;Bezet;Reservation;;nee;jkl;s4",
      "NN;10;2;Doorverkocht via resale;Sale;;ja;koper;s1",
      "NN;10;2;Doorverkocht via resale;Sale;Resold - Refunded;;verkoper;s0",
      "OO;;;Staanvak;Sale;;nee;mno;s5",
    ]
  );
  assert.ok(lines[1].startsWith("PSV - Go Ahead Eagles;2026-11-28T18:45:00+01:00;"));
});

test("bestandsnaam", () => {
  assert.equal(exportFileName(event), "verkoop-psv-go-ahead-eagles-2026-11-28.csv");
});

test("zelfde status per stoel als de plattegrond van de wedstrijdpagina", () => {
  const { seats, tickets } = toNeighborInput(event);
  const maps = buildSeatMaps(seats, tickets, [], { includeExcluded: true });
  const fromMap = new Map<string, string>();
  for (const [area, rows] of Object.entries(maps)) {
    if (!isStadiumStand(area)) continue;
    for (const [row, first, codes] of rows) {
      [...codes].forEach((code, i) => {
        if (code !== SEAT_CODE.geen) fromMap.set(`${area}|${row}|${first + i}`, code);
      });
    }
  }
  const codeOf: Record<string, string> = {
    Vrij: SEAT_CODE.vrij,
    "Vrij via resale": SEAT_CODE.resale,
    Bezet: SEAT_CODE.bezet,
    "Doorverkocht via resale": SEAT_CODE.doorverkocht,
    Geblokkeerd: SEAT_CODE.geblokkeerd,
  };
  const fromExport = new Map<string, string>();
  for (const line of buildSalesExport(event).replace(/^﻿/, "").trimEnd().split("\r\n").slice(1)) {
    const [, , area, row, seat, plattegrond] = line.split(";");
    if (codeOf[plattegrond]) fromExport.set(`${area}|${row}|${seat}`, codeOf[plattegrond]);
  }
  assert.deepEqual(fromExport, fromMap);
});
