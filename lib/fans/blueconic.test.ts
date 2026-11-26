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
  profielVraag,
  zoekSegment,
  type BlueconicConfig,
} from "./blueconic";

const ENV = { BLUECONIC_CLIENT_ID: "id", BLUECONIC_CLIENT_SECRET: "geheim" };

test("config: client ID en secret verplicht; segment, host en scopes met standaard", () => {
  assert.equal(isBlueconicIngesteld({}), false);
  assert.throws(() => blueconicConfig({ BLUECONIC_CLIENT_ID: "id" }), /BLUECONIC_CLIENT_SECRET/);
  const c = blueconicConfig({ ...ENV, BLUECONIC_HOST: "https://psv.blueconic.com/" });
  assert.equal(c.host, "psv.blueconic.com");
  assert.equal(c.segmentId, STANDAARD_SEGMENT);
  assert.equal(c.eigenschapSso, null);
  assert.equal(c.scopes, "", "volgens de documentatie hoort er geen scope in de tokenvraag");
  assert.equal(blueconicConfig({ ...ENV, BLUECONIC_SCOPES: "read:profiles" }).scopes, "read:profiles");
});

test("datums als milliseconden of ISO-tekst worden een Nederlandse dag", () => {
  assert.equal(dagUitWaarde(String(Date.parse("2026-10-31T23:30:00Z"))), "2026-11-01");
  assert.equal(dagUitWaarde("2026-11-26T10:30:00.000Z"), "2026-11-26");
  assert.equal(dagUitWaarde(""), null);
  assert.equal(dagUitWaarde("geen datum"), null);
});

test("een pagina uit /segments/{id}/profiles: eigenschappen, totaal en nextCursor", () => {
  const pagina = leesProfielPagina({
    itemsPerPage: 20,
    totalPages: 5,
    totalResults: 100,
    cursor: "*",
    nextCursor: "AoJy",
    profiles: [{ id: "p1", properties: [{ id: "sso_id", values: ["ABC"] }, { id: "login", values: ["1764150000000"] }] }],
  });
  assert.deepEqual([pagina.profielen[0].id, pagina.profielen[0].eigenschappen.get("sso_id"), pagina.totaal, pagina.volgende], ["p1", ["ABC"], 100, "AoJy"]);
});

test("de vraag voor een pagina: het segment in het pad, cursor, count en de eigenschappen", () => {
  const v = profielVraag(STANDAARD_SEGMENT, ["sso_id", "login"], "*", 50);
  assert.equal(v.pad, `/segments/${STANDAARD_SEGMENT}/profiles`);
  assert.deepEqual(v.params, [
    ["cursor", "*"],
    ["count", "50"],
    ["profileProperty", "sso_id"],
    ["profileProperty", "login"],
    ["properties", "sso_id,login"],
  ]);
});

