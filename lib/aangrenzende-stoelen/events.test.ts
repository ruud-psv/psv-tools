import { test } from "node:test";
import assert from "node:assert/strict";
import { isPsvHomeMatch } from "./events";

test("thuiswedstrijden van het eerste elftal", () => {
  for (const name of ["PSV - Willem II", "PSV - Ajax", "psv-AZ 22/23", "PSV – Bayern München"]) {
    assert.equal(isPsvHomeMatch(name), true, name);
  }
});

test("geen uitwedstrijden, Jong PSV, vrouwen of andere evenementen", () => {
  for (const name of [
    "Willem II - PSV",
    "Jong PSV - Willem II",
    "Willem II - Jong PSV 25/26",
    "PSV Vrouwen - Ajax Vrouwen",
    "PSV - Ajax Vrouwen",
    "FC Twente Vrouwen - PSV Vrouwen",
    "Stadiontour",
    "PSV Museum",
    "Zakelijk groepen",
    "",
    null,
  ]) {
    assert.equal(isPsvHomeMatch(name), false, String(name));
  }
});
