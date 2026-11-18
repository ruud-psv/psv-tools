import { metaApi } from "@/lib/meta-ads/client";
import { metaConfig } from "@/lib/meta-ads/rapport";
import { mcpRoute } from "@/lib/mcp/servers/http";
import { createMetaAdsServer } from "@/lib/mcp/servers/meta-ads";

/**
 * MCP-server voor Meta Ads, gehost in PSV Tools (Streamable HTTP, zonder
 * sessies). Leest met het token en account van Paid Ads
 * (`META_ADS_ACCESS_TOKEN`, `META_ADS_ACCOUNT_ID`). Toegang tot dit endpoint
 * met een eigen token uit `MCP_META_TOKEN`; zie `docs/beheer.md`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// De Meta-instellingen pas lezen als een tool ze nodig heeft: tools opvragen werkt ook zonder.
const route = mcpRoute("MCP_META_TOKEN", () => createMetaAdsServer({ meta: () => metaApi(metaConfig()) }));

export const POST = route.POST;
export const GET = route.GET;
export const DELETE = route.DELETE;
