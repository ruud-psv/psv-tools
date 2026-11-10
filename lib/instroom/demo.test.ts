import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemoReplay } from "./demo";
import { buildScene } from "./scene";

test("het voorbeeld is een vol stadion dat het scherm helemaal kan tekenen", () => {
  const replay = buildDemoReplay();
  assert.equal(replay.demo, true);
  assert.ok(replay.totals.capacity > 30_000 && replay.totals.capacity < 40_000);
  assert.ok(replay.totals.entered > 0.8 * replay.totals.sold);
  assert.equal(replay.totals.unplaced, 0);
  assert.ok(replay.duration > 2 * 3600);

  const scene = buildScene(replay.areas);
  assert.deepEqual(scene.missing, []);
  assert.equal(scene.count, replay.totals.capacity);
  // Elke plek die het scherm laat oplichten, telt mee in "binnen".
  assert.equal(scene.order.length, replay.totals.entered);
});

test("het voorbeeld is elke keer hetzelfde", () => {
  assert.deepEqual(buildDemoReplay().totals, buildDemoReplay().totals);
});
