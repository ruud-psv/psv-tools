import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STANDAARD_SEGMENT,
  blueconicApi,
  blueconicBron,
  blueconicConfig,
  dagUitWaarde,
  isBlueconicIngesteld,
  kiesEigenschappen,
  leesProfielPagina,
  type BlueconicConfig,
} from "./blueconic";

const ENV = { BLUECONIC_CLIENT_ID: "id", BLUECONIC_CLIENT_SECRET: "geheim" };

test("config: client ID en secret verplicht, segment en host met standaard", () => {
  assert.equal(isBlueconicIngesteld({}), false);
  assert.throws(() => blueconicConfig({ BLUECONIC_CLIENT_ID: "id" }), /BLUECONIC_CLIENT_SECRET/);
  const c = blueconicConfig({ ...ENV, BLUECONIC_HOST: "https://psv.blueconic.com/" });
  assert.equal(c.host, "psv.blueconic.com");
  assert.equal(c.segmentId, STANDAARD_SEGMENT);
  assert.equal(c.eigenschapSso, null);
});

test("datums als milliseconden of ISO-tekst worden een Nederlandse dag", () => {
  assert.equal(dagUitWaarde(String(Date.parse("2026-10-31T23:30:00Z"))), "2026-11-01");
  assert.equal(dagUitWaarde("2026-11-26T10:30:00.000Z"), "2026-11-26");
  assert.equal(dagUitWaarde(""), null);
  assert.equal(dagUitWaarde("geen datum"), null);
});

test("profielpagina's in beide vormen: eigenschappen als lijst of als object", () => {
  const lijst = leesProfielPagina({
    profiles: [{ id: "p1", properties: [{ id: "sso_id", values: ["ABC"] }, { id: "sso_login", values: ["1764150000000"] }] }],
    total: 10,
    nextCursor: "c2",
  });
  assert.deepEqual([lijst.profielen[0].id, lijst.profielen[0].eigenschappen.get("sso_id"), lijst.totaal, lijst.volgende], ["p1", ["ABC"], 10, "c2"]);

  const object = leesProfielPagina([{ id: "p2", properties: { sso_id: "DEF", sso_login: ["2026-11-02T08:00:00Z"] } }]);
  assert.deepEqual(object.profielen[0].eigenschappen.get("sso_id"), ["DEF"]);
  assert.equal(object.volgende, null);
});

test("eigenschappen op naam kiezen, en bij twijfel de kandidaten noemen", () => {
  const props = {
    properties: [
      { id: "ssoid", name: "SSO ID" },
      { id: "sso_login_recent", name: "[Persoon] SSO Ingelogd Datum (meest recent)" },
      { id: "sso_login_first", name: "[Persoon] SSO Ingelogd Datum (eerste)" },
      { id: "email", name: "E-mail" },
    ],
  };
  const k = kiesEigenschappen(props);
  assert.deepEqual([k.sso, k.login], ["ssoid", "sso_login_recent"]);
  assert.throws(() => kiesEigenschappen({ properties: [{ id: "email", name: "E-mail" }] }), /BLUECONIC_PROP_SSO/);
});

interface Verzoek {
  url: URL;
  init?: RequestInit;
}

