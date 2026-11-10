import { test } from "node:test";
import assert from "node:assert/strict";
import type { EventSales } from "../ringside/store";
import { describeTarget, findInstroomMatch } from "./match";

const event = (productId: string, name: string, eventDate: string, total = 100): EventSales => ({
  productId,
  name,
  eventDate,
  productType: "Event",
  category: "Wedstrijden",
  season: "26/27",
  perOffset: {},
  total,
});

const sales = Object.fromEntries(
  [
    event("a", "PSV - Willem II", "2026-10-31 20:00:00", 30000),
    event("b", "PSV - Willem II | Parkeren", "2026-10-31 20:00:00", 400),
    event("c", "PSV - Willem II", "2025-03-01 18:45:00"),
    event("d", "Jong PSV - Willem II", "2026-10-31 20:00:00"),
    event("e", "Willem II - PSV", "2026-10-31 20:00:00"),
    event("f", "PSV - Ajax", "2026-10-31 20:00:00"),
  ].map((entry) => [entry.productId, entry])
);

test("de wedstrijd wordt gevonden op tegenstander en datum", () => {
  assert.equal(findInstroomMatch(sales)?.productId, "a");
  assert.equal(findInstroomMatch(sales, { opponent: "willem ii", date: "2025-03-01" })?.productId, "c");
});

test("staat hij er niet in, dan komt er niets terug", () => {
  assert.equal(findInstroomMatch(sales, { opponent: "Willem II", date: "2026-11-01" }), null);
  assert.equal(findInstroomMatch({}), null);
});

test("de omschrijving noemt tegenstander en datum", () => {
  assert.equal(describeTarget(), "PSV - Willem II op 31 oktober 2026");
});
