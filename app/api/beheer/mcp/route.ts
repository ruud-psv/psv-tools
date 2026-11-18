import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, requireAdmin } from "@/lib/api-admin";
import { serverViews } from "@/lib/mcp/client";
import { sanitizeServerInput, type McpServer } from "@/lib/mcp/config";
import { readServersStrict, writeServers } from "@/lib/mcp/store";

/**
 * Beheer > MCP-servers: de lijst lezen, een server toevoegen, wijzigen of
 * verwijderen. Tools aan- en uitzetten gaat via `./tools`, verbinden en tools
 * ophalen via `./sync`.
 */

export const dynamic = "force-dynamic";

const LEES_FOUT = "De lijst met MCP-servers kon niet worden geladen. Probeer het opnieuw.";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  try {
    return NextResponse.json({ servers: serverViews(await readServersStrict()) });
  } catch (err) {
    console.error("[beheer/mcp] Lezen mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: LEES_FOUT }, { status: 500 });
  }
}

/** Voegt een server toe, of wijzigt er een als `editingId` is meegegeven. */
export async function PUT(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;

  const body = await readJsonBody(req);
  if (!body) return NextResponse.json({ error: "Ongeldige invoer." }, { status: 400 });
  const editingId = typeof body.editingId === "string" ? body.editingId : undefined;

  let servers: McpServer[];
  try {
    servers = await readServersStrict();
  } catch (err) {
    console.error("[beheer/mcp] Lezen mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: LEES_FOUT }, { status: 500 });
  }

  const input = sanitizeServerInput(body, servers, editingId);
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

  const now = new Date().toISOString();
  const existing = servers.find((s) => s.id === input.server.id);
  const next: McpServer = existing
    ? {
        ...existing,
        ...input.server,
        // Een andere URL is een andere server: de goedgekeurde tools gelden daar niet.
        ...(existing.url !== input.server.url ? { tools: [], lastSync: undefined } : {}),
        updatedAt: now,
        updatedBy: admin.email,
      }
    : { ...input.server, tools: [], createdAt: now, updatedAt: now, updatedBy: admin.email };

  try {
    const updated = [...servers.filter((s) => s.id !== next.id), next];
    await writeServers(updated);
    return NextResponse.json({ servers: serverViews(updated) });
  } catch (err) {
    console.error("[beheer/mcp] Opslaan mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Opslaan is mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;

  const id = req.nextUrl.searchParams.get("id") ?? "";
  try {
    const servers = await readServersStrict();
    if (!servers.some((s) => s.id === id)) {
      return NextResponse.json({ error: "Deze server bestaat niet (meer)." }, { status: 404 });
    }
    const updated = servers.filter((s) => s.id !== id);
    await writeServers(updated);
    return NextResponse.json({ servers: serverViews(updated) });
  } catch (err) {
    console.error("[beheer/mcp] Verwijderen mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Verwijderen is mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
