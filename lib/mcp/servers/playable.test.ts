import { test } from "node:test";
import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { PlayableConfigError, PlayableFout, normaliseerCampagne, normaliseerStatistieken } from "../../playable/rapport";
import { checkToolInput, toolKind } from "../config";
import { createPlayableServer, type PlayableApi } from "./playable";

const nep: PlayableApi = {
  async campagnes() {
    return {
      lijst: [
        normaliseerCampagne({ id: 1, name: "Fanstore - Coen Dillen tenue - DMID26-17577", active: true, live_url: "https://club.psv.nl/coendillen", created_on: "2026-10-01" }),
        normaliseerCampagne({ id: 2, name: "Ticketing - Wachtlijst SCC - DMID26-11224", active: false, created_on: "2026-05-06" }),
      ],
    };
  },
  async statistieken(id) {
    if (id === 404) throw new PlayableFout("Campaign not found", 404);
    return normaliseerStatistieken({ sessions: 3832, registrations: 410, unique_registration: 398, conversion: 10.4 });
  },
  async aanmeldingenPerDag() {
    return { data: [{ date: "2026-10-01", registrations: 120 }] };
  },
};

async function verbind(playable: () => PlayableApi) {
  const server = createPlayableServer({ playable });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

function tekst(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return ((result.content ?? []) as { text?: string }[]).map((c) => c.text ?? "").join("\n");
}

test("drie tools, allemaal alleen lezen", async () => {
  const client = await verbind(() => nep);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name), ["campagnes", "statistieken", "aanmeldingen_per_dag"]);
  for (const tool of tools) assert.equal(toolKind({ annotations: tool.annotations }), "leest");
  const schema = tools[1].inputSchema as Record<string, unknown>;
  assert.ok("input" in checkToolInput(schema, { campagne_ids: [1, 2] }));
  assert.ok("error" in checkToolInput(schema, {}));
  await client.close();
});

test("zoeken en cijfers: van Coen Dillen naar de statistieken", async () => {
  const client = await verbind(() => nep);
  const gevonden = await client.callTool({ name: "campagnes", arguments: { zoek: "Coen Dillen" } });
  assert.match(tekst(gevonden), /1 gevonden van 2/);
  assert.match(tekst(gevonden), /club\.psv\.nl\/coendillen/);

  const stats = await client.callTool({ name: "statistieken", arguments: { campagne_ids: [1, 404] } });
  assert.equal(stats.isError, undefined);
  assert.match(tekst(stats), /1 \| Fanstore - Coen Dillen tenue - DMID26-17577 \| ja \| 3832 \| 410 \| 398 \| 10\.4/);
  assert.match(tekst(stats), /404 \| onbekend \| fout: 404 Campaign not found/);

  const perDag = await client.callTool({ name: "aanmeldingen_per_dag", arguments: { campagne_id: 1 } });
  assert.match(tekst(perDag), /2026-10-01 \| 120/);
  await client.close();
});

test("fouten: alleen onbekende id's, of geen instellingen", async () => {
  const client = await verbind(() => nep);
  const alleenFout = await client.callTool({ name: "statistieken", arguments: { campagne_ids: [404] } });
  assert.equal(alleenFout.isError, true);
  assert.match(tekst(alleenFout), /Playable gaf een fout \(404\): geen cijfers: 404: 404 Campaign not found/);
  await client.close();

  const zonder = await verbind(() => {
    throw new PlayableConfigError("Playable-configuratie ontbreekt: PLAYABLE_SECRET.");
  });
  const geen = await zonder.callTool({ name: "campagnes", arguments: {} });
  assert.equal(geen.isError, true);
  assert.equal(tekst(geen), "Playable-configuratie ontbreekt: PLAYABLE_SECRET.");
  await zonder.close();
});
