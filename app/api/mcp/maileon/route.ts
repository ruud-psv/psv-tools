import { maileonApi } from "@/lib/maileon/client";
import { maileonConfig } from "@/lib/maileon/rapport";
import { mcpRoute } from "@/lib/mcp/servers/http";
import { createMaileonServer } from "@/lib/mcp/servers/maileon";

/**
 * MCP-server voor Maileon, gehost in PSV Tools (Streamable HTTP, zonder
 * sessies). Leest met de sleutel van DM Performance (`MAILEON_API_KEY`),
 * alleen de mailinglijst en de resultaten per mailing. Toegang tot dit
 * endpoint met `MCP_MAILEON_TOKEN`; zie `docs/beheer.md`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// De Maileon-instellingen pas lezen als een tool ze nodig heeft: tools opvragen werkt ook zonder.
const route = mcpRoute("MCP_MAILEON_TOKEN", () => createMaileonServer({ maileon: () => maileonApi(maileonConfig()) }));

export const POST = route.POST;
export const GET = route.GET;
export const DELETE = route.DELETE;
