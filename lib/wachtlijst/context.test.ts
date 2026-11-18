import { test } from "node:test";
import assert from "node:assert/strict";

import type { WaitlistAnalysis } from "./analysis";
import { productenVoor, wachtlijstContext } from "./context";
import { emptyWaitlistData } from "./data";
import type { WaitlistStatus } from "./status";

const dagen = Array.from({ length: 40 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 10 + i));
  return { day: d.toISOString().slice(0, 10), joined: i % 3, left: i % 5 === 0 ? 1 : 0, size: 1000 + i };
});

const analyse: WaitlistAnalysis = {
  today: "2026-11-18",
  size: {
    people: 1039,
    signups: 1050,
    everPeople: 1400,
    perProduct: [{ productId: "w", name: "Wachtlijst", people: 1039, signups: 1050 }],
  },
  flow: {
    months: [
      { month: "2026-10", joined: 40, left: 5, size: 1020 },
      { month: "2026-11", joined: 25, left: 6, size: 1039 },
    ],
    days: dagen,
    last7: { joined: 7, left: 1 },
    last30: { joined: 30, left: 6 },
    joinedTotal: 1400,
    firstSignup: "2019-05-01",
    leftDateEstimated: 3,
    leftTotal: 361,
  },
  waiting: { buckets: [{ label: "< 1 jaar", count: 300 }, { label: "1-3 jaar", count: 739 }], medianDays: 640 },
  age: { buckets: [{ label: "18-24", count: 200 }], known: 900, unknown: 139, average: 34.2, median: 31, averageRecent: 27.5, knownRecent: 80 },
  postcode: {
    known: 1000,
    netherlands: 950,
    belgium: 30,
    germany: 10,
    other: 10,
    unknown: 39,
    regions: [{ code: "56", count: 420 }],
    top: [{ code: "5611", count: 40 }],
    distinct: 300,
  },
  quality: { rows: 1050, saleTypes: {}, rowsWithoutOwner: 0, peopleWithoutClient: 39 },
};

const status = {
  salesComplete: true,
  salesCaughtUpAt: "2026-11-18T03:30:00.000Z",
  lastRunAt: "2026-11-18T03:31:00.000Z",
  lastError: null,
  clientsToLookUp: 0,
} as WaitlistStatus;

test("producten: de wachtlijst zelf, de pre wachtlijst of alles", () => {
  const data = emptyWaitlistData();
  data.products = { w: { name: "Wachtlijst", type: "Memberships" }, p: { name: "Pre wachtlijst", type: "Memberships" } };
  assert.deepEqual(productenVoor(data, "wachtlijst"), ["w"]);
  assert.deepEqual(productenVoor(data, "pre"), ["p"]);
  assert.equal(productenVoor(data, "alle"), null);
});

test("tekst: omvang, verloop, wachttijd, leeftijd en postcode, alleen aantallen", () => {
  const tekst = wachtlijstContext(analyse, status, { productNamen: ["Wachtlijst"] });
  assert.match(tekst, /^WACHTLIJST \(stand 2026-11-18; Wachtlijst\)/);
  assert.match(tekst, /Nu op de wachtlijst: 1\.039 mensen \(1\.050 inschrijvingen\)\. Ooit op de wachtlijst gestaan: 1\.400\./);
  assert.match(tekst, /Laatste 7 dagen: 7 erbij, 1 eraf\. Laatste 30 dagen: 30 erbij, 6 eraf\./);
  assert.match(tekst, /van 3 keer eraf is de datum geschat/);
  assert.match(tekst, /2026-11 \| 25 \| 6 \| 1039/);
  assert.match(tekst, /PER DAG \(laatste 14 dagen\)/);
  assert.equal(tekst.split("\n").filter((r) => /^\d{4}-\d{2}-\d{2} \|/.test(r)).length, 14);
  assert.match(tekst, /Mediaan 640 dagen/);
  assert.match(tekst, /Gemiddeld 34\.2, mediaan 31\. Gemiddeld bij wie zich de laatste 90 dagen inschreef: 27\.5/);
  assert.match(tekst, /Grootste postcodegebieden \(eerste twee cijfers\): 56: 420/);
  assert.doesNotMatch(tekst, /Let op/);
});

test("tekst: een gekozen periode per dag, begrensd, en de stand van het inlezen", () => {
  const tekst = wachtlijstContext(analyse, { ...status, salesComplete: false, clientsToLookUp: 12, lastError: "HTTP 500" }, {
    productNamen: ["Wachtlijst"],
    van: "2026-10-12",
    tot: "2026-10-14",
  });
  assert.match(tekst, /PER DAG van 2026-10-12 tot en met 2026-10-14/);
  assert.deepEqual(
    tekst.split("\n").filter((r) => /^2026-10-1\d \|/.test(r)).map((r) => r.slice(0, 10)),
    ["2026-10-12", "2026-10-13", "2026-10-14"]
  );
  assert.match(tekst, /Let op: de verkoop wordt nog ingelezen; aantallen kunnen nog stijgen; van 12 mensen moeten leeftijd en postcode nog worden opgezocht; het laatste inlezen gaf een fout: HTTP 500\./);
  assert.match(wachtlijstContext(analyse, status, { productNamen: [], van: "2027-01-01" }), /geen dagen in deze periode/);
});
