import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, requireAdmin } from "@/lib/api-admin";
import { PAGE_GROUPS } from "@/lib/access";
import { eigenTools, mcpGroepen } from "@/lib/assistent/catalogus";
import { leesVaardigheid, type Vaardigheid } from "@/lib/assistent/vaardigheden";
import { readVaardighedenStrict, writeVaardigheden } from "@/lib/assistent/vaardigheden-store";
import { readServersStrict } from "@/lib/mcp/store";

/**
 * Beheer > Assistent: alle tools van de assistent bekijken, en vaardigheden
 * toevoegen, wijzigen, aan- en uitzetten of verwijderen.
 */

export const dynamic = "force-dynamic";

const LEES_FOUT = "De vaardigheden konden niet worden geladen. Probeer het opnieuw.";
const PAGINAS = PAGE_GROUPS.flatMap((g) => g.pages);
const PAGINA_HREFS = PAGINAS.map((p) => p.href);

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;

  const [vaardigheden, servers] = await Promise.allSettled([readVaardighedenStrict(), readServersStrict()]);
  if (vaardigheden.status === "rejected") {
    console.error("[beheer/assistent] vaardigheden lezen mislukt:", vaardigheden.reason);
    return NextResponse.json({ error: LEES_FOUT }, { status: 500 });
  }
  if (servers.status === "rejected") console.error("[beheer/assistent] MCP-servers lezen mislukt:", servers.reason);

  return NextResponse.json({
    groepen: [...eigenTools(), ...(servers.status === "fulfilled" ? mcpGroepen(servers.value) : [])],
    mcpFout: servers.status === "rejected" ? "De MCP-servers konden niet worden geladen." : null,
    vaardigheden: vaardigheden.value,
    paginas: PAGINAS,
  });
}

async function bewerk(
  req: NextRequest,
  werk: (lijst: Vaardigheid[], email: string, body: Record<string, unknown>) => Vaardigheid[] | { fout: string }
) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const body = req.method === "DELETE" ? {} : await readJsonBody(req);
  if (!body) return NextResponse.json({ error: "Ongeldige invoer." }, { status: 400 });

  let lijst: Vaardigheid[];
  try {
    lijst = await readVaardighedenStrict();
  } catch (err) {
    console.error("[beheer/assistent] lezen mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: LEES_FOUT }, { status: 500 });
  }
  const uit = werk(lijst, admin.email, body);
  if ("fout" in uit) return NextResponse.json({ error: uit.fout }, { status: 400 });
  try {
    await writeVaardigheden(uit);
  } catch (err) {
    console.error("[beheer/assistent] opslaan mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Opslaan mislukt. Probeer het opnieuw." }, { status: 500 });
  }
  return NextResponse.json({ vaardigheden: uit });
}

/** Voegt een vaardigheid toe, of wijzigt er een als `bewerkId` is meegegeven. */
export async function PUT(req: NextRequest) {
  return bewerk(req, (lijst, email, body) => {
    const bewerkId = typeof body.bewerkId === "string" ? body.bewerkId : undefined;
    const gelezen = leesVaardigheid(body, lijst, PAGINA_HREFS, bewerkId);
    if ("fout" in gelezen) return gelezen;
    const nieuw: Vaardigheid = { ...gelezen.vaardigheid, bijgewerktOp: new Date().toISOString(), bijgewerktDoor: email };
    return bewerkId ? lijst.map((v) => (v.id === bewerkId ? nieuw : v)) : [...lijst, nieuw];
  });
}

/** Zet een vaardigheid aan of uit: `{id, aan}`. */
export async function PATCH(req: NextRequest) {
  return bewerk(req, (lijst, email, body) => {
    if (typeof body.id !== "string" || typeof body.aan !== "boolean") return { fout: "Ongeldige invoer." };
    if (!lijst.some((v) => v.id === body.id)) return { fout: "Deze vaardigheid bestaat niet meer." };
    return lijst.map((v) =>
      v.id === body.id ? { ...v, aan: body.aan as boolean, bijgewerktOp: new Date().toISOString(), bijgewerktDoor: email } : v
    );
  });
}

/** Verwijdert een vaardigheid: `?id=`. */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  return bewerk(req, (lijst) => {
    if (!id || !lijst.some((v) => v.id === id)) return { fout: "Deze vaardigheid bestaat niet meer." };
    return lijst.filter((v) => v.id !== id);
  });
}
