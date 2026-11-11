import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import { buildBundle, preparePage } from "./bundle";
import { checkBundle, compareVersions, readBundleVersion } from "./status";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const URL_BUNDEL = "https://psveindhoven.b-cdn.net/playable/pages/244347/page.js";
const bundel = (publishedAt: string) =>
  buildBundle(preparePage({ html: '<div id="psvk-app"></div>', css: "", js: "" }), { campaignId: 244347, publishedAt });

test("readBundleVersion leest campagne en tijd uit een echte bundel", () => {
  assert.deepEqual(readBundleVersion(bundel("2026-11-11T12:57:00.000Z")), {
    campaignId: 244347,
    publishedAt: "2026-11-11T12:57:00.000Z",
  });
  assert.equal(readBundleVersion("console.log('iets anders')"), null);
});

test("compareVersions", () => {
  const nu = "2026-11-11T12:57:00.000Z";
  assert.equal(compareVersions(nu, nu), "gelijk");
  assert.equal(compareVersions("2026-11-11T12:54:00.000Z", nu), "ouder");
  assert.equal(compareVersions("2026-11-11T13:10:00.000Z", nu), "anders");
  assert.equal(compareVersions(nu, null), "anders");
  assert.equal(compareVersions(null, nu), "leeg");
});

test("checkBundle haalt op zoals de loader en vergelijkt", async () => {
  let gevraagd = "";
  globalThis.fetch = async (input) => {
    gevraagd = String(input);
    return new Response(bundel("2026-11-11T12:54:55.850Z"));
  };
  const status = await checkBundle(URL_BUNDEL, "2026-11-11T12:57:00.000Z");
  assert.deepEqual(status, { status: "ouder", bunnyPublishedAt: "2026-11-11T12:54:55.850Z" });
  assert.match(gevraagd, /page\.js\?v=\d+$/);
});

test("checkBundle: niets op Bunny, foutstatus, geen bundel, geen verbinding", async () => {
  globalThis.fetch = async () => new Response("Not found", { status: 404 });
  assert.equal((await checkBundle(URL_BUNDEL, null)).status, "leeg");

  globalThis.fetch = async () => new Response("", { status: 503 });
  assert.deepEqual(await checkBundle(URL_BUNDEL, null), {
    status: "fout",
    bunnyPublishedAt: null,
    detail: "Bunny antwoordde met 503.",
  });

  globalThis.fetch = async () => new Response("<html>iets anders</html>");
  assert.match((await checkBundle(URL_BUNDEL, null)).detail ?? "", /geen bundel van PSV Tools/);

  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  assert.equal((await checkBundle(URL_BUNDEL, null)).status, "fout");
});
