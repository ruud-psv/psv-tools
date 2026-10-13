import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { metaConnector, unreadableIds } from "./meta";

/** 60 advertenties: twee `?ids=`-blokken, van 50 en van 10. */
const AD_IDS = Array.from({ length: 60 }, (_, i) => String(1001 + i));
const WINDOW = { from: "2026-09-14", to: "2026-10-13" };

const realFetch = globalThis.fetch;

beforeEach(() => {
  process.env.META_ADS_ACCESS_TOKEN = "test-token";
  process.env.META_ADS_ACCOUNT_ID = "123";
  // De koppeling logt elke mislukte laag; in de testuitvoer is dat ruis.
  mock.method(console, "error", () => {});
  mock.method(console, "warn", () => {});
});

afterEach(() => {
  globalThis.fetch = realFetch;
  mock.restoreAll();
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function graphError(message: string, status = 400): Response {
  return json({ error: { message, type: "OAuthException", code: 100 } }, status);
}

const row = { campaign_id: "c1", objective: "OUTCOME_TRAFFIC", spend: "10", impressions: "100" };

/**
 * Een nagebootste Graph API: vaste Insights-rijen, en voor `?ids=` wat
 * `nodes` ervan maakt. Houdt elke `?ids=`-aanvraag bij.
 */
function mockGraph(nodes: (ids: string[], fields: string) => Response) {
  const calls: { ids: string[]; fields: string }[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/insights")) {
      const level = url.searchParams.get("level");
      if (url.searchParams.has("breakdowns") || url.searchParams.has("time_increment")) {
        return json({ data: [] });
      }
      if (level === "campaign") return json({ data: [{ ...row, campaign_name: "Campagne" }] });
      if (level === "adset") return json({ data: [{ ...row, adset_id: "s1", adset_name: "Set" }] });
      return json({
        data: AD_IDS.map((id) => ({ ...row, adset_id: "s1", ad_id: id, ad_name: `Ad ${id}` })),
      });
    }
    const ids = url.searchParams.get("ids")!.split(",");
    const fields = url.searchParams.get("fields")!;
    calls.push({ ids, fields });
    return nodes(ids, fields);
  }) as typeof fetch;
  return calls;
}

/** Een geslaagd `?ids=`-antwoord: een creative per advertentie, targeting per set. */
function found(ids: string[], fields: string): Response {
  return json(
    Object.fromEntries(
      ids.map((id) => [
        id,
        fields.includes("creative")
          ? { id, creative: { thumbnail_url: `https://cdn.test/${id}.jpg` } }
          : { id, targeting: { age_min: 18, age_max: 65 } },
      ])
    )
  );
}

test("id's die Graph als onleesbaar aanwijst", () => {
  const ids = ["1001", "1002", "1003"];
  assert.deepEqual(
    unreadableIds("(#803) Some of the aliases you requested do not exist: 1001,1003", ids),
    ["1001", "1003"]
  );
  assert.deepEqual(
    unreadableIds(
      "Unsupported get request. Object with ID '1002' does not exist, cannot be loaded due to missing permissions",
      ids
    ),
    ["1002"]
  );
  assert.deepEqual(unreadableIds("(#4) Application request limit reached", ids), []);
});

test("een onleesbare advertentie kost alleen haar eigen afbeelding", async () => {
  const calls = mockGraph((ids, fields) =>
    ids.includes("1007")
      ? graphError("(#803) Some of the aliases you requested do not exist: 1007", 404)
      : found(ids, fields)
  );

  const result = await metaConnector.fetchAll(WINDOW);

  assert.equal(result.ads.length, 60);
  const missing = result.ads.filter((a) => !a.thumbnailUrl).map((a) => a.id);
  assert.deepEqual(missing, ["1007"]);
  assert.equal(result.ads.find((a) => a.id === "1001")?.thumbnailUrl, "https://cdn.test/1001.jpg");
  assert.deepEqual(result.warnings, []);
  // Het blok met 1007 ging één keer opnieuw, zonder 1007.
  const creativeCalls = calls.filter((c) => c.fields.includes("creative"));
  assert.equal(creativeCalls.length, 3);
  assert.ok(creativeCalls.some((c) => c.ids.length === 49 && !c.ids.includes("1007")));
});

test("een mislukt blok laat de andere afbeeldingen staan en meldt wat ontbreekt", async () => {
  mockGraph((ids, fields) =>
    ids.includes("1060") ? graphError("(#2) Service temporarily unavailable", 503) : found(ids, fields)
  );

  const result = await metaConnector.fetchAll(WINDOW);

  assert.equal(result.ads.filter((a) => a.thumbnailUrl).length, 50);
  assert.equal(result.warnings?.length, 1);
  assert.equal(result.warnings?.[0].part, "creatives");
  assert.match(result.warnings![0].message, /^10 van 60 niet opgehaald — .*Service temporarily unavailable/);
});

test("mislukken alle afbeeldingen, dan blijven de cijfers staan en komt de reden mee", async () => {
  const calls = mockGraph((ids, fields) =>
    fields.includes("creative") ? graphError("(#100) Tried accessing nonexisting field") : found(ids, fields)
  );

  const result = await metaConnector.fetchAll(WINDOW);

  assert.equal(result.ads.length, 60);
  assert.ok(result.ads.every((a) => a.thumbnailUrl === null));
  assert.equal(result.adSets[0].targeting?.age, null);
  assert.equal(result.warnings?.length, 1);
  assert.equal(result.warnings?.[0].part, "creatives");
  assert.match(result.warnings![0].message, /Tried accessing nonexisting field/);
  // Eerst op galerijformaat, daarna nog een keer met de standaardthumbnail.
  const fieldsTried = [...new Set(calls.filter((c) => c.fields.includes("creative")).map((c) => c.fields))];
  assert.equal(fieldsTried.length, 2);
  assert.ok(fieldsTried[1].startsWith("creative{"));
});

test("het token komt niet in de waarschuwing terecht", async () => {
  mockGraph((ids, fields) =>
    fields.includes("creative")
      ? graphError("Invalid OAuth access token test-token", 401)
      : found(ids, fields)
  );

  const result = await metaConnector.fetchAll(WINDOW);

  assert.equal(result.warnings?.length, 1);
  assert.ok(!result.warnings![0].message.includes("test-token"));
});
