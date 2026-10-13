import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { fetchMetaCreativeImageUrls, isMetaId, metaConnector } from "./meta";

/** 60 advertentiesets: twee blokken voor de targeting, van 50 en van 10. */
const ADSET_IDS = Array.from({ length: 60 }, (_, i) => String(2001 + i));
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
 * Een nagebootste Graph API: vaste Insights-rijen, en voor de lijst
 * advertentiesets van het account wat `adsets` ervan maakt. Houdt elke
 * aanvraag buiten Insights bij.
 */
function mockGraph(adsets: (ids: string[], url: URL) => Response) {
  const calls: URL[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/insights")) {
      const level = url.searchParams.get("level");
      if (url.searchParams.has("breakdowns") || url.searchParams.has("time_increment")) {
        return json({ data: [] });
      }
      if (level === "campaign") return json({ data: [{ ...row, campaign_name: "Campagne" }] });
      if (level === "adset") {
        return json({ data: ADSET_IDS.map((id) => ({ ...row, adset_id: id, adset_name: `Set ${id}` })) });
      }
      return json({ data: [{ ...row, adset_id: ADSET_IDS[0], ad_id: "1001", ad_name: "Ad" }] });
    }
    calls.push(url);
    if (url.searchParams.has("ids")) return graphError("The ids query parameter is deprecated in v26.0+.", 500);
    if (url.pathname.endsWith("/act_123/adsets")) {
      const filtering = JSON.parse(url.searchParams.get("filtering")!) as { value: string[] }[];
      return adsets(filtering[0].value, url);
    }
    return graphError(`Onverwachte aanvraag: ${url.pathname}`, 404);
  }) as typeof fetch;
  return calls;
}

/** Een geslaagd antwoord: targeting voor elke gevraagde set. */
function found(ids: string[]): Response {
  return json({ data: ids.map((id) => ({ id, targeting: { age_min: 18, age_max: 65 } })) });
}

test("targeting komt uit de lijst van het account, niet via ?ids=", async () => {
  const calls = mockGraph(found);

  const result = await metaConnector.fetchAll(WINDOW);

  assert.equal(result.adSets.length, 60);
  assert.ok(result.adSets.every((s) => s.targeting !== null));
  assert.deepEqual(result.warnings, []);
  assert.ok(calls.every((c) => !c.searchParams.has("ids")));
  assert.deepEqual(
    calls.map((c) => JSON.parse(c.searchParams.get("filtering")!)[0].value.length),
    [50, 10]
  );
});

test("een verwijderde set ontbreekt zonder de rest mee te nemen", async () => {
  mockGraph((ids) => found(ids.filter((id) => id !== "2007")));

  const result = await metaConnector.fetchAll(WINDOW);

  const missing = result.adSets.filter((s) => s.targeting === null).map((s) => s.id);
  assert.deepEqual(missing, ["2007"]);
  assert.deepEqual(result.warnings, []);
});

test("een mislukt blok laat de andere targeting staan en meldt wat ontbreekt", async () => {
  mockGraph((ids) =>
    ids.includes("2060") ? graphError("(#2) Service temporarily unavailable", 503) : found(ids)
  );

  const result = await metaConnector.fetchAll(WINDOW);

  assert.equal(result.adSets.filter((s) => s.targeting).length, 50);
  assert.equal(result.warnings?.length, 1);
  assert.equal(result.warnings?.[0].part, "targeting");
  assert.match(result.warnings![0].message, /^10 van 60 niet opgehaald — .*Service temporarily unavailable/);
});

test("volgt de pagina's van de lijst", async () => {
  mockGraph((ids, url) =>
    url.searchParams.has("after")
      ? found(ids.slice(25))
      : json({
          data: ids.slice(0, 25).map((id) => ({ id, targeting: { age_min: 18 } })),
          paging: { next: `${url.toString()}&after=x` },
        })
  );

  const result = await metaConnector.fetchAll(WINDOW);

  assert.ok(result.adSets.every((s) => s.targeting !== null));
});

test("het token komt niet in de waarschuwing terecht", async () => {
  mockGraph(() => graphError("Invalid OAuth access token test-token", 401));

  const result = await metaConnector.fetchAll(WINDOW);

  assert.equal(result.warnings?.length, 1);
  assert.ok(!result.warnings![0].message.includes("test-token"));
});

test("afbeeldingen lopen via de eigen route, zonder bulkaanvraag", async () => {
  const calls = mockGraph(found);

  const result = await metaConnector.fetchAll(WINDOW);

  assert.equal(result.ads[0].thumbnailUrl, "/api/paid-ads/meta/1001/image");
  assert.ok(calls.every((c) => !c.searchParams.get("fields")?.includes("creative")));
});

test("de afbeelding van één advertentie, met terugval op de standaardthumbnail", async () => {
  const fields: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    assert.ok(url.pathname.endsWith("/1001"));
    const f = url.searchParams.get("fields")!;
    fields.push(f);
    if (f.includes("thumbnail_width")) return graphError("(#100) Unknown modifier");
    return json({ creative: { thumbnail_url: "https://scontent.xx.fbcdn.net/t.jpg", image_url: "http://insecure" } });
  }) as typeof fetch;

  const urls = await fetchMetaCreativeImageUrls("1001");

  assert.deepEqual(urls, ["https://scontent.xx.fbcdn.net/t.jpg"]);
  assert.equal(fields.length, 2);
});

test("alleen numerieke advertentie-ID's", () => {
  assert.ok(isMetaId("120210000000000001"));
  assert.ok(!isMetaId("../me"));
  assert.ok(!isMetaId("1001?fields=x"));
});

test("een 500 op Insights halveert de periode en probeert het opnieuw", async () => {
  const ranges: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (!url.pathname.endsWith("/insights")) return json({ data: [] });
    if (url.searchParams.get("level") !== "campaign" || url.searchParams.has("time_increment")) {
      return json({ data: [] });
    }
    const { since, until } = JSON.parse(url.searchParams.get("time_range")!);
    ranges.push(`${since}/${until}`);
    // Het volle blok van dertig dagen is Meta te zwaar; de helften gaan goed.
    if (since === WINDOW.from && until === WINDOW.to) {
      return graphError("An unknown error occurred", 500);
    }
    return json({ data: [{ ...row, campaign_name: "Campagne", spend: "5" }] });
  }) as typeof fetch;

  const campaigns = await metaConnector.fetchCampaigns(WINDOW);

  assert.deepEqual(ranges.slice(0, 3), [
    "2026-09-14/2026-10-13",
    "2026-09-14/2026-09-28",
    "2026-09-29/2026-10-13",
  ]);
  assert.equal(campaigns.length, 1);
  assert.equal(campaigns[0].metrics.spend, 10);
});

test("een 400 op Insights wordt niet opnieuw geprobeerd", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return graphError("(#100) Invalid parameter", 400);
  }) as typeof fetch;

  await assert.rejects(metaConnector.fetchCampaigns(WINDOW), /Invalid parameter/);
  assert.equal(calls, 1);
});
