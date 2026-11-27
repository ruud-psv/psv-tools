import { test } from "node:test";
import assert from "node:assert/strict";

import {
  idVan,
  leesVaardigheid,
  vaardighedenContext,
  vaardighedenVoor,
  vaardigheidTool,
  type Vaardigheid,
} from "./vaardigheden";
import { eigenTools, mcpGroepen } from "./catalogus";
import type { McpServer } from "../mcp/config";

const PAGINAS = ["/dashboard/paid-ads", "/dashboard/fandesk"];

function v(id: string, extra: Partial<Vaardigheid> = {}): Vaardigheid {
  return { id, naam: id, wanneer: `Bij ${id}`, instructies: `Doe ${id}`, aan: true, paginas: [], ...extra };
}

test("idVan maakt een id uit de naam", () => {
  assert.equal(idVan("Copy beoordelen"), "copy-beoordelen");
  assert.equal(idVan("  Évaluatie: Campagne!! "), "evaluatie-campagne");
});

test("leesVaardigheid: verplichte velden, uniek id, alleen bekende pagina's", () => {
  const goed = leesVaardigheid(
    { naam: "Copy beoordelen", wanneer: "Bij copy", instructies: "Stap 1", paginas: ["/dashboard/paid-ads", "/x"], aan: false },
    [],
    PAGINAS
  );
  assert.ok("vaardigheid" in goed);
  assert.deepEqual(goed.vaardigheid, {
    id: "copy-beoordelen",
    naam: "Copy beoordelen",
    wanneer: "Bij copy",
    instructies: "Stap 1",
    aan: false,
    paginas: ["/dashboard/paid-ads"],
  });

  assert.ok("fout" in leesVaardigheid({ naam: "X", wanneer: "", instructies: "a" }, [], PAGINAS));
  assert.match(
    (leesVaardigheid({ naam: "Copy beoordelen", wanneer: "a", instructies: "b" }, [v("copy-beoordelen")], PAGINAS) as { fout: string }).fout,
    /al een vaardigheid/
  );
  // Wijzigen houdt het id, ook bij een nieuwe naam.
  const gewijzigd = leesVaardigheid({ naam: "Andere naam", wanneer: "a", instructies: "b" }, [v("copy-beoordelen")], PAGINAS, "copy-beoordelen");
  assert.ok("vaardigheid" in gewijzigd && gewijzigd.vaardigheid.id === "copy-beoordelen");
  assert.ok("fout" in leesVaardigheid({ naam: "!!!", wanneer: "a", instructies: "b" }, [], PAGINAS));
});

test("vaardighedenVoor: alleen aan, en alleen voor wie de pagina mag zien", () => {
  const alle = [v("a"), v("b", { aan: false }), v("c", { paginas: ["/dashboard/paid-ads"] })];
  assert.deepEqual(vaardighedenVoor(alle, ["/dashboard/fandesk"]).map((x) => x.id), ["a"]);
  assert.deepEqual(vaardighedenVoor(alle, ["/dashboard/paid-ads"]).map((x) => x.id), ["a", "c"]);
});

test("context en tool: lijst in de prompt, instructies op aanvraag", async () => {
  assert.equal(vaardighedenContext([]), null);
  assert.equal(vaardigheidTool([]), null);
  const lijst = [v("copy-beoordelen", { naam: "Copy beoordelen", wanneer: "Als iemand copy wil laten beoordelen" })];
  assert.match(vaardighedenContext(lijst)!, /- copy-beoordelen: Als iemand copy wil laten beoordelen/);
  const tool = vaardigheidTool(lijst)!;
  assert.equal(tool.geenBron, true);
  assert.ok("fout" in tool.lees({ naam: "iets-anders" }));
  const gelezen = tool.lees({ naam: "copy-beoordelen" });
  assert.ok("invoer" in gelezen);
  assert.match(await tool.run(gelezen.invoer), /Copy beoordelen[\s\S]*Doe copy-beoordelen/);
});

test("catalogus: eigen tools en MCP-tools met status", () => {
  const eigen = eigenTools();
  const namen = eigen.flatMap((g) => g.tools.map((t) => t.naam));
  for (const naam of ["kennisbank_pagina", "stuk_maken", "meta_creatives_tonen", "meta_creative_beelden", "vaardigheid_lezen"]) {
    assert.ok(namen.includes(naam), naam);
  }
  assert.equal(new Set(namen).size, namen.length);

  const server: McpServer = {
    id: "metaads",
    name: "Meta Ads",
    url: "https://example.test/mcp",
    auth: { type: "geen" } as McpServer["auth"],
    page: "/dashboard/paid-ads",
    enabled: true,
    tools: [
      { name: "rapport", description: "Cijfers", inputSchema: { type: "object", properties: { niveau: {} }, required: ["niveau"] }, annotations: { readOnlyHint: true }, enabled: true },
      { name: "campagnes", description: "Lijst", inputSchema: { type: "object" }, annotations: { readOnlyHint: true }, enabled: false },
      { name: "wijzig", description: "Schrijft", inputSchema: { type: "object" }, annotations: { readOnlyHint: false, destructiveHint: true }, enabled: false },
    ],
  };
  const [groep] = mcpGroepen([server]);
  assert.deepEqual(groep.tools.map((t) => t.status), ["aan", "uit", "geblokkeerd"]);
  assert.deepEqual(groep.tools[0].velden, ["niveau*"]);
  assert.match(groep.tools[0].naam, /^mcp_metaads_rapport/);
  assert.deepEqual(mcpGroepen([{ ...server, enabled: false }])[0].tools.map((t) => t.status), ["server uit", "server uit", "server uit"]);
});
