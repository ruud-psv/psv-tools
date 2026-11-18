import { timingSafeEqual } from "crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { gaApi, gaClient, gaSites } from "@/lib/google-analytics/client";
import { createGoogleAnalyticsServer } from "@/lib/mcp/servers/google-analytics";

/**
 * MCP-server voor Google Analytics, gehost in PSV Tools (Streamable HTTP).
 *
 * Elke request staat op zichzelf (geen sessies), zodat hij op een
 * Vercel-functie werkt. Toegang met een bearer-token uit `MCP_GA_TOKEN`; de
 * inlog-cookie van PSV Tools geldt hier niet, want de aanroep komt van een
 * MCP-client. Zonder token staat de server uit.
 *
 * De assistent gebruikt hem via Beheer > MCP Servers, met dezelfde
 * omgevingsvariabele als token. Zie `docs/beheer.md`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TOKEN_ENV = "MCP_GA_TOKEN";
const MIN_TOKEN_LENGTH = 32;

function fout(status: number, message: string, headers?: Record<string, string>): Response {
  return Response.json({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }, { status, headers });
}

function controleerToken(header: string | null): Response | null {
  const token = process.env[TOKEN_ENV]?.trim();
  if (!token) return fout(503, `Deze MCP-server staat uit: ${TOKEN_ENV} is niet gezet in Vercel.`);
  if (token.length < MIN_TOKEN_LENGTH) {
    return fout(
      503,
      `Deze MCP-server staat uit: ${TOKEN_ENV} is korter dan ${MIN_TOKEN_LENGTH} tekens. Zet in Vercel een langer token en deploy opnieuw.`
    );
  }
  const gegeven = Buffer.from(header?.startsWith("Bearer ") ? header.slice(7).trim() : "");
  const verwacht = Buffer.from(token);
  if (gegeven.length !== verwacht.length || !timingSafeEqual(gegeven, verwacht)) {
    return fout(401, "Ongeldig of ontbrekend token.", { "WWW-Authenticate": 'Bearer realm="psv-tools"' });
  }
  return null;
}

async function handle(req: Request): Promise<Response> {
  const geweigerd = controleerToken(req.headers.get("authorization"));
  if (geweigerd) return geweigerd;

  const sites = gaSites();
  if (sites.length === 0) return fout(503, "Er zijn geen Google Analytics-properties ingesteld (GA_PROPERTY_*).");

  // De GA-client pas maken als een tool hem nodig heeft: tools opvragen werkt ook zonder service-account.
  const server = createGoogleAnalyticsServer({ sites, ga: () => gaApi(gaClient()) });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export const POST = handle;

/**
 * Zonder sessies is er geen stream voor berichten van de server (GET) en geen
 * sessie om te beëindigen (DELETE). Een open GET-stream zou de functie alleen
 * maar laten doorlopen; de MCP-specificatie staat 405 hier toe.
 */
function nietToegestaan(): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Alleen POST: deze server werkt zonder sessies." }, id: null },
    { status: 405, headers: { Allow: "POST" } }
  );
}

export const GET = nietToegestaan;
export const DELETE = nietToegestaan;
