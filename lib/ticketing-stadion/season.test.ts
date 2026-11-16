import assert from "node:assert/strict";
import { test } from "node:test";
import { toEventSales, type StoredEvent } from "../ringside/sales-series";
import { buildSeasonCsv, buildSeasonOverview } from "./season";

function event(productId: string, name: string, eventDate: string, season: string, stand: StoredEvent["stand"]): StoredEvent {
  return { productId, name, eventDate, productType: "Event", category: "", season, stand, other: Object.keys(stand).length ? { vrij: { [eventDate]: 99 } } : {} };
}

const SALES = [
  event("a", "PSV - Ajax", "2026-09-20", "26/27", {
    vrij: { "2026-09-01": 100, "2026-09-10": 50 },
    resale: { "2026-09-15": 30 },
    seizoenkaart: { "2026-08-01": 20000 },
  }),
  event("b", "PSV - FC Twente", "2026-12-05", "26/27", { vrij: { "2026-11-10": 40 }, resale: { "2026-11-12": 10 } }),
  event("c", "PSV - NEC", "2027-02-01", "26/27", {}),
  event("leeg", "PSV - Test", "2026-08-10", "26/27", {}),
  event("d", "Ajax - PSV", "2026-10-01", "26/27", { vrij: { "2026-09-01": 5 } }),
  event("e", "Jong PSV - Helmond Sport", "2026-10-02", "26/27", { vrij: { "2026-09-01": 5 } }),
  event("f", "PSV - Feyenoord", "2026-03-01", "25/26", { vrij: { "2026-02-01": 7 } }),
].map((stored) => toEventSales(stored));

test("seizoensoverzicht: thuiswedstrijden van het seizoen, vrije verkoop en resale", () => {
  const overview = buildSeasonOverview(SALES, "26/27", "2026-11-16");
  assert.deepEqual(overview.seasons, ["26/27", "25/26"]);
  assert.deepEqual(
    overview.matches.map((match) => [match.name, match.played, match.free, match.resale]),
    [
      ["PSV - Ajax", true, 150, 30],
      ["PSV - FC Twente", false, 40, 10],
      ["PSV - NEC", false, 0, 0],
    ]
  );
  assert.equal(overview.matches[0].seasonTickets, 20000);
  assert.deepEqual(overview.totals, { matches: 3, played: 1, free: 190, resale: 40 });
});

test("seizoensoverzicht als CSV", () => {
  const csv = buildSeasonCsv(buildSeasonOverview(SALES, "26/27", "2026-11-16"));
  assert.match(csv, /PSV - Ajax;2026-09-20;ja;150;30;180;16,7%;20000;0/);
});

test("deellink van het seizoen: ondertekend, met de uitgezette wedstrijden", async () => {
  process.env.SESSION_SECRET = "ab".repeat(32);
  const { createSeasonShareToken, readSeasonShareToken, createShareToken, readShareToken } = await import("./share");
  const id = "11111111-1111-4111-8111-111111111111";
  const token = createSeasonShareToken({ season: "26/27", exclude: [id] });
  assert.deepEqual(readSeasonShareToken(token), { season: "26/27", exclude: [id] });
  assert.equal(readSeasonShareToken(token.slice(0, -2) + "xx"), null);
  // Een token van een wedstrijd geldt niet als seizoenstoken, en andersom.
  assert.equal(readSeasonShareToken(createShareToken(id)), null);
  assert.equal(readShareToken(token), null);
});
