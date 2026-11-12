import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSalesExport, exportFileName, salesType } from "./export";
import type { EventSeatState } from "../ringside/seat-state";

const event: EventSeatState = {
  eventId: "e1",
  name: "PSV - Go Ahead Eagles",
  eventDate: "2026-11-28T18:45:00+01:00",
  seats: { m1: ["P", "10", "2", 1], m2: ["P", "2", "5", 1] },
  tickets: {
    s1: ["m1", "", "", "", 0, "abc"],
    s2: ["m2", "", "", "", 1, "def"],
    s3: ["", "=GA", "", "", 2, "ghi"],
    s4: ["m9", "W", "1", "1", 0, "jkl", 1],
  },
  resold: { s0: ["m1", "", "", "", "xyz"] },
};

test("sales type per ticket", () => {
  assert.equal(salesType(0), "Sale");
  assert.equal(salesType(1), "Resale - Posted");
  assert.equal(salesType(2), "Resale - Bought");
  assert.equal(salesType(3), "Resale - Posted");
  assert.equal(salesType(0, 1), "Reservation");
});

test("CSV met kopregel, plek uit de stoelenkaart en gesorteerd op vak, rij en stoel", () => {
  const lines = buildSalesExport(event).replace(/^﻿/, "").trimEnd().split("\r\n");
  assert.equal(lines[0], "Wedstrijd;Datum;Vak;Rij;Stoel;Sales type;Eigenaar (anoniem);Ticket ID");
  assert.deepEqual(
    lines.slice(1).map((line) => line.split(";").slice(2, 6).join(";")),
    ["'=GA;;;Resale - Bought", "P;2;5;Resale - Posted", "P;10;2;Sale", "P;10;2;Resold - Refunded", "W;1;1;Reservation"]
  );
  assert.ok(lines[1].startsWith("PSV - Go Ahead Eagles;2026-11-28T18:45:00+01:00;"));
});

test("bestandsnaam", () => {
  assert.equal(exportFileName(event), "verkoop-psv-go-ahead-eagles-2026-11-28.csv");
});
