import { test } from "node:test";
import assert from "node:assert/strict";
import { playedHomeMatches } from "./match";

const products = [
  { productId: "a", name: "PSV - Willem II", eventDate: "2026-10-31 20:00:00" },
  { productId: "b", name: "PSV - Ajax", eventDate: "2026-09-20 14:30:00" },
  { productId: "c", name: "PSV - AZ", eventDate: "2026-11-28 18:45:00" },
  { productId: "d", name: "PSV - Feyenoord", eventDate: "2026-03-01 14:30:00" },
  { productId: "e", name: "Jong PSV - Willem II", eventDate: "2026-10-30 20:00:00" },
  { productId: "f", name: "Willem II - PSV", eventDate: "2026-08-15 20:00:00" },
  { productId: "g", name: "PSV Vrouwen - Ajax Vrouwen", eventDate: "2026-10-01 20:00:00" },
];

test("de keuzelijst: gespeelde thuiswedstrijden van PSV 1 dit seizoen, de laatste bovenaan", () => {
  assert.deepEqual(playedHomeMatches(products, "2026-11-10").map((match) => match.productId), ["a", "b"]);
});

test("een wedstrijd van vandaag staat erbij, een komende niet", () => {
  assert.deepEqual(playedHomeMatches(products, "2026-11-28").map((match) => match.productId), ["c", "a", "b"]);
});

test("een ander seizoen geeft andere wedstrijden", () => {
  assert.deepEqual(playedHomeMatches(products, "2026-11-10", "25/26").map((match) => match.productId), ["d"]);
  assert.deepEqual(playedHomeMatches([], "2026-11-10"), []);
});