test("eigenschappen op naam kiezen uit /profileProperties, en bij twijfel de kandidaten noemen", () => {
  const props = {
    profileProperties: [
      { id: "sso_id", name: "SSO ID" },
      { id: "_persoon_sso_ingelogd_datum_meest_recent_", name: "[Persoon] SSO Ingelogd Datum (meest recent)" },
      { id: "sso_first", name: "[Persoon] SSO Ingelogd Datum (eerste)" },
      { id: "email", name: "E-mail" },
    ],
  };
  const k = kiesEigenschappen(props);
  assert.deepEqual([k.sso, k.login], ["sso_id", "_persoon_sso_ingelogd_datum_meest_recent_"]);
  assert.throws(() => kiesEigenschappen({ profileProperties: [{ id: "email", name: "E-mail" }] }), /BLUECONIC_PROP_SSO/);
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
const TOKEN = () => json({ access_token: "tok", token_type: "Bearer", expires_in: 3600 });

const CONFIG: BlueconicConfig = { ...blueconicConfig(ENV), eigenschapSso: "sso", eigenschapLogin: "login" };

function profiel(id: string, sso: string | null, login: string) {
  return { id, properties: [...(sso ? [{ id: "sso", values: [sso] }] : []), { id: "login", values: [login] }] };
}

/** Een segment van drie profielen, twee per pagina, met cursors zoals BlueConic. */
function segmentNep() {
  const alle = [
    profiel("1", "A", "2026-11-25T10:00:00Z"),
    profiel("2", "B", "2026-10-03T10:00:00Z"),
    profiel("3", "C", "2026-11-26T10:00:00Z"),
  ];
  return nep(({ url }) => {
    if (url.pathname === "/rest/v2/oauth/token") return TOKEN();
    if (url.pathname === `/rest/v2/segments/${STANDAARD_SEGMENT}/profiles`) {
      return url.searchParams.get("cursor") === "*"
        ? json({ totalResults: 3, cursor: "*", nextCursor: "c2", profiles: alle.slice(0, 2) })
        : json({ totalResults: 3, cursor: "c2", profiles: alle.slice(2) });
    }
    return json({}, 404);
  });
}

test("token met client credentials in de body, zonder scope; profielen per cursor", async () => {
  const { doeFetch, verzoeken } = segmentNep();
  const uit = await blueconicBron(blueconicApi(CONFIG, { doeFetch, wachttijden: [] }), CONFIG).profielenSinds("2026-11-01");
  assert.deepEqual(uit, [
    { sso: "A", laatsteLogin: "2026-11-25" },
    { sso: "C", laatsteLogin: "2026-11-26" },
  ]);

  const token = verzoeken[0];
  assert.equal(token.url.href, "https://psv.blueconic.com/rest/v2/oauth/token");
  const body = new URLSearchParams(String(token.init?.body));
  assert.deepEqual([body.get("grant_type"), body.get("client_id"), body.get("client_secret"), body.get("scope")], ["client_credentials", "id", "geheim", null]);
  assert.equal(verzoeken.filter((v) => v.url.pathname.endsWith("/oauth/token")).length, 1, "het token wordt hergebruikt");
  assert.deepEqual(verzoeken.slice(1).map((v) => v.url.searchParams.get("cursor")), ["*", "c2"]);
  assert.equal(new Headers(verzoeken[1].init?.headers).get("Authorization"), "Bearer tok");
});

test("nul profielen of een veel te korte lijst is een fout, geen telling", async () => {
  const leeg = nep(({ url }) => (url.pathname.endsWith("/oauth/token") ? TOKEN() : json({ totalResults: 0, profiles: [] })));
  await assert.rejects(blueconicBron(blueconicApi(CONFIG, { doeFetch: leeg.doeFetch, wachttijden: [] }), CONFIG).profielenSinds("2026-07-01"), /0 profielen/);

  // BlueConic zegt 100 profielen, maar er komt er één en geen cursor.
  const kort = nep(({ url }) =>
    url.pathname.endsWith("/oauth/token") ? TOKEN() : json({ totalResults: 100, profiles: [profiel("1", "A", "2026-11-01T10:00:00Z")] })
  );
  await assert.rejects(blueconicBron(blueconicApi(CONFIG, { doeFetch: kort.doeFetch, wachttijden: [] }), CONFIG).profielenSinds("2026-07-01"), /onvolledig/);
});

test("profielen zonder SSO-id wijzen op een PII-eigenschap", async () => {
  const { doeFetch } = nep(({ url }) =>
    url.pathname.endsWith("/oauth/token") ? TOKEN() : json({ totalResults: 1, profiles: [profiel("1", null, "2026-11-01T10:00:00Z")] })
  );
  await assert.rejects(blueconicBron(blueconicApi(CONFIG, { doeFetch, wachttijden: [] }), CONFIG).profielenSinds("2026-07-01"), /PII/);
});

test("zonder eigenschap-ID's zoekt Tools ze op in /profileProperties", async () => {
  const zonder = { ...CONFIG, eigenschapSso: null, eigenschapLogin: null };
  const { doeFetch, verzoeken } = nep(({ url }) => {
    if (url.pathname.endsWith("/oauth/token")) return TOKEN();
    if (url.pathname === "/rest/v2/profileProperties") {
      return json({ profileProperties: [{ id: "sso_id", name: "SSO ID" }, { id: "datum", name: "SSO Ingelogd Datum (meest recent)" }] });
    }
    return json({ totalResults: 1, profiles: [{ id: "1", properties: [{ id: "sso_id", values: ["A"] }, { id: "datum", values: ["2026-11-01T10:00:00Z"] }] }] });
  });
  await blueconicBron(blueconicApi(zonder, { doeFetch, wachttijden: [] }), zonder).profielenSinds("2026-07-01");
  const profielen = verzoeken.find((v) => v.url.pathname.endsWith("/profiles"));
  assert.deepEqual(profielen?.url.searchParams.getAll("profileProperty"), ["sso_id", "datum"]);
});

test("het segment opzoeken in /segments, met profileCount", async () => {
  const { doeFetch } = nep(({ url }) => {
    if (url.pathname.endsWith("/oauth/token")) return TOKEN();
    return json({ segments: [{ id: "x", name: "Ander" }, { id: STANDAARD_SEGMENT, name: "[Doelstelling] Ingelogd via login.psv.nl", profileCount: 64_700 }] });
  });
  assert.deepEqual(await zoekSegment(blueconicApi(CONFIG, { doeFetch, wachttijden: [] }), STANDAARD_SEGMENT), {
    id: STANDAARD_SEGMENT,
    naam: "[Doelstelling] Ingelogd via login.psv.nl",
    profielen: 64_700,
  });
});

test("een geweigerd token geeft uitleg; een 403 noemt de rechten", async () => {
  const geweigerd = nep(() => json({ error: "invalid_client" }, 401));
  await assert.rejects(blueconicApi(CONFIG, { doeFetch: geweigerd.doeFetch, wachttijden: [] }).get("/segments"), /invalid_client.*BLUECONIC_CLIENT_ID/s);

  const verboden = nep(({ url }) => (url.pathname.endsWith("/oauth/token") ? TOKEN() : new Response("", { status: 403 })));
  await assert.rejects(blueconicApi(CONFIG, { doeFetch: verboden.doeFetch, wachttijden: [] }).get("/segments"), /Read op Profiles/);
});

test("de huidige cursor is geen volgende pagina, en zonder eigenschappen gaat er geen lege properties mee", () => {
  assert.equal(leesProfielPagina({ cursor: "*", totalResults: 0, profiles: [] }).volgende, null);
  assert.equal(leesProfielPagina({ cursor: "*", nextCursor: "c2", profiles: [] }).volgende, "c2");
  assert.deepEqual(profielVraag(STANDAARD_SEGMENT, [], "*", 5).params, [
    ["cursor", "*"],
    ["count", "5"],
  ]);
});
