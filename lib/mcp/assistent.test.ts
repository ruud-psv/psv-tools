import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { ToolFout } from "../assistent/toegang";
import { mcpToolsUit } from "./assistent";
import { inspectServer } from "./client";
import { mergeTools, setToolEnabled, type McpServer } from "./config";
import { createGoogleAnalyticsServer, type GaApi } from "./servers/google-analytics";

/**
 * De hele keten over echte HTTP: assistent-tool → MCP-client → de Google
 * Analytics-server van PSV Tools, met een nep-GA in plaats van Google.
 */

const ga: GaApi = {
  async runReport() {
    return {
      dimensionHeaders: [{ name: "pagePath" }],
      metricHeaders: [{ name: "screenPageViews" }],
      rows: [{ dimensionValues: [{ value: "/" }], metricValues: [{ value: "1200" }] }],
      rowCount: 1,
    };
  },
  async runRealtimeReport() {
    throw Object.assign(new Error("7 PERMISSION_DENIED: User does not have sufficient permissions for this property."), { code: 7 });
  },
  async getMetadata() {
    return {};
  },
};

async function startServer(): Promise<{ http: Server; url: string }> {
  const http = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const server = createGoogleAnalyticsServer({
      sites: [{ key: "psv", label: "psv.nl", propertyId: "111", envVar: "GA_PROPERTY_PSV" }],
      ga: () => ga,
      serviceAccount: () => "tools@psv-project.iam.gserviceaccount.com",
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => void server.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined);
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  return { http, url: `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp` };
}

test("assistent: afgekeurde invoer en geen toegang gaan als leesbare melding naar het model", async () => {
  const { http, url } = await startServer();
  try {
    const basis = { id: "googleanalytics", url, auth: { type: "geen" as const } };
    let server: McpServer = {
      ...basis,
      name: "Google Analytics",
      page: "/dashboard/web-verkeer",
      enabled: true,
      tools: mergeTools([], (await inspectServer(basis)).tools).tools,
    };
    for (const tool of server.tools) {
      const r = setToolEnabled(server, tool.name, true, { by: "admin@psv.nl", at: "" });
      assert.ok("server" in r);
      server = r.server;
    }

    assert.equal(mcpToolsUit([server], ["/dashboard/assistent"]).tools.length, 0);
    const { tools, sessie } = mcpToolsUit([server], ["/dashboard/web-verkeer"]);
    const tool = (naam: string) => tools.find((t) => t.name === `mcp_googleanalytics_${naam}`)!;

    // Een lege lijst metrics: de server keurt hem af, het model hoort waarom.
    // (Deze SDK-server geeft dat als tool-fout; andere servers als protocolfout, zie `run`.)
    const leeg = tool("realtime").lees({ site: "psv", metrics: [] });
    assert.ok("invoer" in leeg);
    await assert.rejects(tool("realtime").run(leeg.invoer), (err: Error) => {
      assert.ok(err instanceof ToolFout);
      assert.match(err.message, /^Google Analytics (gaf een fout|keurde de invoer af): .*Input validation error.*metrics/);
      return true;
    });

    // Geen toegang tot de property: de melding zegt welk account welke rol nodig heeft.
    await assert.rejects(tool("realtime").run({ site: "psv", metrics: ["activeUsers"] }), (err: Error) => {
      assert.ok(err instanceof ToolFout);
      assert.match(err.message, /geeft geen toegang tot psv\.nl \(property 111\)/);
      assert.match(err.message, /tools@psv-project\.iam\.gserviceaccount\.com de rol Lezer op property 111/);
      assert.match(err.message, /GA_PROPERTY_PSV/);
      return true;
    });

    const rapport = await tool("rapport").run({ site: "psv", metrics: ["screenPageViews"], dimensies: ["pagePath"], van: "yesterday", tot: "yesterday" });
    assert.match(rapport, /\/ \| 1200/);
    await sessie.close();
  } finally {
    // Open keep-alive-verbindingen van de client houden de server anders in leven.
    http.closeAllConnections();
    http.close();
  }
});
