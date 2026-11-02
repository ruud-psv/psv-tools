import { test } from "node:test";
import assert from "node:assert/strict";
import {
  comparableMatches,
  compareMatch,
  daysUntil,
  freeSeatsFromMaps,
  isStadiumStand,
  opponentOf,
  previousSeasonOf,
  salesPace,
  soldBy,
  summarizeMatch,
} from "./summary";
import type { EventSales } from "../ringside/store";
import type { EventSeatState } from "../ringside/seat-state";

test("tegenstander uit de naam, over schrijfwijzen heen", () => {
  assert.equal(opponentOf("PSV - Ajax"), "ajax");
  assert.equal(opponentOf("PSV - AFC Ajax"), "ajax");
  assert.equal(opponentOf("PSV – FC Twente (Eredivisie)"), "twente");
  assert.equal(opponentOf("PSV - Go Ahead Eagles"), "go ahead eagles");
  assert.equal(opponentOf("Ajax - PSV"), "");
  assert.equal(opponentOf(null), "");
});

test("dagen tot de wedstrijd, 0 is de wedstrijddag", () => {
  assert.equal(daysUntil("2026-11-08 14:30:00", "2026-11-02"), 6);
  assert.equal(daysUntil("2026-11-02T20:00", "2026-11-02"), 0);
  assert.equal(daysUntil("2027-01-01", "2026-12-31"), 1);
  assert.equal(daysUntil(null, "2026-11-02"), null);
});

test("tempo: vandaag, zeven dagen en totaal tot nu", () => {
  const perOffset = { "60": 1000, "10": 50, "7": 30, "6": 20, "4": 10, "3": 5, "2": 99 };
  assert.deepEqual(salesPace(perOffset, 3), { today: 5, last7Days: 65, toDate: 1115 });
  assert.equal(soldBy(perOffset, 0), 1214);
});

test("vorig seizoen", () => {
  assert.equal(previousSeasonOf("26/27"), "25/26");
  assert.equal(previousSeasonOf("00/01"), "99/00");
  assert.equal(previousSeasonOf(""), "");
});

function sales(productId: string, name: string, eventDate: string, season: string, perOffset: Record<string, number>): EventSales {
  const total = Object.values(perOffset).reduce((a, b) => a + b, 0);
  return { productId, name, eventDate, productType: "Event", category: "Wedstrijden", season, perOffset, total };
}

test("vergelijking: zelfde tegenstander en gemiddelde vorig seizoen", () => {
  const all = {
    now: sales("now", "PSV - Ajax", "2026-11-08 14:30", "26/27", { "30": 20000, "5": 1000 }),
    ajax: sales("ajax", "PSV - AFC Ajax", "2026-02-01 14:30", "25/26", { "30": 18000, "5": 2000, "0": 500 }),
    ajaxOld: sales("ajaxOld", "PSV - Ajax", "2025-02-01 14:30", "24/25", { "30": 1 }),
    twente: sales("twente", "PSV - FC Twente", "2025-09-01 20:00", "25/26", { "30": 10000, "1": 4000 }),
    jong: sales("jong", "Jong PSV - Ajax", "2026-01-01 20:00", "25/26", { "30": 300 }),
    future: sales("future", "PSV - Ajax", "2027-03-01 14:30", "26/27", { "30": 5 }),
  };
  const result = compareMatch({ eventId: "now", name: "PSV - Ajax", eventDate: "2026-11-08 14:30" }, 6, all);
  assert.equal(result.soldBy, 20000);
  assert.equal(result.sameOpponent?.eventId, "ajax");
  assert.equal(result.sameOpponent?.soldBy, 18000);
  assert.equal(result.sameOpponent?.total, 20500);
  assert.deepEqual(result.previousSeason, { season: "25/26", matches: 2, soldBy: 14000, total: 17250 });
});

test("bezetting: alleen vakken op de plattegrond, parkeren apart", () => {
  assert.ok(isStadiumStand("a"));
  assert.ok(isStadiumStand("*N"));
  assert.ok(!isStadiumStand("P1 Parkeren"));
  const event: EventSeatState = {
    eventId: "e",
    name: "PSV - Ajax",
    eventDate: "2026-11-08 14:30",
    seats: { s1: ["A", "1", "1", 1], s2: ["A", "1", "2", 1], p1: ["P1 Parkeren", "", "", 3, 50] },
    tickets: { t1: ["s1", "A", "1", "1", 0, "x"], t2: ["p1", "P1 Parkeren", "", "", 0, "y"] },
  };
  const match = summarizeMatch(event);
  assert.equal(match.total.capacity, 2);
  assert.equal(match.total.sold, 1);
  assert.equal(match.total.free, 1);
  assert.equal(match.otherTotal.sold, 1);
  assert.deepEqual(match.areas.map((area) => area.area), ["A"]);
});

test("vrije stoelen uit de stoelenkaart: vrij en resale, de rest niet", () => {
  const free = freeSeatsFromMaps({ A: [[1, 4, "vvb.rg"]], B: [[2, 1, "bb"]] });
  assert.deepEqual(free, [
    { area: "A", row: 1, seat: 4 },
    { area: "A", row: 1, seat: 5 },
    { area: "A", row: 1, seat: 8 },
  ]);
});

test("vergelijkbare wedstrijden: alleen eerdere thuiswedstrijden met verkoop, nieuwste eerst", () => {
  const all = {
    a: sales("a", "PSV - Ajax", "2025-02-01 14:30", "24/25", { "3": 10 }),
    b: sales("b", "PSV - AZ", "2026-03-01 14:30", "25/26", { "3": 10 }),
    c: sales("c", "PSV - Feyenoord", "2026-04-01 14:30", "25/26", {}),
    d: sales("d", "Ajax - PSV", "2026-04-02 14:30", "25/26", { "3": 1 }),
    now: sales("now", "PSV - NEC", "2026-11-08 14:30", "26/27", { "3": 1 }),
  };
  assert.deepEqual(
    comparableMatches(all, "now", "2026-11-08 14:30").map((m) => m.productId),
    ["b", "a"]
  );
});
