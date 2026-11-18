import { test } from "node:test";
import assert from "node:assert/strict";

import { playableApi } from "./client";
import { PlayableFout } from "./rapport";

type Verzoek = { url: string; init: RequestInit };

async function metNepPlayable(antwoord: (url: URL) => Response, werk: (verzoeken: Verzoek[]) => Promise<void>) {
  const echt = globalThis.fetch;
  const verzoeken: Verzoek[] = [];
  globalThis.fetch = (async (url: URL | string, init: RequestInit) => {
    verzoeken.push({ url: String(url), init });
    return antwoord(new URL(String(url)));
  }) as typeof fetch;
  try {
    await werk(verzoeken);
  } finally {
    globalThis.fetch = echt;
  }
}

function nepAntwoord(url: URL): Response {
  if (url.pathname === "/oauth/token") return Response.json({ access_token: "tok", expires_in: 3600 });
  if (url.pathname === "/v1/campaigns") {
    const pagina = url.searchParams.get("page");
    return Response.json({
      data: [{ id: Number(pagina), name: `Campagne ${pagina}`, active: true, created_on: "2026-01-01" }],
      links: { next: pagina === "1" ? "volgende" : null },
    });
  }
  if (url.pathname === "/v1/campaign/7/statistics") return Response.json({ data: { sessions: 10, registrations: 2 } });
  return Response.json({ message: "Not found" }, { status: 404 });
}

test("alleen leesrechten in het token, het token hergebruikt, en alleen GET", async () => {
  await metNepPlayable(nepAntwoord, async (verzoeken) => {
    const api = playableApi({ clientId: "client-a", clientSecret: "geheim" });
    const campagnes = await api.campagnes();
    assert.deepEqual(campagnes.map((c) => c.name), ["Campagne 1", "Campagne 2"]);
    assert.equal((await api.statistieken(7)).sessions, 10);
    await api.campagnes(); // uit de cache van een minuut

    const tokenVerzoeken = verzoeken.filter((v) => v.url.endsWith("/oauth/token"));
    assert.equal(tokenVerzoeken.length, 1);
    assert.deepEqual(JSON.parse(String(tokenVerzoeken[0].init.body)).scope, ["campaigns.list", "campaigns.view"]);

    const overig = verzoeken.filter((v) => !v.url.endsWith("/oauth/token"));
    assert.equal(overig.length, 3); // twee pagina's campagnes en één keer statistieken
    for (const v of overig) {
      assert.equal(v.init.method, undefined); // GET
      assert.equal((v.init.headers as Record<string, string>).Authorization, "Bearer tok");
    }
  });
});

test("een fout van Playable wordt een PlayableFout met de melding", async () => {
  await metNepPlayable(nepAntwoord, async () => {
    await assert.rejects(playableApi({ clientId: "client-b", clientSecret: "geheim" }).statistieken(99), (err: Error) => {
      assert.ok(err instanceof PlayableFout);
      assert.equal(err.status, 404);
      assert.equal(err.message, "Not found");
      return true;
    });
  });
});
