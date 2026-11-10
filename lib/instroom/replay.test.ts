import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReplay, eventDateToMs, REPLAY_CODE, replayArea, type StadiumLayout } from "./replay";
import { SCAN_ENTRY, SCAN_OK, type InstroomData, type InstroomScan, type InstroomTicket } from "./state";

const KICKOFF = Date.UTC(2026, 9, 31, 19, 0, 0);
const at = (minutesBeforeKickoff: number) => KICKOFF / 1000 - minutesBeforeKickoff * 60;
const ENTRY = SCAN_OK | SCAN_ENTRY;

const layout: StadiumLayout = {
  seats: [1, 2, 3, 5].map((seat) => ({ area: "A", row: 1, seat })),
  standing: { U: 10 },
  source: "PSV - Go Ahead Eagles",
};

function replay(tickets: Record<string, InstroomTicket>, scans: Record<string, InstroomScan>, kickoffMs: number | null = KICKOFF) {
  const data: InstroomData = { productId: "p", tickets, scans };
  return buildReplay({ match: { productId: "p", name: "PSV - Willem II", kickoffMs }, layout, data });
}

test("de stoel van een scan komt via het ticket", () => {
  const result = replay({ s1: ["A", "1", "2", 1, "p1", "i1"] }, { b1: [at(30), ENTRY, "p1", "c1"] });
  const [row, first, codes, times] = result.areas.find((area) => area.area === "A")!.rows[0];
  assert.deepEqual([row, first, codes], [1, 1, "oso.o"]);
  assert.deepEqual(times, [-1, 0, -1, -1, -1]);
  assert.equal(result.joins.primaryTicket, 1);
  assert.equal(result.totals.entered, 1);
});

test("een scan kan ook naar het product-item of de verkoopregel wijzen", () => {
  const result = replay(
    { s1: ["A", "1", "1", 1, "p1", "i1"], s2: ["A", "1", "2", 1, "p2", "i2"] },
    { b1: [at(30), ENTRY, "i1", ""], b2: [at(20), ENTRY, "s2", ""] }
  );
  assert.deepEqual(result.joins, { onScan: 0, primaryTicket: 0, productItem: 1, salesItem: 1, scannedItem: 0, none: 0 });
  assert.equal(result.totals.entered, 2);
});

test("staat de plek op de scan zelf, dan is die leidend", () => {
  const result = replay({}, { b1: [at(30), ENTRY, "p9", "c9", "Vak a", "1", "3"] });
  assert.equal(result.joins.onScan, 1);
  assert.equal(result.areas.find((area) => area.area === "A")!.rows[0][2], "oos.o");
});

test("per stoel telt de vroegste geslaagde scan naar binnen", () => {
  const result = replay(
    { s1: ["A", "1", "1", 1, "p1", "i1"] },
    {
      mislukt: [at(50), SCAN_ENTRY, "p1", "c1"],
      eruit: [at(45), SCAN_OK, "p1", "c1"],
      laat: [at(10), ENTRY, "p1", "c1"],
      vroeg: [at(40), ENTRY, "p1", "c1"],
    }
  );
  assert.equal(result.start, new Date(at(40) * 1000).toISOString());
  assert.equal(result.duration, 0);
  assert.equal(result.totals.scannedTickets, 1);
  assert.equal(result.totals.failedScans, 1);
});

test("de tijdlijn loopt van de eerste tot de laatste scan", () => {
  const result = replay(
    { s1: ["A", "1", "1", 1, "p1", "i1"], s2: ["A", "1", "2", 1, "p2", "i2"] },
    { b1: [at(90), ENTRY, "p1", ""], b2: [at(-5), ENTRY, "p2", ""] }
  );
  assert.equal(result.duration, 95 * 60);
  assert.deepEqual(result.areas[0].rows[0][3].slice(0, 2), [0, 95 * 60]);
  assert.equal(result.match.kickoff, new Date(KICKOFF).toISOString());
});

