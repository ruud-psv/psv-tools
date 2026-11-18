import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, requireAdmin } from "@/lib/api-admin";
import { describeError, inspectServer, serverViews, type McpInspection } from "@/lib/mcp/client";
import { mergeTools, type McpServer } from "@/lib/mcp/config";
import { readServersStrict, writeServers } from "@/lib/mcp/store";

/**
 * Verbinding testen en tools ophalen: maakt verbinding met de server, leest de
 * tools en legt ze naast wat er was opgeslagen (`mergeTools`). Nieuwe tools
 * staan uit, gewijzigde gaan uit.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;

  const id = (await readJsonBody(req))?.id;
  let server: McpServer | undefined;
  try {
    server = (await readServersStrict()).find((s) => s.id === id);
  } catch (err) {
    console.error("[beheer/mcp/sync] Lezen mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "De serverlijst kon niet worden geladen." }, { status: 500 });
  }
  if (!server) return NextResponse.json({ error: "Deze server bestaat niet (meer)." }, { status: 404 });

  const at = new Date().toISOString();
  let inspection: McpInspection | null = null;
  let error: string | undefined;
  try {
    inspection = await inspectServer(server);
  } catch (err) {
    error = describeError(err);
    console.error(`[beheer/mcp/sync] ${server.id}:`, err instanceof Error ? err.message : err);
  }

  try {
    // Opnieuw lezen: het verbinden kan even duren, en intussen kan er iets zijn gewijzigd.
    const servers = await readServersStrict();
    const current = servers.find((s) => s.id === server.id);
    if (!current) return NextResponse.json({ error: "Deze server is intussen verwijderd." }, { status: 404 });
    if (current.url !== server.url) {
      return NextResponse.json({ error: "De URL is intussen gewijzigd. Test de verbinding opnieuw." }, { status: 409 });
    }

    const merge = inspection ? mergeTools(current.tools, inspection.tools) : null;
    const next: McpServer = {
      ...current,
      ...(merge ? { tools: merge.tools } : {}),
      lastSync: inspection
        ? {
            at,
            ok: true,
            serverName: inspection.serverName,
            serverVersion: inspection.serverVersion,
            protocolVersion: inspection.protocolVersion,
            ms: inspection.ms,
          }
        : { at, ok: false, error },
    };
    const updated = servers.map((s) => (s.id === next.id ? next : s));
    await writeServers(updated);
    return NextResponse.json({
      servers: serverViews(updated),
      result: merge
        ? { ok: true, tools: merge.tools.length, added: merge.added, changed: merge.changed, removed: merge.removed }
        : { ok: false, error },
    });
  } catch (err) {
    console.error("[beheer/mcp/sync] Opslaan mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Opslaan is mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
