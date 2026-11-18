import { test } from "node:test";
import assert from "node:assert/strict";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { controleerToken, mcpFout, mcpRoute } from "./http";

const TOKEN = "t".repeat(40);

async function melding(res: Response | null): Promise<string> {
  return ((await res!.json()) as { error: { message: string } }).error.message;
}

test("token: niet gezet, te kort, fout en goed", async () => {
  const uit = controleerToken("MCP_X", "Bearer iets", {});
  assert.equal(uit?.status, 503);
  assert.match(await melding(uit), /MCP_X is niet gezet/);

  const kort = controleerToken("MCP_X", "Bearer kort", { MCP_X: "kort" });
  assert.equal(kort?.status, 503);
  assert.match(await melding(kort), /korter dan 32 tekens/);

  const fout = controleerToken("MCP_X", `Bearer ${"x".repeat(40)}`, { MCP_X: TOKEN });
  assert.equal(fout?.status, 401);
  assert.equal(fout?.headers.get("WWW-Authenticate"), 'Bearer realm="psv-tools"');
  assert.equal(controleerToken("MCP_X", null, { MCP_X: TOKEN })?.status, 401);
  assert.equal(controleerToken("MCP_X", `Bearer ${TOKEN}`, { MCP_X: ` ${TOKEN} ` }), null);
});

test("route: initialize met token, 405 voor GET, en een foutantwoord van de server", async () => {
  process.env.MCP_TEST_ROUTE = TOKEN;
  try {
    const route = mcpRoute("MCP_TEST_ROUTE", () => new McpServer({ name: "test-server", version: "1.0.0" }));
    const res = await route.POST(
      new Request("https://tools.psv.nl/api/mcp/test", {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "1" } },
        }),
      })
    );
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { result: { serverInfo: { name: string } } }).result.serverInfo.name, "test-server");
    assert.equal(route.GET().status, 405);

    const kapot = mcpRoute("MCP_TEST_ROUTE", () => mcpFout(503, "Geen instellingen."));
    const antwoord = await kapot.POST(new Request("https://x", { method: "POST", headers: { authorization: `Bearer ${TOKEN}` } }));
    assert.equal(antwoord.status, 503);
  } finally {
    delete process.env.MCP_TEST_ROUTE;
  }
});
