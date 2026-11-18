import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, clampToScope, getDateRange, matchesQueries, maileonScopeFromShare, scopeWindow,
} from "./dm-scope";

const MARCH = { from: "2026-03-01", to: "2026-03-31", queries: [] };

test("DM-deellink: eigen periode en zoekterm", () => {
  const scope = maileonScopeFromShare({
    kind: "dm", q: " Kerst ", preset: "custom", customFrom: "2026-03-01", customTo: "2026-03-31",
  });
  assert.deepEqual(scope, { from: "2026-03-01", to: "2026-03-31", queries: ["Kerst"] });
});

test("DM-deellink: een meebewegende periode beweegt op de server mee", () => {
  const scope = maileonScopeFromShare({ kind: "dm", q: "", preset: "7d" });
  assert.deepEqual(scope, { ...getDateRange("7d"), queries: [] });
});

test("DM-deellink met kapotte eigen datums geeft geen toegang", () => {
  assert.equal(maileonScopeFromShare({ kind: "dm", preset: "custom", customFrom: "gisteren", customTo: "x" }), null);
});

test("opgeslagen rapport: periode en zoektermen van de DM-bron", () => {
  const report = {
    sources: {
      dm: { enabled: true, period: { preset: "custom", from: "2026-02-01", to: "2026-02-28" }, queries: ["Abonnement", " "] },
      web: { enabled: true, period: { preset: "30d" }, sites: [] },
    },
  };
  assert.deepEqual(maileonScopeFromShare({ kind: "report", id: "r1" }, report), {
    from: "2026-02-01", to: "2026-02-28", queries: ["Abonnement"],
  });
});

test("rapport of campagne zonder DM-bron deelt geen mailings", () => {
  assert.equal(maileonScopeFromShare({ kind: "report", id: "r1" }, { sources: { web: { enabled: true } } }), null);
  assert.equal(maileonScopeFromShare({ kind: "report", id: "r1" }, null), null);
  assert.equal(
    maileonScopeFromShare({ kind: "campaign", from: "2026-01-01", to: "2026-01-31", sources: { ticketing: { enabled: true } } }),
    null
  );
});

test("oude campagnelink: globale periode en losse zoekterm", () => {
  const scope = maileonScopeFromShare({
    kind: "campaign", name: "Kerst", from: "2026-01-01", to: "2026-01-31",
    sources: { dm: { enabled: true, query: "kerst" } },
  });
  assert.deepEqual(scope, { from: "2026-01-01", to: "2026-01-31", queries: ["kerst"] });
});

test("andere soorten deellinks delen geen mailings", () => {
  assert.equal(maileonScopeFromShare({ kind: "ticket-event", eventId: "1" }), null);
  assert.equal(maileonScopeFromShare({}), null);
  assert.equal(maileonScopeFromShare({ q: "", preset: "30d" }), null);
});

test("een gevraagde periode wordt ingeperkt tot de scope, met een dag speling", () => {
  assert.deepEqual(scopeWindow(MARCH), { from: "2026-02-28", to: "2026-04-01" });
  assert.deepEqual(clampToScope("2026-01-01", "2026-12-31", MARCH), { from: "2026-02-28", to: "2026-04-01" });
  assert.deepEqual(clampToScope("2026-03-05", "2026-03-10", MARCH), { from: "2026-03-05", to: "2026-03-10" });
  assert.equal(clampToScope("2025-01-01", "2025-12-31", MARCH), null);
  assert.equal(clampToScope("2026-03-01", "nooit", MARCH), null);
});

test("addDays rekent over maand- en jaargrenzen", () => {
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2025-12-31", 1), "2026-01-01");
});

test("zoektermen kijken naar naam, naam zonder datum en onderwerp", () => {
  const mailing = { name: "Kerst 12 december 2025 actie DMID123", subject: "Fijne feestdagen" };
  assert.equal(matchesQueries(mailing, []), true);
  assert.equal(matchesQueries(mailing, ["KERST"]), true);
  assert.equal(matchesQueries(mailing, ["kerst actie"]), true); // alleen in de naam zonder datum
  assert.equal(matchesQueries(mailing, ["feestdagen"]), true);
  assert.equal(matchesQueries(mailing, ["abonnement"]), false);
  assert.equal(matchesQueries(mailing, ["abonnement", "kerst"]), true);
});
