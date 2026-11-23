import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MODEL_PLEKKEN,
  actiefModel,
  fallbackVoor,
  kenmerkenUitCapabilities,
  modelNaam,
  outputConfigVoor,
  plek,
  standaardKenmerken,
  type ModelKeuze,
} from "./config";

test("plekken: unieke ids, en elk standaardmodel is een Claude-model", () => {
  const ids = MODEL_PLEKKEN.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of MODEL_PLEKKEN) assert.match(p.standaard, /^claude-/);
});

test("standaardKenmerken: effort en fallbacks per model", () => {
  assert.deepEqual(standaardKenmerken("claude-opus-5-5"), { effort: true, fallbacks: true });
  assert.deepEqual(standaardKenmerken("claude-haiku-5-5"), { effort: true, fallbacks: false });
  assert.deepEqual(standaardKenmerken("claude-haiku-4-5-20251001"), { effort: false, fallbacks: false });
  assert.deepEqual(standaardKenmerken("claude-sonnet-4-5"), { effort: false, fallbacks: false });
  assert.equal(standaardKenmerken("claude-opus-4-5").effort, true);
  assert.equal(standaardKenmerken("claude-opus-4-1").effort, false);
  assert.equal(standaardKenmerken("claude-sonnet-4-6").effort, true);
});

test("actiefModel: zonder keuze het standaardmodel, met keuze het gekozen model", () => {
  const assistent = plek("assistent");
  assert.deepEqual(actiefModel(assistent), {
    model: "claude-opus-5-5",
    kenmerken: { effort: true, fallbacks: true },
    gekozen: false,
  });
  const keuze: ModelKeuze = {
    model: "claude-haiku-4-5",
    kenmerken: { effort: false, fallbacks: false },
    gewijzigdOp: "2026-11-23T10:00:00Z",
    gewijzigdDoor: "admin@psv.nl",
  };
  const actief = actiefModel(assistent, keuze);
  assert.equal(actief.model, "claude-haiku-4-5");
  assert.equal(actief.gekozen, true);
  // Een model zonder effort of fallback krijgt die parameters niet mee.
  assert.deepEqual(outputConfigVoor(actief, assistent), {});
  assert.deepEqual(fallbackVoor(actief), {});
});

test("outputConfigVoor en fallbackVoor: wat de plek en het model samen toestaan", () => {
  const assistent = plek("assistent");
  const actief = actiefModel(assistent);
  assert.deepEqual(outputConfigVoor(actief, assistent), { output_config: { effort: "medium" } });
  assert.deepEqual(fallbackVoor(actief), { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
  // Een plek zonder effort stuurt er geen mee, ook niet bij een model dat hem kent.
  const titel = plek("assistent-titel");
  assert.deepEqual(outputConfigVoor(actiefModel(titel), titel), {});
});

test("kenmerkenUitCapabilities: de Models API wint, anders de terugval", () => {
  assert.equal(kenmerkenUitCapabilities("claude-haiku-4-5", { effort: { supported: true } }).effort, true);
  assert.equal(kenmerkenUitCapabilities("claude-opus-5-5", { effort: { supported: false } }).effort, false);
  assert.equal(kenmerkenUitCapabilities("claude-haiku-4-5", null).effort, false);
  assert.equal(kenmerkenUitCapabilities("claude-opus-5-5", {}).fallbacks, true);
});

test("modelNaam: leesbare naam uit het id", () => {
  assert.equal(modelNaam("claude-opus-5-5"), "Claude Opus 5.5");
  assert.equal(modelNaam("claude-opus-5"), "Claude Opus 5");
  assert.equal(modelNaam("claude-haiku-4-5-20251001"), "Claude Haiku 4.5");
  assert.equal(modelNaam("iets-anders"), "iets-anders");
});
