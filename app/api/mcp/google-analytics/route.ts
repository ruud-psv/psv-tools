import { gaApi, gaClient, gaServiceAccountEmail, gaSites } from "@/lib/google-analytics/client";
import { createGoogleAnalyticsServer } from "@/lib/mcp/servers/google-analytics";
import { mcpFout, mcpRoute } from "@/lib/mcp/servers/http";

/**
 * MCP-server voor Google Analytics, gehost in PSV Tools (Streamable HTTP,
 * zonder sessies). Toegang met een bearer-token uit `MCP_GA_TOKEN`; het token,
 * de sessies en de foutantwoorden staan in `lib/mcp/servers/http.ts`.
 *
 * De assistent gebruikt hem via Beheer > MCP Servers, met dezelfde
 * omgevingsvariabele als token. Zie `docs/beheer.md`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const route = mcpRoute("MCP_GA_TOKEN", () => {
  const sites = gaSites();
  if (sites.length === 0) return mcpFout(503, "Er zijn geen Google Analytics-properties ingesteld (GA_PROPERTY_*).");
  // De GA-client pas maken als een tool hem nodig heeft: tools opvragen werkt ook zonder service-account.
  return createGoogleAnalyticsServer({ sites, ga: () => gaApi(gaClient()), serviceAccount: gaServiceAccountEmail });
});

export const POST = route.POST;
export const GET = route.GET;
export const DELETE = route.DELETE;
