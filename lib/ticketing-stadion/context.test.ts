import { test } from "node:test";
import assert from "node:assert/strict";
import { freeRuns } from "./context";

test("groepjes vrije stoelen per rij: vrij en resale samen, trap en bezet breken", () => {
  const runs = freeRuns({ A: [[3, 10, "vvb.vrvg"]], B: [[1, 1, "v"]] });
  assert.deepEqual(runs, [
    { area: "A", row: 3, from: 10, to: 11, size: 2 },
    { area: "A", row: 3, from: 14, to: 16, size: 3 },
    { area: "B", row: 1, from: 1, to: 1, size: 1 },
  ]);
});
