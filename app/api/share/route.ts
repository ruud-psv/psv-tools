import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { createShareToken, readShareToken, type SharePayload } from "@/lib/share-token";

/**
 * Deellinks voor `/share/dm`, `/share/ticket` en de oude
 * `/share/rapportage?token=`-links. POST maakt een ondertekend deeltoken (alleen
 * met login), GET geeft de inhoud van een geldig token terug aan de deelpagina.
 * Zie `lib/share-token.ts`.
 */

interface CampaignShareParams {
  kind: "campaign";
  name: string;
  from: string;
  to: string;
  sources: {
    dm?: { enabled: true; query?: string };
    ticketing?: { enabled: true; query?: string; category?: string };
    web?: { enabled: true; site: string; path?: string };
  };
}

function isCampaignParams(body: unknown): body is CampaignShareParams {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (b.kind !== "campaign") return false;
  if (typeof b.name !== "string" || !b.name.trim()) return false;
  if (typeof b.from !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.from)) return false;
  if (typeof b.to !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.to)) return false;
  if (!b.sources || typeof b.sources !== "object") return false;
  const s = b.sources as Record<string, unknown>;
  if (!s.dm && !s.ticketing && !s.web) return false;
  return true;
}

/** Een tekstveld uit de body, ingekort; geen tekst wordt `fallback`. */
function text(value: unknown, fallback: string, max = 200): string {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

export async function POST(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  try {
    let params: SharePayload;
    const kind = body && typeof body === "object" ? (body as { kind?: unknown }).kind : undefined;
    if (kind === "campaign") {
      if (!isCampaignParams(body)) {
        return NextResponse.json({ error: "Ongeldige campagne payload." }, { status: 400 });
      }
      params = body as unknown as SharePayload;
    } else if (kind === "ticket-event") {
      params = body as SharePayload;
    } else {
      // DM Performance: de filters van het dashboard. `kind: "dm"` bepaalt wat
      // het token van Maileon mag zien (zie `lib/dm-scope.ts`).
      const b = (body ?? {}) as Record<string, unknown>;
      params = {
        kind: "dm",
        q: text(b.q, ""),
        preset: text(b.preset, "30d", 20),
        customFrom: text(b.customFrom, "", 10),
        customTo: text(b.customTo, "", 10),
      };
    }

    return NextResponse.json({ token: createShareToken(params) });
  } catch (err) {
    console.error("[share] POST mislukt:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Deellink maken mislukt." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Deze deellink is ongeldig." }, { status: 400 });
  const params = readShareToken(token);
  if (!params) {
    return NextResponse.json(
      { error: "Deze deellink is ongeldig of verouderd. Vraag om een nieuwe link." },
      { status: 401 }
    );
  }
  return NextResponse.json(params);
}
