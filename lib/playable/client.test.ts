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
    // Twee pagina's; daarna, zoals bij een echte API, een lege lijst.
    if (Number(pagina) > 2) return Response.json({ data: [], links: { next: null } });
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
    const { lijst } = await api.campagnes();
    assert.deepEqual(lijst.map((c) => c.name), ["Campagne 1", "Campagne 2"]);
    assert.equal((await api.statistieken(7)).sessions, 10);
    await api.campagnes(); // uit de cache van een minuut

    const tokenVerzoeken = verzoeken.filter((v) => v.url.endsWith("/oauth/token"));
    assert.equal(tokenVerzoeken.length, 1);
    assert.deepEqual(JSON.parse(String(tokenVerzoeken[0].init.body)).scope, ["campaigns.list", "campaigns.view"]);

    const overig = verzoeken.filter((v) => !v.url.endsWith("/oauth/token"));
    // Pagina 1, een groepje vooruit (2 t/m 9) en één keer statistieken; daarna uit de cache.
    assert.equal(overig.filter((v) => v.url.includes("/v1/campaigns")).length, 9);
    assert.equal(overig.filter((v) => v.url.includes("/statistics")).length, 1);
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

test("Playable geeft 10 per pagina: toch alle 600 campagnes, ook de nieuwste op de laatste pagina", async () => {
  const antwoord = (url: URL): Response => {
    if (url.pathname === "/oauth/token") return Response.json({ access_token: "tok", expires_in: 3600 });
    const pagina = Number(url.searchParams.get("page"));
    const data = Array.from({ length: 10 }, (_, i) => {
      const id = (pagina - 1) * 10 + i + 1;
      return { id, name: id === 600 ? "Fanstore - Coen Dillen tenue - DMID26-17577" : `Campagne ${id}`, created_on: "2026-01-01" };
    });
    return Response.json({ data, links: { next: pagina < 60 ? "volgende" : null }, meta: { last_page: 60, total: 600, per_page: 10 } });
  };
  await metNepPlayable(antwoord, async (verzoeken) => {
    const { lijst, totaal } = await playableApi({ clientId: "client-c", clientSecret: "geheim" }).campagnes();
    assert.equal(lijst.length, 600);
    assert.equal(totaal, 600);
    assert.ok(lijst.some((c) => c.name.includes("Coen Dillen")));
    assert.equal(verzoeken.filter((v) => v.url.includes("/v1/campaigns")).length, 60);
  });
});

test("zonder aantal pagina's: doorgaan tot een lege pagina", async () => {
  const antwoord = (url: URL): Response => {
    if (url.pathname === "/oauth/token") return Response.json({ access_token: "tok", expires_in: 3600 });
    const pagina = Number(url.searchParams.get("page"));
    const data = pagina <= 23 ? Array.from({ length: 10 }, (_, i) => ({ id: (pagina - 1) * 10 + i + 1, name: "x" })) : [];
    return Response.json({ data, links: { next: pagina < 23 ? "volgende" : null } });
  };
  await metNepPlayable(antwoord, async () => {
    const { lijst, totaal } = await playableApi({ clientId: "client-d", clientSecret: "geheim" }).campagnes();
    assert.equal(lijst.length, 230);
    assert.equal(totaal, undefined);
  });
});

test("pagina's na de laatste tellen niet mee, ook als de API ze vult", async () => {
  const antwoord = (url: URL): Response => {
    if (url.pathname === "/oauth/token") return Response.json({ access_token: "tok", expires_in: 3600 });
    const pagina = Number(url.searchParams.get("page"));
    return Response.json({ data: [{ id: pagina, name: `p${pagina}` }], links: { next: pagina < 3 ? "volgende" : null } });
  };
  await metNepPlayable(antwoord, async () => {
    const { lijst } = await playableApi({ clientId: "client-e", clientSecret: "geheim" }).campagnes();
    assert.deepEqual(lijst.map((c) => c.id), [1, 2, 3]);
  });
});