function nep(handler: (v: Verzoek) => Response) {
  const verzoeken: Verzoek[] = [];
  const doeFetch = (async (input: URL | string, init?: RequestInit) => {
    const v = { url: new URL(String(input)), init };
    verzoeken.push(v);
    return handler(v);
  }) as unknown as typeof fetch;
  return { doeFetch, verzoeken };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const CONFIG: BlueconicConfig = { ...blueconicConfig(ENV), eigenschapSso: "sso", eigenschapLogin: "login" };

function profiel(id: string, sso: string | null, login: string) {
  return { id, properties: [...(sso ? [{ id: "sso", values: [sso] }] : []), { id: "login", values: [login] }] };
}

test("token met client credentials, en pagineren met startIndex tot een lege pagina", async () => {
  // BlueConic geeft maar 2 per pagina, ook al vraagt Tools er meer.
  const alle = [
    profiel("1", "A", "2026-11-25T10:00:00Z"),
    profiel("2", "B", "2026-10-03T10:00:00Z"),
    profiel("3", "C", "2026-11-26T10:00:00Z"),
  ];
  const { doeFetch, verzoeken } = nep(({ url }) => {
    if (url.pathname === "/rest/v2/oauth/token") return json({ access_token: "tok", expires_in: 3600 });
    const start = Number(url.searchParams.get("startIndex"));
    return json({ profiles: alle.slice(start, start + 2) });
  });
  const api = blueconicApi(CONFIG, { doeFetch, wachttijden: [] });
  const uit = await blueconicBron(api, CONFIG).profielenSinds("2026-11-01");

  assert.deepEqual(uit, [
    { sso: "A", laatsteLogin: "2026-11-25" },
    { sso: "C", laatsteLogin: "2026-11-26" },
  ]);
  const token = verzoeken[0];
  assert.equal(token.url.href, "https://psv.blueconic.com/rest/v2/oauth/token");
  assert.match(String(token.init?.body), /grant_type=client_credentials/);
  const pagina = verzoeken[1].url;
  assert.equal(pagina.pathname, "/rest/v2/profiles");
  assert.equal(pagina.searchParams.get("segment"), STANDAARD_SEGMENT);
  assert.equal(pagina.searchParams.get("properties"), "sso,login");
  assert.equal(verzoeken.filter((v) => v.url.pathname === "/rest/v2/oauth/token").length, 1, "het token wordt hergebruikt");
  assert.deepEqual(verzoeken.slice(1).map((v) => v.url.searchParams.get("startIndex")), ["0", "2", "3"]);
});

test("pagineren met een cursor, en stoppen als het totaal bereikt is", async () => {
  const { doeFetch, verzoeken } = nep(({ url }) => {
    if (url.pathname.endsWith("/oauth/token")) return json({ access_token: "tok" });
    return url.searchParams.get("cursor")
      ? json({ profiles: [profiel("2", "B", "2026-11-02T10:00:00Z")], total: 2 })
      : json({ profiles: [profiel("1", "A", "2026-11-01T10:00:00Z")], total: 2, nextCursor: "volgende" });
  });
  const uit = await blueconicBron(blueconicApi(CONFIG, { doeFetch, wachttijden: [] }), CONFIG).profielenSinds("2026-07-01");
  assert.equal(uit.length, 2);
  assert.equal(verzoeken.at(-1)?.url.searchParams.get("cursor"), "volgende");
  assert.equal(verzoeken.length, 3);
});

test("profielen zonder SSO-id wijzen op een PII-eigenschap", async () => {
  const { doeFetch } = nep(({ url }) => {
    if (url.pathname.endsWith("/oauth/token")) return json({ access_token: "tok" });
    return Number(url.searchParams.get("startIndex")) ? json({ profiles: [] }) : json({ profiles: [profiel("1", null, "2026-11-01T10:00:00Z")] });
  });
  await assert.rejects(blueconicBron(blueconicApi(CONFIG, { doeFetch, wachttijden: [] }), CONFIG).profielenSinds("2026-07-01"), /PII/);
});

test("een geweigerd token geeft uitleg; dezelfde pagina twee keer is een fout", async () => {
  const geweigerd = nep(() => json({ error: "invalid_client" }, 401));
  await assert.rejects(blueconicApi(CONFIG, { doeFetch: geweigerd.doeFetch, wachttijden: [] }).get("/profiles"), /invalid_client.*BLUECONIC_CLIENT_ID/s);

  const steeds = nep(({ url }) => (url.pathname.endsWith("/oauth/token") ? json({ access_token: "tok" }) : json({ profiles: [profiel("1", "A", "2026-11-01")] })));
  await assert.rejects(blueconicBron(blueconicApi(CONFIG, { doeFetch: steeds.doeFetch, wachttijden: [] }), CONFIG).profielenSinds("2026-07-01"), /pagineren/);
});

test("vraagt de scopes expliciet als BlueConic daarom vraagt", async () => {
  const { doeFetch, verzoeken } = nep(({ url, init }) => {
    if (!url.pathname.endsWith("/oauth/token")) return json({ id: "x" });
    return /scope=/.test(String(init?.body)) ? json({ access_token: "tok" }) : json({ error: "invalid_scope" }, 400);
  });
  const api = blueconicApi(CONFIG, { doeFetch, wachttijden: [] });
  await api.get("/segments/x");
  assert.match(String(verzoeken[1].init?.body), /scope=read%3Aprofiles/);
});
