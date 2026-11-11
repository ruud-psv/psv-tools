import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import { purgeBundle, upsertRecent } from "./store";

const realFetch = globalThis.fetch;
const URL_BUNDEL = "https://psveindhoven.b-cdn.net/playable/pages/244347/page.js";

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.BUNNY_API_KEY;
});

test("purgeBundle: zonder BUNNY_API_KEY niets doen en false teruggeven", async () => {
  let aangeroepen = false;
  globalThis.fetch = async () => {
    aangeroepen = true;
    return new Response(null, { status: 200 });
  };
  assert.equal(await purgeBundle(URL_BUNDEL), false);
  assert.equal(aangeroepen, false);
});

test("purgeBundle: met sleutel de URL purgen bij api.bunny.net", async () => {
  process.env.BUNNY_API_KEY = "account-sleutel";
  let verzoek: { url: string; method?: string; key?: string | null } | null = null;
  globalThis.fetch = async (input, init) => {
    verzoek = { url: String(input), method: init?.method, key: new Headers(init?.headers).get("AccessKey") };
    return new Response(null, { status: 200 });
  };
  assert.equal(await purgeBundle(URL_BUNDEL), true);
  assert.deepEqual(verzoek, {
    url: `https://api.bunny.net/purge?url=${encodeURIComponent(URL_BUNDEL)}&async=false`,
    method: "POST",
    key: "account-sleutel",
  });
});

test("purgeBundle: een fout van Bunny komt als melding terug", async () => {
  process.env.BUNNY_API_KEY = "fout";
  globalThis.fetch = async () => new Response("Unauthorized", { status: 401 });
  await assert.rejects(purgeBundle(URL_BUNDEL), /Cache van Bunny legen mislukt \(401\): Unauthorized/);
});

test("upsertRecent: nieuwste bovenaan, geen dubbele, naam blijft bewaard", () => {
  let lijst = upsertRecent([], { campaignId: 1, campaignName: "Een", publishedAt: "2026-11-10T09:00:00.000Z" });
  lijst = upsertRecent(lijst, { campaignId: 2, publishedAt: "2026-11-11T09:00:00.000Z" });
  lijst = upsertRecent(lijst, { campaignId: 1, publishedAt: "2026-11-11T10:00:00.000Z" });
  assert.deepEqual(lijst, [
    { campaignId: 1, campaignName: "Een", publishedAt: "2026-11-11T10:00:00.000Z" },
    { campaignId: 2, publishedAt: "2026-11-11T09:00:00.000Z" },
  ]);
  const vol = Array.from({ length: 25 }, (_, i) => ({ campaignId: i, publishedAt: `2026-11-${String(i + 1).padStart(2, "0")}T00:00:00.000Z` }));
  const kort = vol.reduce((l, item) => upsertRecent(l, item, 20), [] as ReturnType<typeof upsertRecent>);
  assert.equal(kort.length, 20);
  assert.equal(kort[0].campaignId, 24);
});
