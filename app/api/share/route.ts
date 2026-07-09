import { NextRequest, NextResponse } from "next/server";

interface DmShareParams {
  q?: string;
  preset?: string;
  customFrom?: string;
  customTo?: string;
}

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    let params: DmShareParams | CampaignShareParams | Record<string, unknown>;
    if (body && typeof body === "object" && (body as { kind?: string }).kind === "campaign") {
      if (!isCampaignParams(body)) {
        return NextResponse.json({ error: "Ongeldige campagne payload." }, { status: 400 });
      }
      params = body;
    } else if (body && typeof body === "object" && (body as { kind?: string }).kind === "ticket-event") {
      params = body as Record<string, unknown>;
    } else {
      const { q = "", preset = "30d", customFrom = "", customTo = "" } = body ?? {};
      params = { q, preset, customFrom, customTo };
    }

    const token = Buffer.from(JSON.stringify(params)).toString("base64url");
    return NextResponse.json({ token });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[share] POST mislukt:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  try {
    const params = JSON.parse(Buffer.from(token, "base64url").toString());
    return NextResponse.json(params);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
