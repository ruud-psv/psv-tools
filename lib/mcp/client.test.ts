import { test } from "node:test";
import assert from "node:assert/strict";

import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { authHeaders, describeError, McpConfigError, serverMessage } from "./client";

test("token uit de omgevingsvariabele, nooit met witruimte", () => {
  assert.deepEqual(authHeaders({ type: "geen" }, {}), {});
  assert.deepEqual(authHeaders({ type: "bearer", envVar: "MCP_X" }, { MCP_X: " abc " }), { Authorization: "Bearer abc" });
  assert.deepEqual(authHeaders({ type: "header", header: "X-Api-Key", envVar: "MCP_X" }, { MCP_X: "abc" }), { "X-Api-Key": "abc" });
  assert.throws(() => authHeaders({ type: "bearer", envVar: "MCP_X" }, {}), McpConfigError);
  assert.throws(() => authHeaders({ type: "bearer", envVar: "MCP_X" }, { MCP_X: "ab c" }), /spaties/);
});

test("de melding van de server zonder de JSON eromheen", () => {
  const body = '{"jsonrpc":"2.0","error":{"code":-32001,"message":"Deze MCP-server staat uit."},"id":null}';
  assert.equal(serverMessage(`Error POSTing to endpoint: ${body}`), "Deze MCP-server staat uit.");
  assert.equal(serverMessage('{"error":"kapot"}'), "kapot");
  assert.equal(serverMessage("<html>Bad gateway</html>"), null);
  assert.equal(serverMessage("geen json { hier"), null);

  assert.equal(
    describeError(new StreamableHTTPError(503, `Error POSTing to endpoint: ${body}`)),
    "De server gaf een fout (503): Deze MCP-server staat uit."
  );
  // Zonder leesbare melding: de ruwe tekst, afgekapt.
  assert.match(describeError(new StreamableHTTPError(502, "Error POSTing to endpoint: Bad gateway")), /Bad gateway/);
  assert.match(describeError(new StreamableHTTPError(401, "x")), /weigert het token \(401\)/);
});

test("een gedeeld token gaat nooit naar een andere partij, ook niet uit oude opslag", async () => {
  const { inspectServer } = await import("./client");
  process.env.META_ADS_ACCESS_TOKEN = "geheim";
  try {
    await assert.rejects(
      inspectServer({ url: "https://mcp.example.com/mcp", auth: { type: "bearer", envVar: "META_ADS_ACCESS_TOKEN" } }),
      (err: Error) => err instanceof McpConfigError && /mag niet naar mcp\.example\.com/.test(err.message)
    );
  } finally {
    delete process.env.META_ADS_ACCESS_TOKEN;
  }
});
