import { test } from "node:test";
import assert from "node:assert/strict";

import { easternDatum, probeSite, plusDagen, type ProbeVerzoek } from "./probe";
import { JwConfigError, leesSites } from "./sites";

test("leesSites: lijst met labels, één id, en fouten", () => {
  assert.deepEqual(leesSites({ JWPLAYER_SITE_IDS: "abcd1234:PSV Play, efgh5678:PSV Play app" }), [
    { id: "abcd1234", label: "PSV Play" },
    { id: "efgh5678", label: "PSV Play app" },
  ]);
  assert.deepEqual(leesSites({ JWPLAYER_SITE_ID: "abcd1234" }), [{ id: "abcd1234", label: "PSV Play" }]);
  assert.throws(() => leesSites({}), JwConfigError);
  assert.throws(() => leesSites({ JWPLAYER_SITE_ID: "kort" }), JwConfigError);
});

test("easternDatum: om 03.00 uur UTC is het in New York nog de dag ervoor", () => {
  assert.equal(easternDatum(new Date("2026-11-23T03:00:00Z")), "2026-11-22");
  assert.equal(easternDatum(new Date("2026-11-23T06:00:00Z")), "2026-11-23");
  assert.equal(plusDagen("2026-03-01", -1), "2026-02-28");
});

test("probeSite: premiumvelden en OTT uit, de rest aan", async () => {
  const verboden = new Set(["tag", "city", "content_score", "logged_in_unique_viewers"]);
  const verzoeken: ProbeVerzoek[] = [];
  const uitkomst = await probeSite({ id: "abcd1234", label: "PSV Play" }, async (v) => {
    verzoeken.push(v);
    if (v.method === "GET") {
      return { status: 200, body: { media: [{ id: "m1", metadata: { title: "Persconferentie", tags: ["type:persconferentie"], custom_params: { x: "1" } } }] } };
    }
    if (v.pad.includes("source=ott")) return { status: 403, body: { errors: [{ code: "forbidden", description: "OTT niet actief" }] } };
    const q = v.body as { dimensions?: string[]; metrics: { field: string }[]; start_date: string; end_date: string };
    const velden = [...(q.dimensions ?? []), ...q.metrics.map((m) => m.field)];
    if (velden.some((f) => verboden.has(f))) return { status: 400, body: { errors: [{ code: "invalid", description: "Enterprise" }] } };
    const dagen = (Date.parse(q.end_date) - Date.parse(q.start_date)) / 86_400_000 + 1;
    if (dagen > 366) return { status: 400, body: { errors: [{ description: "range" }] } };
    return { status: 200, body: { data: { rows: [["2025-11-23", 10]] } } };
  }, new Date("2026-11-23T12:00:00Z"));

  const k = uitkomst.capabilities;
  assert.equal(k.metrics.plays, true);
  assert.equal(k.metrics.content_score, false);
  assert.equal(k.dimensions.tag, false);
  assert.equal(k.dimensions.platform_id, true);
  assert.equal(k.ott.available, false);
  assert.equal(k.ott.loggedInUniqueViewers, false);
  assert.equal(k.live.hasData, true);
  assert.equal(k.sort, "ascending");
  assert.equal(k.maxRangeDays, 366);
  assert.equal(k.maxRangeIsLowerBound, false);
  assert.equal(k.earliestDate, "2025-11-23");
  assert.ok(k.management.fields.includes("metadata.custom_params.x"));
  // De laatste afgesloten JW-dag is gisteren in Eastern.
  assert.equal((verzoeken[0].body as { end_date: string }).end_date, "2026-11-22");
});