test("een scan van dagen eerder rekt de tijdlijn niet op", () => {
  const result = replay(
    { s1: ["A", "1", "1", 1, "p1", "i1"], s2: ["A", "1", "2", 1, "p2", "i2"] },
    { test: [at(3 * 24 * 60), ENTRY, "p1", ""], b2: [at(30), ENTRY, "p2", ""] }
  );
  assert.equal(result.start, new Date(at(6 * 60) * 1000).toISOString());
  assert.equal(result.duration, 5.5 * 3600);
  // De vroege scan valt op het begin.
  assert.deepEqual(result.areas[0].rows[0][3].slice(0, 2), [0, 5.5 * 3600]);
});

test("zonder aftrap bepalen de scans de tijdlijn", () => {
  const result = replay({ s1: ["A", "1", "1", 1, "p1", "i1"] }, { b1: [at(500), ENTRY, "p1", ""] }, null);
  assert.equal(result.start, new Date(at(500) * 1000).toISOString());
  assert.equal(result.match.kickoff, null);
});

test("verkocht maar niet gescand blijft zichtbaar als verkocht", () => {
  const result = replay(
    { s1: ["A", "1", "1", 1, "p1", "i1"], oud: ["A", "1", "2", 0, "p2", "i2"] },
    {}
  );
  assert.equal(result.areas[0].rows[0][2], "soo.o");
  assert.deepEqual(result.totals, {
    capacity: 14,
    sold: 1,
    entered: 0,
    scannedTickets: 0,
    unplaced: 0,
    elsewhere: 0,
    failedScans: 0,
  });
});

test("een stoel die niet in de stoelenkaart staat, komt er door het ticket bij", () => {
  const result = replay({ s1: ["B", "3", "7", 1, "p1", "i1"] }, {});
  assert.deepEqual(result.areas.find((area) => area.area === "B")!.rows, [[3, 7, "s", [-1]]]);
});

test("een staanvak telt scans zonder stoel", () => {
  const result = replay(
    { s1: ["U", "", "", 1, "p1", "i1"], s2: ["U", "", "", 1, "p2", "i2"], s3: ["U", "", "", 1, "p3", "i3"] },
    { b1: [at(60), ENTRY, "p1", ""], b2: [at(30), ENTRY, "p2", ""] }
  );
  assert.deepEqual(result.areas.find((area) => area.area === "U")!.standing, { capacity: 10, sold: 3, times: [0, 1800] });
  assert.equal(result.totals.entered, 2);
});

test("een scan zonder ticket of zonder stoel in een genummerd vak is niet te plaatsen", () => {
  const result = replay({ s1: ["A", "", "", 1, "p1", "i1"] }, { b1: [at(30), ENTRY, "p1", ""], b2: [at(20), ENTRY, "weg", ""] });
  assert.equal(result.totals.unplaced, 2);
  assert.equal(result.totals.entered, 0);
  assert.equal(result.joins.none, 1);
});

test("vakken buiten de plattegrond tellen niet mee", () => {
  const data: InstroomData = {
    productId: "p",
    tickets: { s1: ["P1 Parkeren", "", "", 1, "p1", "i1"] },
    scans: { b1: [at(30), ENTRY, "p1", ""] },
  };
  const result = buildReplay({
    match: { productId: "p", name: "PSV - Willem II", kickoffMs: KICKOFF },
    layout,
    data,
    isStand: (area) => area === "A" || area === "U",
  });
  assert.deepEqual(result.areas.map((area) => area.area), ["A", "U"]);
  assert.equal(result.totals.elsewhere, 1);
});

test("de vaknaam mag met of zonder 'Vak' en in kleine letters", () => {
  assert.equal(replayArea(" vak a "), "A");
  assert.equal(replayArea("UU"), "UU");
  assert.equal(REPLAY_CODE.none, ".");
});

test("de aftrap uit de productenlijst is Nederlandse tijd", () => {
  // Wintertijd: 20:00 in Nederland is 19:00 UTC.
  assert.equal(eventDateToMs("2026-10-31 20:00:00"), Date.UTC(2026, 9, 31, 19, 0, 0));
  // Zomertijd: 21:00 in Nederland is 19:00 UTC.
  assert.equal(eventDateToMs("2021-09-16 21:00:00"), Date.UTC(2021, 8, 16, 19, 0, 0));
  assert.equal(eventDateToMs("2026-11-28T18:45:00+01:00"), Date.UTC(2026, 10, 28, 17, 45, 0));
  assert.equal(eventDateToMs("2026-10-31"), null);
  assert.equal(eventDateToMs(null), null);
});
