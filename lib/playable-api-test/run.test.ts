import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { PlayableTestError, runPlayableApiTest } from "./run";
import { SAMPLE_SPEC_YAML } from "./fixtures";

const realFetch = globalThis.fetch;
const SECRET = "geheim-dat-nergens-mag-staan";
const TOKEN = "token-dat-nergens-mag-staan";

interface Call {
  method: string;
  url: string;
  scopes?: string[];
  auth?: string | null;
}

/**
 * Playable na. `allowed` zijn de rechten die de sleutels krijgen; een token
 * met een ander recht wordt geweigerd zoals Laravel Passport dat doet.
 */
function fakePlayable(allowed: string[], opts: { ignoreScopes?: boolean } = {}) {
  const calls: Call[] = [];
  process.env.PLAYABLE_CLIENT_ID = "client-1";
  process.env.PLAYABLE_SECRET = SECRET;

  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);

    if (url === "https://api.playable.com/openapi.yaml") {
      calls.push({ method, url });
      return new Response(SAMPLE_SPEC_YAML);
    }

    if (url === "https://api.playable.com/oauth/token") {
      const body = JSON.parse(String(init?.body));
      calls.push({ method, url, scopes: body.scope });
      const ok = opts.ignoreScopes || (body.scope as string[]).every((s) => allowed.includes(s));
      if (!ok) {
        return Response.json(
          { error: "invalid_scope", error_description: "The requested scope is invalid, unknown, or malformed" },
          { status: 400 }
        );
      }
      return Response.json({ token_type: "Bearer", expires_in: 3600, access_token: TOKEN });
    }

    calls.push({ method, url, auth: headers.get("authorization") });
    const path = new URL(url).pathname + new URL(url).search;
    switch (path) {
      case "/v1/campaign/123":
        return Response.json({
          data: { id: 123, name: "Seizoenkaarten", demo_url: "https://demo.playable.com/123", live_url: "https://club.psv.nl/seizoenkaarten" },
        });
      case "/v1/campaign/123/sections":
        return Response.json({ data: [{ id: 5 }, { id: 6 }] });
      case "/v1/campaign/123/sections/5":
        return Response.json({
          data: {
            id: 5,
            settings: {
              html: '<div id="psvk-app" class="psvk-app"><section class="psvk-hero psvk-red"><h1>Titel</h1></section></div>',
              css: "#psvk-app .psvk-hero { color: var(--psvk-red); } @media (max-width: 520px) { #psvk-app { padding: 0; } }",
            },
          },
        });
      case "/v1/campaign/123/sections/6":
        return Response.json({ data: { id: 6, type: "form" } });
      case "/v1/campaigns?per_page=100&page=1":
        return Response.json({
          data: [{ id: 123, name: "Seizoenkaarten", demo_url: "https://demo.playable.com/123", live_url: "https://club.psv.nl/seizoenkaarten" }],
          links: { next: null },
        });
      default:
        return Response.json({ message: "Not found" }, { status: 404 });
    }
  };
  return calls;
}

beforeEach(() => {
  globalThis.fetch = realFetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.PLAYABLE_CLIENT_ID;
  delete process.env.PLAYABLE_SECRET;
});

const READ_ONLY = ["campaigns.list", "campaigns.view", "campaigns.sections.list", "campaigns.sections.view"];

