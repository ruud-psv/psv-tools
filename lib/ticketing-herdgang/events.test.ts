import { test } from "node:test";
import assert from "node:assert/strict";
import { isHerdgangMatch } from "./events";

test("thuiswedstrijden van Jong PSV en PSV Vrouwen", () => {
  for (const name of ["Jong PSV - FC Den Bosch", "PSV Vrouwen - Ajax Vrouwen", "psv vrouwen – FC Twente Vrouwen"]) {
    assert.equal(isHerdgangMatch(name), true, name);
  }
});

test("geen uitwedstrijden, eerste elftal of andere evenementen", () => {
  for (const name of [
    "FC Twente Vrouwen - PSV Vrouwen",
    "FC Den Bosch - Jong PSV",
    "PSV - Willem II",
    "Stadiontour",
    "",
    null,
  ]) {
    assert.equal(isHerdgangMatch(name), false, String(name));
  }
});
