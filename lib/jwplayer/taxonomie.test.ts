import { test } from "node:test";
import assert from "node:assert/strict";

import { parseTags, pastBij, tagLabel, tagLijst } from "./taxonomie";

test("tags met prefix: hoofdletters en spaties tellen niet, eerste per prefix wint", () => {
  const t = parseTags(["Type: Persconferentie", "team:PSV1", "seizoen:2026-27", "type:interview", "eredivisie"]);
  assert.equal(t.type, "persconferentie");
  assert.equal(t.team, "psv1");
  assert.equal(t.seizoen, "2026-27");
  assert.deepEqual(t.overig, ["eredivisie"]);
});

test("behind the scenes met spaties wordt de sleutel met streepjes", () => {
  assert.equal(parseTags(["type: behind the scenes"]).type, "behind-the-scenes");
  assert.equal(tagLabel("type", "behind-the-scenes"), "Behind the scenes");
});

test("zonder type-tag: Ongecategoriseerd; ongeldig seizoen telt niet", () => {
  const t = parseTags("team:vrouwen, seizoen:dit-jaar");
  assert.equal(t.type, null);
  assert.equal(tagLabel("type", t.type), "Ongecategoriseerd");
  assert.equal(t.seizoen, null);
  assert.deepEqual(t.overig, ["seizoen:dit-jaar"]);
  assert.equal(tagLabel("team", "vrouwen"), "PSV Vrouwen");
});

test("onbekende waarde onder een bekende prefix telt onder die waarde", () => {
  assert.equal(parseTags(["type:podcast"]).type, "podcast");
  assert.equal(tagLabel("type", "podcast"), "podcast");
});

test("tagLijst en filters op sleutel of naam", () => {
  assert.deepEqual(tagLijst("a, b ,,c"), ["a", "b", "c"]);
  assert.deepEqual(tagLijst(null), []);
  const t = parseTags(["type:persconferentie", "team:psv1"]);
  assert.ok(pastBij(t, { type: "persconferentie" }));
  assert.ok(pastBij(t, { type: "Persconferentie", team: "PSV 1" }));
  assert.ok(!pastBij(t, { team: "vrouwen" }));
  assert.ok(pastBij(parseTags([]), { type: "Ongecategoriseerd" }));
  assert.ok(!pastBij(t, { type: "ongecategoriseerd" }));
});
