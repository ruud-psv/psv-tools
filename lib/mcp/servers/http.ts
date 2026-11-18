import { timingSafeEqual } from "crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

/**
 * De HTTP-kant van de MCP-servers die PSV Tools zelf host (`app/api/mcp/*`).
 *
 * - Toegang met een bearer-token uit een eigen omgevingsvariabele per server.
 *   De inlog-cookie van PSV Tools geldt hier niet, want de aanroep komt van
 *   een MCP-client. Zonder token (of korter dan 32 tekens) staat de server uit.
 * - Elke request staat op zichzelf (geen sessies), zodat het op een
 *   Vercel-functie werkt. Alleen POST: zonder sessies is er geen stream voor
 *   berichten van de server (GET) en niets om te beëindigen (DELETE).
 */

export const MIN_TOKEN_LENGTH = 32;

export function mcpFout(status: number, message: string, headers?: Record<string, string>): Response {
  return Response.json({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }, { status, headers });
}

export function controleerToken(
  tokenEnv: string,
  header: string | null,
  env: Record<string, string | undefined> = process.env
): Response | null {
  const token = env[tokenEnv]?.trim();
  if (!token) return mcpFout(503, `Deze MCP-server staat uit: ${tokenEnv} is niet gezet in Vercel.`);
  if (token.length < MIN_TOKEN_LENGTH) {
    return mcpFout(
      503,
      `Deze MCP-server staat uit: ${tokenEnv} is korter dan ${MIN_TOKEN_LENGTH} tekens. Zet in Vercel een langer token en deploy opnieuw.`
    );
  }
  const gegeven = Buffer.from(header?.startsWith("Bearer ") ? header.slice(7).trim() : "");
  const verwacht = Buffer.from(token);
  if (gegeven.length !== verwacht.length || !timingSafeEqual(gegeven, verwacht)) {
    return mcpFout(401, "Ongeldig of ontbrekend token.", { "WWW-Authenticate": 'Bearer realm="psv-tools"' });
  }
  return null;
}

function nietToegestaan(): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Alleen POST: deze server werkt zonder sessies." }, id: null },
    { status: 405, headers: { Allow: "POST" } }
  );
}

/**
 * De route-handlers voor één MCP-server. `maakServer` geeft de server, of een
 * foutantwoord als er iets aan de instellingen ontbreekt.
 */
export function mcpRoute(tokenEnv: string, maakServer: () => McpServer | Response) {
  async function POST(req: Request): Promise<Response> {
    const geweigerd = controleerToken(tokenEnv, req.headers.get("authorization"));
    if (geweigerd) return geweigerd;
    const server = maakServer();
    if (server instanceof Response) return server;
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    return transport.handleRequest(req);
  }
  return { POST, GET: nietToegestaan, DELETE: nietToegestaan };
}
