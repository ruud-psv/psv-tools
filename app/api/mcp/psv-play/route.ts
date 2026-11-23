import { psvPlayOmgeving } from "@/lib/jwplayer/server";
import { mcpRoute } from "@/lib/mcp/servers/http";
import { createPsvPlayServer } from "@/lib/mcp/servers/psv-play";

/**
 * MCP-server voor PSV Play (JW Player), gehost in PSV Tools (Streamable HTTP,
 * zonder sessies). Leest met `JWPLAYER_SECRET`, alleen analytics en media;
 * schrijven naar JW kan hij niet. Toegang tot dit endpoint met
 * `MCP_PSVPLAY_TOKEN`; zie `docs/psv-play.md`.
 */

export const dynamic = "force-dynamic";
// Ruim: de eerste vraag ooit draait de capability probe.
export const maxDuration = 300;

// De JW-instellingen pas lezen als een tool ze nodig heeft: tools opvragen werkt ook zonder.
const route = mcpRoute("MCP_PSVPLAY_TOKEN", () => createPsvPlayServer({ omgeving: () => psvPlayOmgeving() }));

export const POST = route.POST;
export const GET = route.GET;
export const DELETE = route.DELETE;
