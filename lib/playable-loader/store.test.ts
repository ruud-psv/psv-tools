import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import { purgeBundle } from "./store";

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
