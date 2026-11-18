import { test } from "node:test";
import assert from "node:assert/strict";
import { isTest, koopredenIn, perKoopreden, testOverzicht } from "./methode";
import type { PaidAdsAd, PaidAdsAdSet, PaidAdsCampaign, PaidMetrics } from "./types";

function metrics(spend: number, results: number): PaidMetrics {
  return { spend, impressions: 1000, reach: 800, clicks: 50, results, revenue: 0 };
}

function ad(id: string, name: string, spend: number, results: number, adSetId = "s1", campaignId = "c1"): PaidAdsAd {
  return {
    id,
    name,
    adSetId,
    campaignId,
    platform: "meta",
    phase: "conversie",
    format: null,
    hook: null,
    videoViews3s: null,
    thumbnailUrl: null,
    active: true,
    metrics: metrics(spend, results),
  };
}

const set = (id: string, name: string, campaignId = "c1"): PaidAdsAdSet => ({
  id,
  name,
  campaignId,
  platform: "meta",
  phase: "conversie",
  audienceType: null,
  targeting: null,
  metrics: metrics(0, 0),
});

const campaign = (id: string, businessUnit: string): PaidAdsCampaign => ({
  id,
  name: `PSV | ${businessUnit} | Conversie | Campagne`,
  platform: "meta",
  phase: "conversie",
  businessUnit,
  objective: "Aankopen",
  campaignGroup: null,
  metrics: metrics(0, 0),
});

test("koopreden uit de naam: label, trefwoord, of geen", () => {
  assert.equal(koopredenIn("PSV | Ticketing | Matchday | 4:5"), "matchday");
  assert.equal(koopredenIn("Trots & Identiteit - video"), "trots");
  assert.equal(koopredenIn("Voorverkoop thuisshirt"), "alseerste");
  assert.equal(koopredenIn("Erbij horen | lid"), "erbijhoren");
  assert.equal(koopredenIn("Retargeting kopers 30d"), null);
  // Alleen hele woorden: "samenvatting" is geen "samen".
  assert.equal(koopredenIn("Samenvatting seizoen"), null);
});

test("een test heeft 'test' als los woord in de naam", () => {
  assert.ok(isTest("Matchday | TEST | 9:16"));
  assert.ok(isTest(undefined, "Set test nostalgie"));
  assert.ok(!isTest("Testimonial speler"));
  assert.ok(!isTest("Matchday 4:5"));
});

test("koopreden van de set als de advertentie er geen noemt; zonder koopreden onder Onbekend", () => {
  const rijen = perKoopreden(
    [ad("a1", "Video 1", 100, 4, "s1"), ad("a2", "Beeld 2", 50, 1, "s2")],
    [set("s1", "Speler | Broad"), set("s2", "Broad")]
  );
  assert.deepEqual(
    rijen.map((r) => [r.key, r.metrics.spend]),
    [
      ["speler", 100],
      ["onbekend", 50],
    ]
  );
});

test("tests: aandeel, drempel van € 150, en alleen vergelijken binnen exploitatie en fase", () => {
  const ads = [
    // Bewezen ticketing: € 600 voor 20 resultaten, CPA € 30.
    ad("b1", "Matchday 4:5", 600, 20, "s1", "c1"),
    // Bewezen merchandise met een veel lagere CPA: mag de ticketingtest niet beïnvloeden.
    ad("b2", "Speler 4:5", 200, 40, "s3", "c2"),
    ad("t1", "Nostalgie TEST", 200, 10, "s1", "c1"), // CPA € 20: beter
    ad("t2", "Samen TEST", 160, 2, "s1", "c1"), // CPA € 80: slechter
    ad("t3", "Verhaal TEST", 100, 1, "s1", "c1"), // onder € 150: te vroeg
  ];
  const overzicht = testOverzicht(ads, [set("s1", "Broad"), set("s3", "Broad", "c2")], [
    campaign("c1", "Ticketing"),
    campaign("c2", "Merchandise"),
  ]);

  assert.equal(overzicht.testSpend, 460);
  assert.equal(Math.round(overzicht.aandeel!), 37);
  const oordeel = Object.fromEntries(overzicht.rijen.map((r) => [r.ad.id, r.oordeel]));
  assert.deepEqual(oordeel, { t1: "beter", t2: "slechter", t3: "te-vroeg" });
  assert.equal(overzicht.rijen.find((r) => r.ad.id === "t1")?.vergelijkCpa, 30);
});
