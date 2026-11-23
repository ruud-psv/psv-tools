import { test } from "node:test";
import assert from "node:assert/strict";

import { insightSchema, object, uitgelicht } from "./runner";

test("insightSchema: alle velden verplicht en niets extra, zoals structured outputs vraagt", () => {
  const schema = insightSchema({ topPerformer: uitgelicht("name", "metric", "why") }) as {
    required: string[];
    additionalProperties: boolean;
    properties: Record<string, unknown>;
  };
  assert.deepEqual(schema.required, ["summary", "highlights", "recommendations", "topPerformer"]);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.topPerformer, {
    anyOf: [object({ name: { type: "string" }, metric: { type: "string" }, why: { type: "string" } }), { type: "null" }],
  });
});
