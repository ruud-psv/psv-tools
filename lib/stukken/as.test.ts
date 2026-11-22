import { test } from "node:test";
import assert from "node:assert/strict";

import { asVerdeling } from "./as";

test("y-as: ronde stappen vanaf nul", () => {
  assert.deepEqual(asVerdeling([364, 33, 279]), { domein: [0, 400], ticks: [0, 100, 200, 300, 400] });
  assert.deepEqual(asVerdeling([2887, 8, 2022]), { domein: [0, 3000], ticks: [0, 1000, 2000, 3000] });
  assert.deepEqual(asVerdeling([0.4, 0.9]), { domein: [0, 1], ticks: [0, 0.2, 0.4, 0.6, 0.8, 1] });
});

test("y-as: negatief of alleen nul laat Recharts kiezen", () => {
  assert.equal(asVerdeling([-3, 5]), null);
  assert.equal(asVerdeling([0, 0]), null);
});
