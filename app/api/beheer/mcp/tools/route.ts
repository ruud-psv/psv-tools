import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, requireAdmin } from "@/lib/api-admin";
import { serverViews } from "@/lib/mcp/client";
import { setToolEnabled } from "@/lib/mcp/config";
import { readServersStrict, writeServers } from "@/lib/mcp/store";

/**
 * Eén tool van een server aan- of uitzetten. De regels staan in
 * `setToolEnabled`: een tool die schrijft gaat nooit aan, een tool die niet
 * zegt of hij leest alleen met `confirm`.
 */

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;

  const body = await readJsonBody(req);
  if (!body || typeof body.id !== "string" || typeof body.tool !== "string" || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Ongeldige invoer." }, { status: 400 });
  }

  try {
    const servers = await readServersStrict();
    const server = servers.find((s) => s.id === body.id);
    if (!server) return NextResponse.json({ error: "Deze server bestaat niet (meer)." }, { status: 404 });

    const now = new Date().toISOString();
    const result = setToolEnabled(server, body.tool, body.enabled, { confirm: body.confirm === true, by: admin.email, at: now });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

    const next = { ...result.server, updatedAt: now, updatedBy: admin.email };
    const updated = servers.map((s) => (s.id === next.id ? next : s));
    await writeServers(updated);
    return NextResponse.json({ servers: serverViews(updated) });
  } catch (err) {
    console.error("[beheer/mcp/tools] Opslaan mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Opslaan is mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
