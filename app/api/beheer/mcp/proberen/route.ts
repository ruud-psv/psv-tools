import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, requireAdmin } from "@/lib/api-admin";
import { describeError, McpSession } from "@/lib/mcp/client";
import { canUseTool, checkToolInput } from "@/lib/mcp/config";
import { readServersStrict } from "@/lib/mcp/store";

/**
 * Een tool proberen vanuit het beheer, met eigen invoer. Alleen tools die de
 * assistent ook zou mogen gebruiken: die lezen, of waarvan een admin heeft
 * bevestigd dat ze alleen lezen.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;

  const body = await readJsonBody(req);
  if (!body || typeof body.id !== "string" || typeof body.tool !== "string") {
    return NextResponse.json({ error: "Ongeldige invoer." }, { status: 400 });
  }

  let servers;
  try {
    servers = await readServersStrict();
  } catch (err) {
    console.error("[beheer/mcp/proberen] Lezen mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "De serverlijst kon niet worden geladen." }, { status: 500 });
  }
  const server = servers.find((s) => s.id === body.id);
  const tool = server?.tools.find((t) => t.name === body.tool);
  if (!server || !tool) return NextResponse.json({ error: "Deze tool bestaat niet (meer)." }, { status: 404 });
  if (!canUseTool(tool)) {
    return NextResponse.json(
      { error: "Alleen tools die lezen kun je proberen. Zegt een tool niets, bevestig dan eerst dat hij alleen leest." },
      { status: 400 }
    );
  }

  const input = checkToolInput(tool.inputSchema, body.invoer);
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

  const session = new McpSession();
  try {
    const result = await session.callTool(server, tool.name, input.input, req.signal);
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[beheer/mcp/proberen] ${server.id}/${tool.name}:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: describeError(err) }, { status: 502 });
  } finally {
    await session.close();
  }
}
