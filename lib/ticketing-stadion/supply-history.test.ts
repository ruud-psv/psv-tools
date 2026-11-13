import { test } from "node:test";
import assert from "node:assert/strict";
import { emptySupplyHistory, recordSupply, SUPPLY_RETENTION_DAYS, supplySeries, type SupplyHistory } from "./supply-history";

const ajax = { eventId: "a", name: "PSV - Ajax", eventDate: "2026-11-28T18:45:00+01:00", total: { free: 1200, resale: 300 } };

test("legt de stand van vandaag vast en overschrijft hem binnen dezelfde dag", () => {
  const first = recordSupply(emptySupplyHistory(), [ajax], "2026-11-13");
  assert.equal(first.changed, true);
  assert.deepEqual(first.history.matches.a.days, { "2026-11-13": [1200, 300] });

  const later = recordSupply(first.history, [{ ...ajax, total: { free: 1150, resale: 320 } }], "2026-11-13");
  assert.equal(later.changed, true);
  assert.deepEqual(later.history.matches.a.days, { "2026-11-13": [1150, 320] });

  const nextDay = recordSupply(later.history, [{ ...ajax, total: { free: 1100, resale: 310 } }], "2026-11-14");
  assert.deepEqual(nextDay.history.matches.a.days, { "2026-11-13": [1150, 320], "2026-11-14": [1100, 310] });
});

test("niets te schrijven als de stand niet veranderde", () => {
  const { history } = recordSupply(emptySupplyHistory(), [ajax], "2026-11-13");
  const again = recordSupply(history, [ajax], "2026-11-13");
  assert.equal(again.changed, false);
  assert.equal(again.history, history);
});

test("muteert de vorige historie niet", () => {
  const { history } = recordSupply(emptySupplyHistory(), [ajax], "2026-11-13");
  const snapshot = structuredClone(history);
  recordSupply(history, [{ ...ajax, total: { free: 1, resale: 2 } }], "2026-11-13");
  assert.deepEqual(history, snapshot);
});

test("een gespeelde wedstrijd houdt zijn eindstand", () => {
  const { history } = recordSupply(emptySupplyHistory(), [ajax], "2026-11-28");
  const after = recordSupply(history, [{ ...ajax, total: { free: 0, resale: 0 } }], "2026-11-29");
  assert.equal(after.changed, false);
  assert.deepEqual(after.history.matches.a.days, { "2026-11-28": [1200, 300] });
});

test("ruimt wedstrijden op die lang voorbij zijn", () => {
  const old: SupplyHistory = {
    matches: { oud: { name: "PSV - FC Utrecht", eventDate: "2025-08-10T20:00:00+02:00", days: { "2025-08-09": [10, 2] } } },
  };
  const kept = recordSupply(old, [], "2026-01-01");
  assert.equal(kept.changed, false);

  const day = new Date(Date.UTC(2025, 7, 10 + SUPPLY_RETENTION_DAYS + 1)).toISOString().slice(0, 10);
  const pruned = recordSupply(old, [], day);
  assert.equal(pruned.changed, true);
  assert.deepEqual(pruned.history.matches, {});
});

test("reeks zonder gaten, met dagen tot de wedstrijd, zonder dagen na de wedstrijd", () => {
  const points = supplySeries(
    { "2026-11-26": [900, 200], "2026-11-24": [1000, 250], "2026-11-29": [0, 0] },
    "2026-11-26T18:45:00+01:00"
  );
  assert.deepEqual(points, [
    { date: "2026-11-24", daysOut: 2, free: 1000, resale: 250 },
    { date: "2026-11-25", daysOut: 1, free: null, resale: null },
    { date: "2026-11-26", daysOut: 0, free: 900, resale: 200 },
  ]);
});

test("reeks zonder wedstrijddatum en zonder metingen", () => {
  assert.deepEqual(supplySeries({}, "2026-11-26"), []);
  assert.deepEqual(supplySeries({ "2026-11-24": [5, 1] }, null), [{ date: "2026-11-24", daysOut: null, free: 5, resale: 1 }]);
});
