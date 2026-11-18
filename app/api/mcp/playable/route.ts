import { playableApi } from "@/lib/playable/client";
import { playableConfig } from "@/lib/playable/rapport";
import { mcpRoute } from "@/lib/mcp/servers/http";
import { createPlayableServer } from "@/lib/mcp/servers/playable";

/**
 * MCP-server voor Playable, gehost in PSV Tools (Streamable HTTP, zonder
 * sessies). Leest met de app-sleutels van Landingspagina's
 * (`PLAYABLE_CLIENT_ID`, `PLAYABLE_SECRET`), met een token dat alleen
 * leesrechten vraagt. Toegang tot dit endpoint met `MCP_PLAYABLE_TOKEN`; zie
 * `docs/beheer.md`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// De Playable-instellingen pas lezen als een tool ze nodig heeft: tools opvragen werkt ook zonder.
const route = mcpRoute("MCP_PLAYABLE_TOKEN", () => createPlayableServer({ playable: () => playableApi(playableConfig()) }));

export const POST = route.POST;
export const GET = route.GET;
export const DELETE = route.DELETE;
