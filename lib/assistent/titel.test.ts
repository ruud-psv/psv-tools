import { test } from "node:test";
import assert from "node:assert/strict";

import { schoneTitel } from "./titel";

test("titel: schoon, zonder aanhalingstekens, voorvoegsel of punt", () => {
  assert.equal(schoneTitel("Ticketverkoop PSV - Go Ahead Eagles"), "Ticketverkoop PSV - Go Ahead Eagles");
  assert.equal(schoneTitel('"Coen Dillen-campagne in de FANstore".'), "Coen Dillen-campagne in de FANstore");
  assert.equal(schoneTitel("Titel: Paid Ads oktober\nToelichting die er niet bij hoort"), "Paid Ads oktober");
  assert.equal(schoneTitel("**Webverkeer psv.nl**"), "Webverkeer psv.nl");
  assert.equal(schoneTitel("\n\n  Seizoenskaarten   wachtlijst \n"), "Seizoenskaarten wachtlijst");
});

test("titel: leeg wordt null, te lang wordt op een woord afgekapt", () => {
  assert.equal(schoneTitel(""), null);
  assert.equal(schoneTitel(' "" '), null);
  const lang = schoneTitel("Een heel lange titel die veel meer woorden heeft dan in de lijst met gesprekken past");
  assert.ok(lang && lang.length <= 61 && lang.endsWith("…"));
  assert.ok(!lang!.slice(0, -1).endsWith(" "));
});
