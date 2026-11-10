import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDailyBars, offsetDateLabel } from "./daily-bars";

test("de grafiek loopt van 28 dagen voor de wedstrijd tot de wedstrijddag", () => {
  const { rows } = buildDailyBars([{ id: "a", perOffset: { "28": 5, "0": 2, "40": 9 } }]);
  assert.equal(rows.length, 29);
  assert.deepEqual(rows[0], { offset: 28, values: { a: 5 } });
  assert.deepEqual(rows[28], { offset: 0, values: { a: 2 } });
  assert.equal(rows[10].values.a, 0);
});

test("wat eerder verkocht is, staat apart; verkoop na de wedstrijd telt niet mee", () => {
  const { before, inWindow } = buildDailyBars([{ id: "a", perOffset: { "60": 100, "29": 1, "28": 5, "3": 7, "-1": 4 } }]);
  assert.deepEqual(before, { a: 101 });
  assert.deepEqual(inWindow, { a: 12 });
});

test("dagen die nog moeten komen zijn leeg, niet nul", () => {
  const { rows } = buildDailyBars([
    { id: "nu", perOffset: { "10": 3 }, daysOut: 9 },
    { id: "toen", perOffset: { "10": 4, "2": 6 } },
  ]);
  const at = (offset: number) => rows.find((row) => row.offset === offset)!.values;
  assert.deepEqual(at(10), { nu: 3, toen: 4 });
  assert.deepEqual(at(9), { nu: 0, toen: 0 });
  assert.deepEqual(at(2), { nu: null, toen: 6 });
});

test("de datum bij een dag", () => {
  assert.equal(offsetDateLabel("2026-10-31 18:45:00", 0), "31/10");
  assert.equal(offsetDateLabel("2026-10-31 18:45:00", 3), "28/10");
  assert.equal(offsetDateLabel("2026-11-02T20:00:00+01:00", 5), "28/10");
  assert.equal(offsetDateLabel("onbekend", 1), "");
});
