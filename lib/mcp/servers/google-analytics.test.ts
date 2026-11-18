import { test } from "node:test";
import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { GaConfigError } from "../../google-analytics/rapport";
import { checkToolInput, toolKind } from "../config";
import { createGoogleAnalyticsServer, type GaApi } from "./google-analytics";

const sites = [
  { key: "psv", label: "psv.nl", propertyId: "111" },
  { key: "fanstore", label: "psvfanstore.nl", propertyId: "222" },
];

/** Een nep-GA die bijhoudt wat er werd gevraagd. */
function nepGa(overrides: Partial<GaApi> = {}) {
  const verzoeken: unknown[] = [];
  const ga: GaApi = {
    async runReport(request) {
      verzoeken.push(request);
      return {
        dimensionHeaders: [{ name: "pagePath" }],
        metricHeaders: [{ name: "screenPageViews", type: "TYPE_INTEGER" }],
        rows: [{ dimensionValues: [{ value: "/" }], metricValues: [{ value: "1200" }] }],
        rowCount: 1,
      };
    },
    async runRealtimeReport(request) {
      verzoeken.push(request);
      return { rows: [] };
    },
    async getMetadata(name) {
      verzoeken.push(name);
      return { metrics: [{ apiName: "sessions", uiName: "Sessions" }] };
    },
    ...overrides,
  };
  return { ga, verzoeken };
}

async function verbind(ga: () => GaApi) {
  const server = createGoogleAnalyticsServer({ sites, ga });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

function tekst(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = (result.content ?? []) as { type: string; text?: string }[];
  return content.map((c) => c.text ?? "").join("\n");
}

test("drie tools, allemaal alleen lezen, dus meteen aan te zetten in Beheer", async () => {
  const client = await verbind(() => nepGa().ga);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name), ["rapport", "realtime", "velden"]);
  for (const tool of tools) {
    assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
    assert.equal(toolKind({ annotations: tool.annotations }), "leest");
  }
  await client.close();
});

test("het schema van rapport werkt met de controle van de assistent", async () => {
  const client = await verbind(() => nepGa().ga);
  const rapport = (await client.listTools()).tools.find((t) => t.name === "rapport")!;
  const schema = rapport.inputSchema as Record<string, unknown>;
  assert.deepEqual([...(schema.required as string[])].sort(), ["metrics", "site", "tot", "van"]);

  const goed = { site: "psv", metrics: ["screenPageViews"], dimensies: ["pagePath"], van: "yesterday", tot: "yesterday", limiet: 10 };
  assert.ok("input" in checkToolInput(schema, goed));
  assert.ok("error" in checkToolInput(schema, { ...goed, site: "onbekend" }));
  assert.ok("error" in checkToolInput(schema, { ...goed, van: undefined }));
  assert.ok("error" in checkToolInput(schema, { ...goed, limiet: 2.5 }));
  await client.close();
});

test("rapport: vraagt GA met de property van de gekozen site en geeft een tabel", async () => {
  const { ga, verzoeken } = nepGa();
  const client = await verbind(() => ga);
  const result = await client.callTool({
    name: "rapport",
    arguments: { site: "fanstore", metrics: ["screenPageViews"], dimensies: ["pagePath"], van: "yesterday", tot: "yesterday" },
  });
  assert.equal(result.isError, undefined);
  assert.match(tekst(result), /GOOGLE ANALYTICS · psvfanstore.nl \(property 222\)/);
  assert.match(tekst(result), /\/ \| 1200/);
  assert.equal((verzoeken[0] as { property: string }).property, "properties/222");
  await client.close();
});

test("ongeldige invoer komt niet bij GA", async () => {
  const { ga, verzoeken } = nepGa();
  const client = await verbind(() => ga);
  const result = await client
    .callTool({ name: "rapport", arguments: { site: "psv", metrics: [], van: "gisteren", tot: "yesterday" } })
    .catch((err: Error) => ({ isError: true, content: [{ type: "text", text: err.message }] }));
  assert.equal(result.isError, true);
  assert.equal(verzoeken.length, 0);
  await client.close();
});

test("een fout van GA of de instellingen gaat als leesbare melding terug", async () => {
  const fout = nepGa({
    async runReport() {
      throw new Error("3 INVALID_ARGUMENT: Field pageviews is not a valid metric.");
    },
  });
  const client = await verbind(() => fout.ga);
  const result = await client.callTool({
    name: "rapport",
    arguments: { site: "psv", metrics: ["pageviews"], van: "yesterday", tot: "yesterday" },
  });
  assert.equal(result.isError, true);
  assert.equal(tekst(result), "Google Analytics gaf een fout: Field pageviews is not a valid metric.");
  await client.close();

  const zonderAccount = await verbind(() => {
    throw new GaConfigError("GA_SERVICE_ACCOUNT_JSON ontbreekt.");
  });
  const geen = await zonderAccount.callTool({ name: "velden", arguments: { site: "psv" } });
  assert.equal(geen.isError, true);
  assert.equal(tekst(geen), "GA_SERVICE_ACCOUNT_JSON ontbreekt.");
  await zonderAccount.close();
});

test("velden en realtime gebruiken de property van de site", async () => {
  const { ga, verzoeken } = nepGa();
  const client = await verbind(() => ga);
  const velden = await client.callTool({ name: "velden", arguments: { site: "psv", zoek: "session" } });
  assert.match(tekst(velden), /metric sessions: Sessions/);
  assert.equal(verzoeken[0], "properties/111/metadata");
  const realtime = await client.callTool({ name: "realtime", arguments: { site: "psv", metrics: ["activeUsers"] } });
  assert.match(tekst(realtime), /REALTIME · psv.nl/);
  await client.close();
});

test("zonder sites geen server", () => {
  assert.throws(() => createGoogleAnalyticsServer({ sites: [], ga: () => nepGa().ga }), GaConfigError);
});
