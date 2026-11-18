import { test } from "node:test";
import assert from "node:assert/strict";

import { PAGE_GROUPS } from "../access";
import { ASSISTENT_TOOLS } from "./tools";
import { toolsVoor } from "./toegang";

const PAGINAS = PAGE_GROUPS.flatMap((g) => g.pages.map((p) => p.href));

test("elke tool hangt aan een pagina met rechten, met een unieke naam", () => {
  const namen = ASSISTENT_TOOLS.map((t) => t.name);
  assert.equal(new Set(namen).size, namen.length);
  for (const tool of ASSISTENT_TOOLS) {
    assert.ok(PAGINAS.includes(tool.page), `${tool.name}: ${tool.page} staat niet in het gebruikersbeheer, dus niemand krijgt de tool`);
    assert.match(tool.name, /^[a-z_]+$/);
    if (tool.href) assert.ok(tool.href.startsWith("/dashboard/"), tool.name);
  }
});

test("wachtlijst en seizoen: wie Ticketing Stadion mag zien, krijgt ze; de bron linkt naar hun eigen pagina", () => {
  const namen = toolsVoor(["/dashboard/ticketing-stadion"], ASSISTENT_TOOLS).map((t) => t.name);
  assert.ok(namen.includes("wachtlijst"));
  assert.ok(namen.includes("ticketing_stadion_seizoen"));
  assert.ok(!toolsVoor(["/dashboard/fandesk"], ASSISTENT_TOOLS).some((t) => t.name === "wachtlijst"));
  assert.equal(ASSISTENT_TOOLS.find((t) => t.name === "wachtlijst")?.href, "/dashboard/wachtlijst");
  assert.equal(ASSISTENT_TOOLS.find((t) => t.name === "ticketing_stadion_seizoen")?.href, "/dashboard/ticketing-stadion/seizoen");
});
