import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "psv_anthropic_key";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 jaar

function parseBasicAuth(header: string | null) {
  if (!header?.startsWith("Basic ")) return null;
  const encoded = header.slice(6).trim();
  if (!encoded) return null;
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep === -1) return null;
    return { user: decoded.slice(0, sep), pass: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}

function authorize(sessionCookie: string | undefined): string | null {
  const expectedUser = process.env.PSV_AUTH_USER;
  const expectedPass = process.env.PSV_AUTH_PASS;
  if (!expectedUser || !expectedPass) return "Beveiliging is niet geconfigureerd.";
  if (!sessionCookie) return "Geen sessie gevonden. Log opnieuw in.";
  const credentials = parseBasicAuth(sessionCookie);
  if (!credentials) return "Ongeldige sessie.";
  if (credentials.user !== expectedUser || credentials.pass !== expectedPass)
    return "Ongeldige inloggegevens.";
  return null;
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return "••••••••" + key.slice(-4);
}

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("psv_session")?.value;
  const authError = authorize(sessionCookie);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const savedKey = req.cookies.get(COOKIE_NAME)?.value;
  const envKeySet = !!process.env.ANTHROPIC_API_KEY;

  return NextResponse.json({
    anthropicApiKey: savedKey ? maskKey(savedKey) : null,
    anthropicApiKeySet: !!(savedKey || envKeySet),
    fromEnv: envKeySet,
  });
}

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get("psv_session")?.value;
  const authError = authorize(sessionCookie);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const body = await req.json();

  if (typeof body.anthropicApiKey !== "string" || !body.anthropicApiKey.trim()) {
    return NextResponse.json({ error: "Ongeldig verzoek." }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, body.anthropicApiKey.trim(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}
