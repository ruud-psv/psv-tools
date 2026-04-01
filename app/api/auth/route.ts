import { NextRequest, NextResponse } from "next/server";

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

export async function POST(req: NextRequest) {
  const expectedUser = process.env.PSV_AUTH_USER;
  const expectedPass = process.env.PSV_AUTH_PASS;

  if (!expectedUser || !expectedPass) {
    return NextResponse.json(
      { error: "PSV_AUTH_USER of PSV_AUTH_PASS ontbreekt." },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("authorization");
  const credentials = parseBasicAuth(authHeader);

  if (!credentials) {
    return NextResponse.json(
      { error: "Geen autorisatie meegegeven." },
      { status: 401 }
    );
  }

  if (
    credentials.user !== expectedUser ||
    credentials.pass !== expectedPass
  ) {
    return NextResponse.json(
      { error: "Ongeldige inloggegevens." },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("psv_session", authHeader!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });

  return response;
}
