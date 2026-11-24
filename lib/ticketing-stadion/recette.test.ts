import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRecette, DEFAULT_TARGET_CENTS } from "./recette";
import { euroToCents, settingsFor, emptyRecetteSettings } from "./recette-store";
import type { EventSales } from "../ringside/sales-series";

const settings = { targetCents: DEFAULT_TARGET_CENTS, uptake: 0.84, customTarget: false };

function sales(extra: Partial<Pick<EventSales, "series" | "revenueCents" | "areaPriceCents">> = {}) {
  return {
    series: { vrij: { "10": 3000 }, resale: { "10": 1120 }, seizoenkaart: {}, vrijkaart: {} },
    // 3.000 × €49,50 en 1.120 × €46.
    revenueCents: { vrij: { "10": 3000 * 4950 }, resale: { "10": 1120 * 4600 }, seizoenkaart: {}, vrijkaart: {} },
    areaPriceCents: { A: 4950, B: 4950 },
    ...extra,
  };
}

test("het voorbeeld: 3.700 aangeboden tegen €49,50, 84% afname", () => {
  // 700 nog vrij, verdeeld over twee vakken; het uitvak telt niet mee.
  const areas = [
    { area: "A", free: 400, resale: 30 },
    { area: "B", free: 300, resale: 10 },
    { area: "BEZOEKERS", free: 900, resale: 0 },
  ];
  const r = computeRecette(sales(), areas, settings)!;

  assert.equal(r.free.offered, 3700);
  assert.equal(r.free.potentialCents, 18_315_000); // €183.150
  assert.equal(r.free.expectedCents, 15_384_600); // €153.846
  assert.equal(r.free.averageCents, 4950);
  assert.equal(r.free.soldShare, 3000 / 3700);

  assert.equal(r.resale.revenueCents, 5_152_000); // €51.520
  assert.equal(r.resale.expectedTargetCents, DEFAULT_TARGET_CENTS - 15_384_600); // €93.006,94
  assert.equal(r.resale.shortfallCents, DEFAULT_TARGET_CENTS - 15_384_600 - 5_152_000); // €41.486,94
  assert.equal(r.resale.minimumTargetCents, DEFAULT_TARGET_CENTS - 18_315_000);

  // Resale-aanbod tegen de vakprijs.
  assert.equal(r.resale.offered, 40);
  assert.equal(r.resale.offeredValueCents, 40 * 4950);
  assert.equal(r.resale.soldShare, 1120 / 1160);

  assert.equal(r.recetteCents, 3000 * 4950 + 1120 * 4600);
  assert.equal(r.statusCents, DEFAULT_TARGET_CENTS - r.recetteCents);
});

test("een duur vak dat nog vrij is, telt tegen zijn eigen prijs", () => {
  const r = computeRecette(sales({ areaPriceCents: { A: 4950, SKY: 15000 } }), [
    { area: "A", free: 10, resale: 0 },
    { area: "sky", free: 2, resale: 0 },
  ], settings)!;
  assert.equal(r.free.potentialCents, 3000 * 4950 + 10 * 4950 + 2 * 15000);
});

test("een vak zonder prijs telt tegen het gemiddelde, en wordt gemeld", () => {
  const r = computeRecette(sales({ areaPriceCents: {} }), [{ area: "X", free: 5, resale: 2 }], settings)!;
  assert.equal(r.free.unpricedSeats, 5);
  assert.equal(r.free.potentialCents, 3000 * 4950 + 5 * 4950);
  assert.equal(r.resale.offeredValueCents, 2 * 4600);
});

test("zonder bedragen geen recette; zonder verkoop geen gemiddelde", () => {
  assert.equal(computeRecette({ ...sales(), revenueCents: null }, [], settings), null);
  assert.equal(computeRecette(null, [], settings), null);
  const empty = computeRecette(
    sales({
      series: { vrij: {}, resale: {}, seizoenkaart: {}, vrijkaart: {} },
      revenueCents: { vrij: {}, resale: {}, seizoenkaart: {}, vrijkaart: {} },
    }),
    [],
    settings
  )!;
  assert.equal(empty.free.averageCents, null);
  assert.equal(empty.free.soldShare, null);
  assert.equal(empty.free.progressShare, null);
  assert.equal(empty.resale.soldShare, null);
});

test("instellingen: target per wedstrijd gaat voor de standaard", () => {
  const stored = { ...emptyRecetteSettings(), targets: { abc: 100_00 } };
  assert.deepEqual(settingsFor(stored, "abc"), { targetCents: 100_00, uptake: 0.84, customTarget: true });
  assert.equal(settingsFor(stored, "xyz").targetCents, DEFAULT_TARGET_CENTS);
  assert.equal(euroToCents("246852.94"), DEFAULT_TARGET_CENTS);
  assert.equal(euroToCents(-1), null);
  assert.equal(euroToCents("abc"), null);
});

test("invoer: komma als decimaalteken, punt als duizendtal (of als decimaal zonder komma)", async () => {
  const { parseDecimalInput, centsToInput } = await import("./recette");
  assert.equal(parseDecimalInput("246.852,94"), 246852.94);
  assert.equal(parseDecimalInput("246852,94"), 246852.94);
  assert.equal(parseDecimalInput("246852.94"), 246852.94);
  assert.equal(parseDecimalInput("€ 250.000"), 250000);
  assert.equal(parseDecimalInput("1.250.000"), 1250000);
  assert.equal(parseDecimalInput("84"), 84);
  assert.equal(parseDecimalInput("84,5"), 84.5);
  assert.equal(parseDecimalInput("abc"), null);
  assert.equal(parseDecimalInput(""), null);
  assert.equal(centsToInput(24_685_294), "246852,94");
});
