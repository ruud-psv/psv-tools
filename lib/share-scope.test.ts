import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReportSources } from "./reports";
import { checkFanstoreRequest, checkInsightSource, checkWebRequest, withinSharedPeriod } from "./share-scope";

const NOW = new Date(Date.UTC(2026, 10, 18, 12, 0, 0)); // 18 november 2026

const sources: ReportSources = {
  web: {
    enabled: true,
    period: { preset: "custom", from: "2026-10-01", to: "2026-10-31" },
    sites: [
      { site: "psv", paths: ["/kaarten", "/nieuws/winst"] },
      { site: "ticketshop" },
    ],
  },
  fanstore: { enabled: true, period: { preset: "30d" }, products: ["Thuisshirt 26/27"] },
};

const web = (over: Partial<{ site: string | null; paths: string[]; from: string | null; to: string | null }>) =>
  checkWebRequest(sources, { site: "psv", paths: ["/kaarten"], from: "2026-10-01", to: "2026-10-31", ...over }, NOW);

test("webverkeer: alleen gedeelde sites", () => {
  assert.equal(web({}), null);
  assert.equal(web({ site: "ticketshop", paths: [] }), null);
  assert.match(web({ site: "fanstore", paths: [] }) ?? "", /niet gedeeld/);
  assert.match(web({ site: null }) ?? "", /Kies één site/);
});

test("webverkeer: alleen gedeelde pagina's", () => {
  assert.equal(web({ paths: ["/kaarten", "/nieuws/winst"] }), null);
  assert.match(web({ paths: ["/kaarten", "/admin"] }) ?? "", /niet gedeeld/);
  // Zonder pagina-filter zou de hele site terugkomen.
  assert.match(web({ paths: [] }) ?? "", /alleen de gekozen pagina's/);
  // Site zonder pagina-keuze: de hele site is gedeeld.
  assert.equal(web({ site: "ticketshop", paths: ["/wat-dan-ook"] }), null);
});

test("webverkeer: alleen de gedeelde periode", () => {
  assert.equal(web({ from: "2026-10-10", to: "2026-10-20" }), null);
  assert.match(web({ from: "2026-09-30" }) ?? "", /periode/);
  assert.match(web({ to: "2026-11-01" }) ?? "", /periode/);
  assert.match(web({ from: null, to: null }) ?? "", /periode/);
  assert.match(web({ from: "30daysAgo", to: "today" }) ?? "", /periode/);
});

test("webverkeer niet gedeeld: niets", () => {
  assert.match(
    checkWebRequest({ fanstore: sources.fanstore }, { site: "psv", paths: [], from: "2026-10-01", to: "2026-10-31" }, NOW) ?? "",
    /niet gedeeld/
  );
});

test("meebewegende periode: dag speling voor de klok van de bezoeker", () => {
  const period = { preset: "30d" };
  assert.equal(withinSharedPeriod(period, "2026-10-19", "2026-11-18", NOW), true);
  assert.equal(withinSharedPeriod(period, "2026-10-18", "2026-11-19", NOW), true);
  assert.equal(withinSharedPeriod(period, "2026-10-17", "2026-11-18", NOW), false);
  assert.equal(withinSharedPeriod(period, "2025-01-01", "2026-11-18", NOW), false);
  // Vaste periode: geen speling.
  const custom = { preset: "custom", from: "2026-10-01", to: "2026-10-31" };
  assert.equal(withinSharedPeriod(custom, "2026-09-30", "2026-10-31", NOW), false);
});

test("fanstore: alleen gedeelde producten en periode", () => {
  const req = { startDate: "2026-10-19", endDate: "2026-11-18", product: null as string | null };
  assert.equal(checkFanstoreRequest(sources, req, NOW), null);
  assert.equal(checkFanstoreRequest(sources, { ...req, product: "Thuisshirt 26/27" }, NOW), null);
  assert.match(checkFanstoreRequest(sources, { ...req, product: "Uitshirt 26/27" }, NOW) ?? "", /niet gedeeld/);
  assert.match(checkFanstoreRequest(sources, { ...req, startDate: "2024-01-01" }, NOW) ?? "", /periode/);
  assert.match(checkFanstoreRequest(sources, { ...req, startDate: null }, NOW) ?? "", /periode/);
  assert.match(checkFanstoreRequest({ web: sources.web }, req, NOW) ?? "", /niet gedeeld/);
});

test("fanstore zonder productselectie: de hele winkel is gedeeld", () => {
  const whole: ReportSources = { fanstore: { enabled: true, period: { preset: "30d" } } };
  assert.equal(
    checkFanstoreRequest(whole, { startDate: "2026-10-19", endDate: "2026-11-18", product: "Wat dan ook" }, NOW),
    null
  );
});

test("AI-analyse: alleen bronnen uit het rapport", () => {
  assert.equal(checkInsightSource(sources, "analytics"), null);
  assert.equal(checkInsightSource(sources, "fanstore"), null);
  assert.equal(checkInsightSource(sources, "combined"), null);
  assert.match(checkInsightSource(sources, "dm") ?? "", /niet gedeeld/);
  assert.match(checkInsightSource(sources, "ticket") ?? "", /niet gedeeld/);
  assert.match(checkInsightSource(sources, "iets") ?? "", /Onbekende/);
  assert.match(checkInsightSource({}, "combined") ?? "", /geen bronnen/);
});
