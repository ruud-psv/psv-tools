import { test } from "node:test";
import assert from "node:assert/strict";

import { NIEUW_BLOK_LABEL, leesGetal, nieuwBlok, toonGetal } from "./bewerken";
import { leesBlok, type BlokType } from "./model";

test("elk nieuw blok uit de toevoegknop is geldig volgens de regels van de server", () => {
  for (const type of Object.keys(NIEUW_BLOK_LABEL) as BlokType[]) {
    assert.deepEqual(leesBlok(nieuwBlok(type)), nieuwBlok(type), type);
  }
});

test("getallen zoals een collega ze typt", () => {
  assert.equal(leesGetal("1400"), 1400);
  assert.equal(leesGetal("1.400"), 1400);
  assert.equal(leesGetal("1.400.000"), 1400000);
  assert.equal(leesGetal("1.400,5"), 1400.5);
  assert.equal(leesGetal("12,4"), 12.4);
  assert.equal(leesGetal("12.4"), 12.4);
  assert.equal(leesGetal("-3"), -3);
  assert.equal(leesGetal("€ 374.610"), 374610);
  assert.equal(leesGetal("12,4%"), 12.4);
  assert.equal(leesGetal(""), null);
  assert.equal(leesGetal("veel"), null);
  assert.equal(leesGetal("1,2,3"), null);
  assert.equal(toonGetal(1400.5), "1400,5");
  assert.equal(leesGetal(toonGetal(1234567.25)), 1234567.25);
});
