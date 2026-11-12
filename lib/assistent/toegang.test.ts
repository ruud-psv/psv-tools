import { test } from "node:test";
import assert from "node:assert/strict";

import { invoerSchema, leesInvoer, toolsVoor } from "./toegang";

const tools = [
  { name: "stadion", page: "/dashboard/ticketing-stadion" },
  { name: "fandesk", page: "/dashboard/fandesk" },
];

const metDatum = {
  velden: {
    van: { type: "string" as const, description: "Eerste dag, als JJJJ-MM-DD.", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    tot: { type: "string" as const, description: "Laatste dag, als JJJJ-MM-DD.", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  },
  verplicht: ["van"],
};

test("alleen tools van pagina's die je mag zien", () => {
  assert.deepEqual(
    toolsVoor(["/dashboard/fandesk", "/dashboard/utm-builder"], tools).map((t) => t.name),
    ["fandesk"]
  );
  assert.deepEqual(toolsVoor([], tools), []);
});

test("schema: velden en verplichte velden, zonder het patroon", () => {
  const schema = invoerSchema(metDatum);
  assert.deepEqual(schema.required, ["van"]);
  assert.deepEqual(Object.keys(schema.properties), ["van", "tot"]);
  assert.equal("pattern" in schema.properties.van, false);
});

test("invoer: opgeschoond, optionele velden mogen ontbreken", () => {
  assert.deepEqual(leesInvoer(metDatum, { van: " 2026-11-01 ", tot: null, extra: "x" }), {
    invoer: { van: "2026-11-01" },
  });
});

test("invoer: ontbrekend, verkeerd type of verkeerd patroon geeft een melding", () => {
  assert.ok("fout" in leesInvoer(metDatum, {}));
  assert.ok("fout" in leesInvoer(metDatum, null));
  assert.ok("fout" in leesInvoer(metDatum, { van: 20261101 }));
  assert.ok("fout" in leesInvoer(metDatum, { van: "gisteren" }));
});
