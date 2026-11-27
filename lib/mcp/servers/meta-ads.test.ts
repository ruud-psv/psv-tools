import { test } from "node:test";
import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { MetaConfigError, MetaFout } from "../../meta-ads/rapport";
import { checkToolInput, toolKind } from "../config";
import { createMetaAdsServer, type MetaApi } from "./meta-ads";

function nepMeta(overrides: Partial<MetaApi> = {}) {
  const verzoeken: { soort: string; params: Record<string, string> }[] = [];
  const api: MetaApi = {
    accountPath: "act_123",
    async account() {
      return { name: "PSV", currency: "EUR" };
    },
    async insights(params) {
      verzoeken.push({ soort: "insights", params });
      return { data: [{ campaign_name: "Seizoenkaart", spend: "50.5", inline_link_clicks: "40" }] };
    },
    async objecten(edge, params) {
      verzoeken.push({ soort: edge, params });
      return { data: [{ id: "1", name: "Seizoenkaart", effective_status: "ACTIVE" }] };
    },
    async object(id, params) {
      verzoeken.push({ soort: `object:${id}`, params });
      return { id, message: "Tekst uit de post" };
    },
    ...overrides,
  };
  return { api, verzoeken };
}

async function verbind(meta: () => MetaApi) {
  const server = createMetaAdsServer({ meta });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

function tekst(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return ((result.content ?? []) as { text?: string }[]).map((c) => c.text ?? "").join("\n");
}

test("drie tools, alle drie alleen lezen", async () => {
  const client = await verbind(() => nepMeta().api);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name), ["rapport", "campagnes", "creatives"]);
  for (const tool of tools) assert.equal(toolKind({ annotations: tool.annotations }), "leest");

  const schema = tools[0].inputSchema as Record<string, unknown>;
  assert.deepEqual([...(schema.required as string[])].sort(), ["niveau", "velden"]);
  assert.ok("input" in checkToolInput(schema, { niveau: "campaign", velden: ["spend"], periode: "last_7d" }));
  assert.ok("error" in checkToolInput(schema, { niveau: "account_overview", velden: ["spend"] }));
  await client.close();
});

test("rapport: vraagt Meta om de insights en geeft een tabel", async () => {
  const { api, verzoeken } = nepMeta();
  const client = await verbind(() => api);
  const result = await client.callTool({
    name: "rapport",
    arguments: { niveau: "campaign", velden: ["spend", "inline_link_clicks"], periode: "yesterday" },
  });
  assert.equal(result.isError, undefined);
  assert.match(tekst(result), /META ADS · PSV \(act_123\), valuta EUR · niveau campaign · yesterday/);
  assert.match(tekst(result), /Seizoenkaart \| 50\.5 \| 40/);
  assert.equal(verzoeken[0].params.date_preset, "yesterday");
  await client.close();
});

test("campagnes: alleen actief gaat als filter naar Meta", async () => {
  const { api, verzoeken } = nepMeta();
  const client = await verbind(() => api);
  const result = await client.callTool({ name: "campagnes", arguments: { niveau: "campaign", alleen_actief: true } });
  assert.match(tekst(result), /1 \| Seizoenkaart \| ACTIVE/);
  assert.equal(verzoeken[0].soort, "campaigns");
  assert.equal(verzoeken[0].params.effective_status, '["ACTIVE"]');
  await client.close();
});

test("fouten gaan als leesbare melding terug: invoer, Meta en instellingen", async () => {
  const client = await verbind(() => nepMeta().api);
  const zonderPeriode = await client.callTool({ name: "rapport", arguments: { niveau: "campaign", velden: ["spend"] } });
  assert.equal(zonderPeriode.isError, true);
  assert.match(tekst(zonderPeriode), /Geef een periode/);
  await client.close();

  const meta = nepMeta({
    async insights() {
      throw new MetaFout("(#100) spendd is not valid for fields param (code 100)", 400);
    },
  });
  const fout = await verbind(() => meta.api);
  const result = await fout.callTool({ name: "rapport", arguments: { niveau: "campaign", velden: ["spendd"], periode: "last_7d" } });
  assert.equal(result.isError, true);
  assert.equal(tekst(result), "Meta gaf een fout (400): (#100) spendd is not valid for fields param (code 100)");
  await fout.close();

  const zonderConfig = await verbind(() => {
    throw new MetaConfigError("Meta-configuratie ontbreekt: META_ADS_ACCOUNT_ID.");
  });
  const geen = await zonderConfig.callTool({ name: "campagnes", arguments: { niveau: "ad" } });
  assert.equal(tekst(geen), "Meta-configuratie ontbreekt: META_ADS_ACCOUNT_ID.");
  await zonderConfig.close();
});

test("creatives: copy per advertentie, ook uit een bestaande post", async () => {
  const { api, verzoeken } = nepMeta({
    async objecten(edge, params) {
      verzoeken.push({ soort: edge, params });
      return {
        data: [
          {
            id: "11",
            name: "Shirt 26/27",
            effective_status: "ACTIVE",
            campaign: { name: "Fanstore" },
            adset: { name: "Fans NL" },
            creative: {
              object_story_spec: {
                link_data: {
                  message: "Het nieuwe thuisshirt is er.",
                  name: "Shop het shirt",
                  link: "https://psv.nl/shop",
                  call_to_action: { type: "SHOP_NOW", value: { link: "https://psv.nl/shop" } },
                  picture: "https://scontent.fbcdn.net/x.jpg",
                },
              },
            },
          },
          { id: "12", name: "Boost", effective_status: "PAUSED", creative: { effective_object_story_id: "123_456" } },
        ],
      };
    },
  });
  const client = await verbind(() => api);
  const result = await client.callTool({
    name: "creatives",
    arguments: { advertentie_ids: ["11", "12"], alleen_actief: true },
  });
  const uit = tekst(result);
  assert.equal(result.isError, undefined);
  assert.match(uit, /## Shirt 26\/27 \(id 11, ACTIVE\)/);
  assert.match(uit, /Campagne › set: Fanstore › Fans NL/);
  assert.match(uit, /Tekst: Het nieuwe thuisshirt is er\./);
  assert.match(uit, /Knop: Shop nu \(SHOP_NOW\)/);
  assert.match(uit, /Tekst: Tekst uit de post/);

  const ads = verzoeken.find((v) => v.soort === "ads")!;
  assert.match(ads.params.fields, /creative\{/);
  assert.deepEqual(JSON.parse(ads.params.filtering), [{ field: "id", operator: "IN", value: ["11", "12"] }]);
  assert.equal(ads.params.effective_status, '["ACTIVE"]');
  assert.ok(verzoeken.some((v) => v.soort === "object:123_456"));
  await client.close();
});

test("creatives: een ID dat geen getal is, gaat niet naar Meta", async () => {
  const { api, verzoeken } = nepMeta();
  const client = await verbind(() => api);
  const result = await client.callTool({ name: "creatives", arguments: { advertentie_ids: ["../me"] } });
  assert.equal(result.isError, true);
  assert.equal(verzoeken.length, 0);
  await client.close();
});
