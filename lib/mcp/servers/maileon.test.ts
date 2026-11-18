import { test } from "node:test";
import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { MaileonConfigError, type Mailing } from "../../maileon/rapport";
import { checkToolInput, toolKind } from "../config";
import { createMaileonServer, type MaileonApi } from "./maileon";

const lijst: Mailing[] = [
  { id: 1, naam: "2026.10.02 PSV Fanstore - Coen Dillen tenue - DMID26-17577", type: "regular", status: "done", verzonden: "2026-10-02 10:00:00" },
  { id: 2, naam: "2026.10.20 PSV Ticketing - Wachtlijst SCC - DMID26-11224", type: "regular", status: "done", verzonden: "2026-10-20 09:30:00" },
];

function nep(mailings = lijst) {
  const gevraagd: number[][] = [];
  const api: MaileonApi = {
    mailingsSinds: async () => mailings,
    resultaten: async (ids) => {
      gevraagd.push(ids);
      return ids.map((id) => ({ mailingId: id, ontvangers: 1000, geopend: 0, uniekGeopend: 400, geklikt: 0, uniekGeklikt: 80, bounces: 1, afmeldingen: 2 }));
    },
  };
  return { api, gevraagd };
}

async function verbind(maileon: () => MaileonApi) {
  const server = createMaileonServer({ maileon });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

const tekst = (r: Awaited<ReturnType<Client["callTool"]>>) => ((r.content ?? []) as { text?: string }[]).map((c) => c.text ?? "").join("\n");

test("twee tools, allebei alleen lezen", async () => {
  const client = await verbind(() => nep().api);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name), ["mailings", "resultaten"]);
  for (const tool of tools) assert.equal(toolKind({ annotations: tool.annotations }), "leest");
  assert.ok("input" in checkToolInput(tools[1].inputSchema as Record<string, unknown>, { van: "2026-10-01", tot: "2026-10-31", zoek: "Coen" }));
  await client.close();
});

test("zoeken en resultaten: alleen de gevonden mailings gaan naar Maileon", async () => {
  const { api, gevraagd } = nep();
  const client = await verbind(() => api);
  const gezocht = await client.callTool({ name: "mailings", arguments: { van: "2026-10-01", tot: "2026-10-31", zoek: "Coen Dillen" } });
  assert.match(tekst(gezocht), /1 gevonden/);
  const resultaat = await client.callTool({ name: "resultaten", arguments: { van: "2026-10-01", tot: "2026-10-31", zoek: "17577" } });
  assert.equal(resultaat.isError, undefined);
  assert.match(tekst(resultaat), /\| 1000 \| 400 \| 40\.0 \| 80 \| 8\.0 \| 20\.0 \| 1 \| 2/);
  assert.deepEqual(gevraagd, [[1]]);
  await client.close();
});

test("fouten: periode, te veel mailings en instellingen", async () => {
  const veel = Array.from({ length: 301 }, (_, i) => ({ ...lijst[0], id: i + 1 }));
  const client = await verbind(() => nep(veel).api);
  const omgekeerd = await client.callTool({ name: "mailings", arguments: { van: "2026-11-01", tot: "2026-10-01" } });
  assert.equal(omgekeerd.isError, true);
  assert.match(tekst(omgekeerd), /van ligt na tot/);
  const teVeel = await client.callTool({ name: "resultaten", arguments: { van: "2026-10-01", tot: "2026-10-31" } });
  assert.equal(teVeel.isError, true);
  assert.match(tekst(teVeel), /Dat zijn 301 mailings; hooguit 300/);
  await client.close();

  const zonder = await verbind(() => {
    throw new MaileonConfigError("Maileon-configuratie ontbreekt: MAILEON_API_KEY.");
  });
  assert.equal(tekst(await zonder.callTool({ name: "mailings", arguments: { van: "2026-10-01", tot: "2026-10-31" } })), "Maileon-configuratie ontbreekt: MAILEON_API_KEY.");
  await zonder.close();
});