test("per recht: lees-rechten wel, modify en copy niet, code gevonden", async () => {
  const calls = fakePlayable(READ_ONLY);
  const report = await runPlayableApiTest("123");

  assert.equal(report.scopeMethod, "per-recht");
  const granted = Object.fromEntries(report.scopes.map((s) => [s.name, s.granted]));
  assert.equal(granted["campaigns.view"], true);
  assert.equal(granted["campaigns.modify"], false);
  assert.equal(granted["campaigns.copy"], false);
  assert.equal(granted["campaigns.registrations.list"], false);
  assert.equal(report.conclusion.modify, false);
  assert.equal(report.conclusion.copy, false);

  assert.deepEqual(report.readScopes, READ_ONLY);
  assert.equal(report.campaign.name, "Seizoenkaarten");
  assert.equal(report.campaign.liveUrl, "https://club.psv.nl/seizoenkaarten");

  assert.ok(report.conclusion.codeFound);
  assert.ok(report.conclusion.psvkFound);
  assert.deepEqual([...report.conclusion.codeLocations].sort(), [
    "GET /v1/campaign/123/sections/5 → data.settings.css",
    "GET /v1/campaign/123/sections/5 → data.settings.html",
  ]);
  assert.deepEqual(
    report.conclusion.writeOperations.map((o) => `${o.method} ${o.path}`),
    ["put /v1/campaign/{campaign}", "post /v1/campaign/{campaign}/copy"]
  );

  // Alleen GET naar de API, nooit naar registraties.
  const apiCalls = calls.filter((c) => !c.url.endsWith("/oauth/token") && !c.url.endsWith("openapi.yaml"));
  assert.ok(apiCalls.every((c) => c.method === "GET"));
  assert.ok(apiCalls.every((c) => c.auth === `Bearer ${TOKEN}`));
  assert.ok(!apiCalls.some((c) => c.url.includes("registrations")));
  assert.deepEqual(
    apiCalls.map((c) => new URL(c.url).pathname),
    ["/v1/campaign/123", "/v1/campaign/123/sections", "/v1/campaign/123/sections/5", "/v1/campaign/123/sections/6"]
  );

  // Het token voor het lezen bevat geen schrijf- of registratierechten.
  const readTokenRequest = calls.filter((c) => c.url.endsWith("/oauth/token")).at(-1);
  assert.deepEqual(readTokenRequest?.scopes, READ_ONLY);

  // Geen geheimen in het rapport.
  const json = JSON.stringify(report);
  assert.ok(!json.includes(SECRET));
  assert.ok(!json.includes(TOKEN));
});

test("alles in één keer toegekend: één tokenverzoek plus de controle", async () => {
  const calls = fakePlayable([
    ...READ_ONLY,
    "campaigns.modify",
    "campaigns.copy",
    "campaigns.registrations.list",
    "campaigns.pause",
    "campaigns.resume",
  ]);
  const report = await runPlayableApiTest("123");

  assert.equal(report.scopeMethod, "alles-tegelijk");
  assert.ok(report.scopes.every((s) => s.granted === true));
  assert.equal(report.conclusion.modify, true);
  assert.equal(report.conclusion.copy, true);
  // Het lees-token blijft zonder registraties.
  assert.ok(!report.readScopes.includes("campaigns.registrations.list"));
  // Eén keer alles, één keer het verzonnen recht, één keer het lees-token.
  assert.equal(calls.filter((c) => c.url.endsWith("/oauth/token")).length, 3);
});

test("Playable kijkt niet naar rechten: dan weten we het niet", async () => {
  fakePlayable([], { ignoreScopes: true });
  const report = await runPlayableApiTest("123");
  assert.ok(report.scopes.every((s) => s.granted === null));
  assert.equal(report.conclusion.modify, null);
  assert.ok(report.reads.length > 0);
});

test("zoeken op adres van de livepagina", async () => {
  fakePlayable(READ_ONLY);
  const report = await runPlayableApiTest("https://club.psv.nl/seizoenkaarten/?utm_source=mail");
  assert.equal(report.campaign.id, 123);
  assert.equal(report.campaign.name, "Seizoenkaarten");
});

test("onbekend adres en ongeldige invoer", async () => {
  fakePlayable(READ_ONLY);
  await assert.rejects(runPlayableApiTest("https://club.psv.nl/bestaat-niet"), /Geen campagne gevonden/);
  await assert.rejects(runPlayableApiTest("seizoenkaarten"), PlayableTestError);
});

test("zonder sleutels een duidelijke melding", async () => {
  await assert.rejects(runPlayableApiTest("123"), /PLAYABLE_CLIENT_ID of PLAYABLE_SECRET ontbreekt/);
});

test("shortMessage lakt lange sleutels weg, laat korte waarden staan", async () => {
  const { shortMessage } = await import("./run");
  const creds = { clientId: "7", clientSecret: "abcdefgh12345678" };
  assert.equal(
    shortMessage({ error_description: "Client 7 with secret abcdefgh12345678 is   invalid" }, "", creds),
    "Client 7 with secret [geheim] is invalid"
  );
  assert.equal(shortMessage(undefined, "Server error", creds), "Server error");
});
