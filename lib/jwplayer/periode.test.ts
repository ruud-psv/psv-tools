import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PeriodeFout,
  aantalDagen,
  deltaPct,
  easternDatum,
  jaarEerder,
  kiesPeriode,
  laatsteVolledigeDag,
  plusDagen,
  seizoenStart,
  seizoenVan,
  splitsPeriode,
  vorigePeriode,
} from "./periode";

// 23 november 2026, 07.00 uur in Nederland = 01.00 uur in New York.
const NU = new Date("2026-11-23T06:00:00Z");

test("JW-datum: om 05.00 uur NL (winter) is het in New York nog de dag ervoor", () => {
  assert.equal(easternDatum(new Date("2026-11-23T04:59:00Z")), "2026-11-22");
  assert.equal(easternDatum(new Date("2026-11-23T05:00:00Z")), "2026-11-23");
  // Zomer (EDT, UTC-4): de dag wisselt om 04.00 uur UTC = 06.00 uur NL.
  assert.equal(easternDatum(new Date("2026-07-01T03:59:00Z")), "2026-06-30");
  assert.equal(easternDatum(new Date("2026-07-01T04:00:00Z")), "2026-07-01");
  assert.equal(laatsteVolledigeDag(NU), "2026-11-22");
});

test("presets eindigen op de laatste volledige dag en vergelijken met de periode ervoor", () => {
  const k = kiesPeriode({ preset: "7d" }, NU);
  assert.deepEqual(k.periode, { van: "2026-11-16", tot: "2026-11-22" });
  assert.deepEqual(k.vorige, { van: "2026-11-09", tot: "2026-11-15" });
  assert.equal(k.dataThrough, "2026-11-22");
  assert.equal(aantalDagen(kiesPeriode({ preset: "90d" }, NU).periode), 90);
  assert.deepEqual(kiesPeriode({}, NU).periode, { van: "2026-10-24", tot: "2026-11-22" });
});

test("seizoen loopt vanaf 1 juli; vergelijken met dezelfde dagen een seizoen eerder", () => {
  assert.equal(seizoenVan("2026-11-22"), "2026-27");
  assert.equal(seizoenVan("2026-06-30"), "2025-26");
  assert.equal(seizoenVan("1999-08-01"), "1999-00");
  assert.equal(seizoenStart("2027-02-01"), "2026-07-01");
  const k = kiesPeriode({ preset: "season" }, NU);
  assert.deepEqual(k.periode, { van: "2026-07-01", tot: "2026-11-22" });
  assert.deepEqual(k.vorige, { van: "2025-07-01", tot: "2025-11-22" });
  assert.deepEqual(jaarEerder({ van: "2024-02-29", tot: "2024-03-01" }), { van: "2023-02-28", tot: "2023-03-01" });
});

test("eigen bereik: afkappen op de laatste volledige dag, en fouten", () => {
  const k = kiesPeriode({ start_date: "2026-11-01", end_date: "2026-12-31" }, NU);
  assert.deepEqual(k.periode, { van: "2026-11-01", tot: "2026-11-22" });
  assert.deepEqual(k.vorige, vorigePeriode(k.periode));
  assert.deepEqual(k.vorige, { van: "2026-10-10", tot: "2026-10-31" });
  assert.throws(() => kiesPeriode({ start_date: "2026-11-30" }, NU), PeriodeFout);
  assert.throws(() => kiesPeriode({ start_date: "2026-02-30", end_date: "2026-03-01" }, NU), PeriodeFout);
  assert.throws(() => kiesPeriode({ start_date: "2020-01-01", end_date: "2026-01-01" }, NU), PeriodeFout);
  assert.throws(() => kiesPeriode({ preset: "1y" as never }, NU), PeriodeFout);
});

test("hulpjes: dagen, delta en splitsen", () => {
  assert.equal(plusDagen("2026-01-01", -1), "2025-12-31");
  assert.equal(deltaPct(120, 100), 20);
  assert.equal(deltaPct(1, 3), -66.7);
  assert.equal(deltaPct(5, 0), null);
  assert.equal(deltaPct(null, 5), null);
  assert.deepEqual(splitsPeriode({ van: "2026-01-01", tot: "2026-01-10" }, 4), [
    { van: "2026-01-01", tot: "2026-01-04" },
    { van: "2026-01-05", tot: "2026-01-08" },
    { van: "2026-01-09", tot: "2026-01-10" },
  ]);
});
