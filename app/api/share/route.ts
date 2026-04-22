import { NextRequest, NextResponse } from "next/server";
import { sql, ensureShareSchema } from "@/lib/db";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  try {
    await ensureShareSchema();
    const body = await req.json();
    const { q = "", preset = "30d", customFrom = "", customTo = "" } = body;
    const token = randomBytes(12).toString("base64url");
    await sql`
      INSERT INTO share_links (token, params)
      VALUES (${token}, ${JSON.stringify({ q, preset, customFrom, customTo })}::jsonb)
    `;
    return NextResponse.json({ token });
  } catch (err) {
    console.error("share POST error", err);
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
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
