import { test } from "node:test";
import assert from "node:assert/strict";

import { JwFout, jwApi, leesRijen, normaliseerMedia, resetThrottle, wachtOpPlek, type AnalyticsQuery } from "./client";

type Antwoord = { status: number; body?: unknown; headers?: Record<string, string> };

function nepFetch(antwoorden: (url: string, init: RequestInit) => Antwoord) {
  const verzoeken: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string | URL, init: RequestInit = {}) => {
    verzoeken.push({ url: String(url), init });
    const a = antwoorden(String(url), init);
    return new Response(a.body === undefined ? "" : JSON.stringify(a.body), { status: a.status, headers: a.headers });
  }) as typeof fetch;
  return { f, verzoeken };
}

/** Nepklok: slapen zet de tijd vooruit in plaats van te wachten. */
function nepKlok() {
  let t = 1_000_000;
  const geslapen: number[] = [];
  return { nu: () => t, slaap: async (ms: number) => { geslapen.push(ms); t += ms; }, geslapen };
}

const Q: AnalyticsQuery = { start_date: "2026-11-01", end_date: "2026-11-22", dimensions: ["media_id"], metrics: [{ operation: "sum", field: "plays" }] };

test("analytics: haalt alle pagina's op (page_length 100) en leest kolommen uit de metadata", async () => {
  resetThrottle();
  const klok = nepKlok();
  const { f, verzoeken } = nepFetch((_url, init) => {
    const { page } = JSON.parse(String(init.body)) as { page: number };
    const n = page < 2 ? 100 : 37;
    return {
      status: 200,
      body: {
        metadata: { column_headers: { dimensions: [{ field: "media_id" }], metrics: [{ field: "plays" }] } },
        data: { rows: Array.from({ length: n }, (_, i) => [`m${page}-${i}`, i]) },
      },
    };
  });
  const api = jwApi({ secret: "geheim-123" }, { fetch: f, ...klok });
  const rijen = await api.queryAnalytics("abcd1234", Q);
  assert.equal(rijen.length, 237);
  assert.equal(verzoeken.length, 3);
  assert.deepEqual(rijen[0], { media_id: "m0-0", plays: 0 });
  const body = JSON.parse(String(verzoeken[2].init.body));
  assert.equal(body.page, 2);
  assert.equal(body.page_length, 100);
  assert.match(verzoeken[0].url, /\/v2\/sites\/abcd1234\/analytics\/queries\/\?source=default$/);
  assert.equal((verzoeken[0].init.headers as Record<string, string>).Authorization, "Bearer geheim-123");
});

test("429: exponential backoff (of Retry-After) en daarna gewoon verder", async () => {
  resetThrottle();
  const klok = nepKlok();
  let poging = 0;
  const { f } = nepFetch(() => {
    poging++;
    if (poging === 1) return { status: 429, headers: { "retry-after": "3" } };
    if (poging <= 3) return { status: 429 };
    return { status: 200, body: { data: { rows: [["x", 1]] } } };
  });
  const api = jwApi({ secret: "s" }, { fetch: f, ...klok });
  const rijen = await api.queryAnalytics("abcd1234", Q);
  assert.equal(rijen.length, 1);
  assert.deepEqual(klok.geslapen, [3_000, 2_000, 4_000]);
});

test("429 blijft: na vijf pogingen een JwFout, zonder het secret in de melding", async () => {
  resetThrottle();
  const klok = nepKlok();
  const { f, verzoeken } = nepFetch(() => ({ status: 429, body: { errors: [{ code: "rate_limited", description: "Too many" }] } }));
  const api = jwApi({ secret: "supergeheim" }, { fetch: f, ...klok });
  await assert.rejects(api.queryAnalytics("abcd1234", Q), (err: unknown) => {
    assert.ok(err instanceof JwFout);
    assert.equal(err.status, 429);
    assert.doesNotMatch(err.message, /supergeheim/);
    return true;
  });
  assert.equal(verzoeken.length, 6);
  assert.deepEqual(klok.geslapen, [1_000, 2_000, 4_000, 8_000, 16_000]);
});

test("throttle: hooguit 60 verzoeken per minuut per token", async () => {
  resetThrottle();
  const klok = nepKlok();
  for (let i = 0; i < 60; i++) await wachtOpPlek("t", klok.nu, klok.slaap);
  assert.equal(klok.geslapen.length, 0);
  await wachtOpPlek("t", klok.nu, klok.slaap);
  assert.equal(klok.geslapen.length, 1);
  assert.ok(klok.geslapen[0] >= 60_000);
  // Een ander token heeft een eigen venster.
  await wachtOpPlek("ander", klok.nu, klok.slaap);
  assert.equal(klok.geslapen.length, 1);
});

test("media: paginering tot een korte pagina, getMedia geeft null bij 404", async () => {
  resetThrottle();
  const klok = nepKlok();
  const { f, verzoeken } = nepFetch((url) => {
    if (url.includes("/media/zzzzzzzz/")) return { status: 404, body: { errors: [{ code: "not_found" }] } };
    const page = Number(new URL(url).searchParams.get("page"));
    const n = page === 1 ? 500 : 3;
    return { status: 200, body: { media: Array.from({ length: n }, (_, i) => ({ id: `id${page}x${i}`, metadata: { title: "T" } })), total: 503 } };
  });
  const api = jwApi({ secret: "s" }, { fetch: f, ...klok });
  assert.equal((await api.listMedia("abcd1234")).length, 503);
  assert.equal(verzoeken.length, 2);
  assert.equal(await api.getMedia("abcd1234", "zzzzzzzz"), null);
});

test("leesRijen zonder metadata volgt de volgorde van de vraag; normaliseerMedia leest tags en duur", () => {
  assert.deepEqual(leesRijen({ data: { rows: [["m1", 5]] } }, Q), [{ media_id: "m1", plays: 5 }]);
  const m = normaliseerMedia({
    id: "abcd1234",
    duration: 95.4,
    metadata: { title: " Persco ", tags: ["type:persconferentie", "team:psv1"], publish_start_date: "2026-11-20T10:00:00Z", custom_params: { a: 1 } },
  });
  assert.equal(m.titel, "Persco");
  assert.deepEqual(m.tags, ["type:persconferentie", "team:psv1"]);
  assert.equal(m.duur, 95.4);
  assert.equal(m.gepubliceerd, "2026-11-20T10:00:00Z");
  assert.deepEqual(m.customParams, { a: "1" });
});
