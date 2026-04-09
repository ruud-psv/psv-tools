import { NextRequest, NextResponse } from "next/server";
import { readSettings, writeSettings } from "@/lib/settings";

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

  const settings = readSettings();
  const envKeySet = !!process.env.ANTHROPIC_API_KEY;

  return NextResponse.json({
    anthropicApiKey: settings.anthropicApiKey
      ? maskKey(settings.anthropicApiKey)
      : null,
    anthropicApiKeySet: !!(settings.anthropicApiKey || envKeySet),
    fromEnv: envKeySet,
  });
}

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get("psv_session")?.value;
  const authError = authorize(sessionCookie);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const body = await req.json();

  if (typeof body.anthropicApiKey !== "string") {
    return NextResponse.json({ error: "Ongeldig verzoek." }, { status: 400 });
  }

  const current = readSettings();
  writeSettings({ ...current, anthropicApiKey: body.anthropicApiKey.trim() });

  return NextResponse.json({ ok: true });
}
