import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReplayArea } from "./replay-types";
import { buildScene, enteredAt, scanHistogram } from "./scene";

const areas: ReplayArea[] = [
  { area: "A", rows: [[1, 1, "so.s", [120, -1, -1, 30]]] },
  { area: "U", rows: [], standing: { capacity: 5, sold: 3, times: [10, 60] } },
  { area: "Parkeren", rows: [[1, 1, "s", [5]]] },
];

test("elke stoel en elke staanplek wordt een punt, in de volgorde van de data", () => {
  const scene = buildScene(areas);
  assert.equal(scene.count, 3 + 5);
  assert.deepEqual([...scene.sold.slice(0, 3)], [1, 0, 1]);
  assert.deepEqual([...scene.time.slice(0, 3)], [120, -1, 30]);
  assert.deepEqual(scene.shapes.map((shape) => shape.area), ["A", "U"]);
  assert.deepEqual(scene.missing, ["Parkeren"]);
});

test("een staanvak verdeelt verkocht en gescand over zijn plekken", () => {
  const scene = buildScene(areas);
  const sold = [...scene.sold.slice(3)];
  const times = [...scene.time.slice(3)];
  assert.equal(sold.filter(Boolean).length, 3);
  assert.deepEqual(times.filter((time) => time >= 0).sort((a, b) => a - b), [10, 60]);
  // Wie gescand is, had een kaart.
  times.forEach((time, i) => assert.ok(time < 0 || sold[i] === 1));
});

test("de gescande plekken staan op volgorde van tijd", () => {
  const scene = buildScene(areas);
  assert.deepEqual([...scene.orderTimes], [10, 30, 60, 120]);
  assert.deepEqual([...scene.order].map((i) => scene.time[i]), [10, 30, 60, 120]);
  assert.equal(enteredAt(scene.orderTimes, 0), 0);
  assert.equal(enteredAt(scene.orderTimes, 30), 2);
  assert.equal(enteredAt(scene.orderTimes, 119), 3);
  assert.equal(enteredAt(scene.orderTimes, 500), 4);
});

test("de grafiek telt scans per stukje tijdlijn", () => {
  const times = Int32Array.from([0, 10, 59, 60, 120]);
  assert.deepEqual(scanHistogram(times, 120, 2), [3, 2]);
  assert.deepEqual(scanHistogram(times, 0, 3), [5, 0, 0]);
});
