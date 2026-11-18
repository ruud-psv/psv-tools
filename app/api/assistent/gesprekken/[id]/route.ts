import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { deleteGesprek, getGesprek } from "@/lib/assistent/gesprekken";
import { ASSISTENT_TOOLS } from "@/lib/assistent/tools";
import { mcpSources } from "@/lib/mcp/config";
import { deleteStuk } from "@/lib/stukken/store";
import { readServers } from "@/lib/mcp/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const gesprek = await getGesprek(auth.email, id);
    if (!gesprek) return NextResponse.json({ error: "Gesprek niet gevonden." }, { status: 404 });
    // De opslag kent alleen de namen van de gebruikte tools; de chat toont het label en de pagina.
    // Tools van MCP-servers staan in het beheer; een verwijderde server valt hier weg.
    const bronnen = {
      ...mcpSources(await readServers()),
      ...Object.fromEntries(ASSISTENT_TOOLS.map((t) => [t.name, { naam: t.name, label: t.label, href: t.page }])),
    };
    return NextResponse.json({ gesprek, bronnen });
  } catch (err) {
    console.error("[assistent/gesprekken/:id] GET mislukt:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Ophalen van het gesprek mislukt." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const ok = await deleteGesprek(auth.email, id);
    if (!ok) return NextResponse.json({ error: "Ongeldig gesprek id." }, { status: 400 });
    // Het stuk bij het gesprek en zijn deellink gaan mee.
    await deleteStuk(auth.email, id).catch((err) =>
      console.error("[assistent/gesprekken/:id] stuk verwijderen mislukt:", err instanceof Error ? err.message : err)
    );
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("[assistent/gesprekken/:id] DELETE mislukt:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Verwijderen van het gesprek mislukt." }, { status: 500 });
  }
}
