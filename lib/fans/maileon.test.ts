import { test } from "node:test";
import assert from "node:assert/strict";
import { leesKlikPagina, maileonKlikken } from "./maileon";
import { LEGE_SET, maakSet, naarBytes, normaliseerSso, overlap, uitBytes, voegSamen } from "./sets";

function klik(sso: string | null, als: "field" | "element" = "field"): string {
  const veld =
    sso == null
      ? ""
      : als === "field"
        ? `<custom_fields><field><name>SSOID</name><value>${sso}</value></field></custom_fields>`
        : `<custom_fields><SSOID>${sso}</SSOID></custom_fields>`;
  return `<click><timestamp>1764000000000</timestamp><contact><id>1</id><email>x@psv.nl</email>${veld}</contact><mailing_id>9</mailing_id></click>`;
}

const pagina = (...kliks: string[]) => `<?xml version="1.0" encoding="UTF-8"?><clicks>${kliks.join("")}</clicks>`;

test("leest SSO-id's uit een klikpagina, in beide vormen, en slaat lege over", () => {
  const xml = pagina(klik(" ABC-1 "), klik("def-2", "element"), klik(null), klik(""));
  assert.deepEqual(leesKlikPagina(xml), { regels: 4, ids: ["abc-1", "def-2"] });
});

function nep(antwoorden: ((url: URL) => Response)[]) {
  const urls: URL[] = [];
  const doeFetch = (async (input: URL | string) => {
    const url = new URL(String(input));
    urls.push(url);
    const volgende = antwoorden.shift();
    if (!volgende) throw new Error("geen antwoord meer");
    return volgende(url);
  }) as unknown as typeof fetch;
  return { doeFetch, urls };
}

test("pagineert per dag in Nederlandse tijd, met SSOID en zonder anonieme klikken", async () => {
  const vol = pagina(...Array.from({ length: 1000 }, (_, i) => klik(`id-${i}`)));
  const { doeFetch, urls } = nep([() => new Response(vol), () => new Response(pagina(klik("laatste")))]);
  const api = maileonKlikken({ apiKey: "k" }, { doeFetch, wachttijden: [] });
  const ids = await api.klikkersOpDag("2026-11-01");
  assert.equal(ids.length, 1001);
  assert.equal(urls.length, 2);
  assert.equal(urls[0].pathname, "/1.0/reports/clicks/unique");
  assert.equal(urls[0].searchParams.get("from_date"), String(Date.parse("2026-10-31T23:00:00Z")));
  assert.equal(urls[0].searchParams.get("to_date"), String(Date.parse("2026-11-01T23:00:00Z")));
  assert.equal(urls[0].searchParams.get("custom_field"), "SSOID");
  assert.equal(urls[0].searchParams.get("exclude_anonymous_clicks"), "true");
  assert.equal(urls[1].searchParams.get("page_index"), "2");
  assert.equal(api.endpoint(), "/reports/clicks/unique");
});

test("valt terug op /reports/clicks als het unieke rapport niet bestaat", async () => {
  const { doeFetch, urls } = nep([
    () => new Response("<error><message>Not found</message></error>", { status: 404 }),
    () => new Response(pagina(klik("a"))),
  ]);
  const api = maileonKlikken({ apiKey: "k" }, { doeFetch, wachttijden: [] });
  assert.deepEqual(await api.klikkersOpDag("2026-11-02"), ["a"]);
  assert.equal(urls[1].pathname, "/1.0/reports/clicks");
  assert.equal(api.endpoint(), "/reports/clicks");
});

test("probeert opnieuw bij 429 en 5xx, en geeft een echte fout door", async () => {
  const { doeFetch } = nep([
    () => new Response("druk", { status: 429 }),
    () => new Response("storing", { status: 503 }),
    () => new Response(pagina(klik("a"))),
  ]);
  const api = maileonKlikken({ apiKey: "k" }, { doeFetch, wachttijden: [0, 0, 0], endpoint: "/reports/clicks" });
  assert.deepEqual(await api.klikkersOpDag("2026-11-03"), ["a"]);

  const fout = nep([() => new Response("<error><message>Unauthorized</message></error>", { status: 401 })]);
  const api2 = maileonKlikken({ apiKey: "k" }, { doeFetch: fout.doeFetch, wachttijden: [] });
  await assert.rejects(api2.klikkersOpDag("2026-11-03"), /Unauthorized/);
});

test("sets: samenvoegen ontdubbelt, overlap telt gedeelde fans, en overleeft opslaan", () => {
  assert.equal(normaliseerSso("  AbC "), "abc");
  assert.equal(normaliseerSso("   "), null);

  const maandag = maakSet(["a", "b", "c", "a"], "2026-11-02");
  const dinsdag = maakSet(["c", "d"], "2026-11-03");
  const week = voegSamen(maandag, dinsdag);
  assert.equal(maandag.count, 3);
  assert.equal(week.count, 4);
  assert.equal(voegSamen(LEGE_SET, week).count, 4);

  const mijnpsv = maakSet(["d", "e"], "2026-11-03");
  assert.equal(overlap(week, mijnpsv), 1);

  const terug = uitBytes(new Uint8Array(naarBytes(week)));
  assert.equal(terug.count, 4);
  assert.equal(overlap(terug, week), 4);
});
