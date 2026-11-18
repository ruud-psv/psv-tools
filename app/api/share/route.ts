import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { createShareToken, verifyShareToken, type ShareScope } from "@/lib/share-token";

/**
 * Deellinks voor de DM-deelpagina (`/share/dm`) en de ticketdeelpagina
 * (`/share/ticket`). Het token legt alleen de filterinstellingen vast en geeft
 * geen toegang tot de beschermde data-endpoints; zie `lib/share-token.ts`.
 * Rapportlinks lopen via `/api/reports/[id]`.
 */

function text(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/** Alleen ingelogde gebruikers maken deellinks. */
export async function POST(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  let scope: ShareScope;
  if (b.kind === "ticket-event") {
    const params = { ...b };
    delete params.kind;
    scope = { kind: "ticket-event", params };
  } else if (b.kind === undefined || b.kind === "dm") {
    scope = {
      kind: "dm",
      q: text(b.q, ""),
      preset: text(b.preset, "30d"),
      customFrom: text(b.customFrom, ""),
      customTo: text(b.customTo, ""),
    };
  } else {
    return NextResponse.json({ error: "Onbekend soort deellink." }, { status: 400 });
  }

  try {
    return NextResponse.json({ token: createShareToken(scope) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[share] POST mislukt:", msg);
    return NextResponse.json({ error: "Deellink maken mislukt." }, { status: 500 });
  }
}

/** Openbaar: de deelpagina leest hier de instellingen uit zijn token. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token ontbreekt." }, { status: 400 });

  const share = verifyShareToken(token);
  if (!share) return NextResponse.json({ error: "Ongeldige of verlopen link." }, { status: 401 });

  switch (share.kind) {
    case "dm": {
      const { q, preset, customFrom, customTo } = share;
      return NextResponse.json({ kind: "dm", q, preset, customFrom, customTo });
    }
    case "ticket-event":
      return NextResponse.json({ ...share.params, kind: "ticket-event" });
    case "report":
      return NextResponse.json({ kind: "report", id: share.id });
  }
}
