import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSalesExport, exportFileName, ticketStatus } from "./export";
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
  resold: { s0: ["m1", "", "", "", "xyz", "Sale"] },
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

test("CSV met kopregel, plek uit de stoelenkaart en gesorteerd op vak, rij en stoel", () => {
  const lines = buildSalesExport(event).replace(/^﻿/, "").trimEnd().split("\r\n");
  assert.equal(lines[0], "Wedstrijd;Datum;Vak;Rij;Stoel;Sales type;Status;Via resale;Eigenaar (anoniem);Ticket ID");
  assert.deepEqual(
    lines.slice(1).map((line) => line.split(";").slice(2, 8).join(";")),
    [
      "'=GA;;;Sale;;ja",
      "P;2;5;Sale;Requested;nee",
      "P;10;2;Sale;;nee",
      "P;10;2;Sale;Resold - Refunded;",
      "W;1;1;Reservation;;nee",
    ]
  );
  assert.ok(lines[1].startsWith("PSV - Go Ahead Eagles;2026-11-28T18:45:00+01:00;"));
});

test("bestandsnaam", () => {
  assert.equal(exportFileName(event), "verkoop-psv-go-ahead-eagles-2026-11-28.csv");
});
