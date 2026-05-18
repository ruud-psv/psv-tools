import { NextRequest, NextResponse } from "next/server";
import { sql, ensureShareSchema } from "@/lib/db";
import { randomBytes } from "crypto";

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
    await ensureShareSchema();
    const body = await req.json();

    let params: DmShareParams | CampaignShareParams;
    if (body && typeof body === "object" && (body as { kind?: string }).kind === "campaign") {
      if (!isCampaignParams(body)) {
        return NextResponse.json({ error: "Ongeldige campagne payload." }, { status: 400 });
      }
      params = body;
    } else {
      const { q = "", preset = "30d", customFrom = "", customTo = "" } = body ?? {};
      params = { q, preset, customFrom, customTo };
    }

    const token = randomBytes(12).toString("base64url");
    await sql`
      INSERT INTO share_links (token, params)
      VALUES (${token}, ${JSON.stringify(params)}::jsonb)
    `;
    return NextResponse.json({ token });
  } catch (err) {
    console.error("share POST error", err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("POSTGRES_URL") || msg.includes("connect") || msg.includes("database")) {
      return NextResponse.json({ error: "Deellinks zijn tijdelijk niet beschikbaar (geen database)." }, { status: 503 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  try {
    await ensureShareSchema();
    const result = await sql`SELECT params FROM share_links WHERE token = ${token}`;
    if (!result.rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(result.rows[0].params);
  } catch (err) {
    console.error("share GET error", err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("POSTGRES_URL") || msg.includes("connect") || msg.includes("database")) {
      return NextResponse.json({ error: "Deellinks zijn tijdelijk niet beschikbaar (geen database)." }, { status: 503 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
