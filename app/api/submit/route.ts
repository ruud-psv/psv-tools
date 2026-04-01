import { NextRequest, NextResponse } from "next/server";

const REQUIRED: Record<string, string[]> = {
  mail_nl: ["doelgroep", "exploitatie", "doel_van_de_mail", "cta_omschrijving"],
  partner_copy: ["partner", "doel_van_de_mail", "cta_omschrijving"],
};

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

  if (!expectedUser || !expectedPass) {
    return "Beveiliging is niet geconfigureerd.";
  }
  if (!sessionCookie) return "Geen sessie gevonden. Log opnieuw in.";

  const credentials = parseBasicAuth(sessionCookie);
  if (!credentials) return "Ongeldige sessie.";
  if (credentials.user !== expectedUser || credentials.pass !== expectedPass) {
    return "Ongeldige inloggegevens.";
  }
  return null;
}

function validatePayload(payload: Record<string, string>): string | null {
  if (!payload || typeof payload !== "object") return "Payload ontbreekt.";
  if (!payload.category) return "Categorie ontbreekt.";

  const { category } = payload;
  if (REQUIRED[category]) {
    for (const field of REQUIRED[category]) {
      if (!payload[field] || String(payload[field]).trim().length === 0) {
        return `Veld ontbreekt: ${field}.`;
      }
    }
    return null;
  }

  if (!payload.details || String(payload.details).trim().length === 0) {
    return "Tekst ontbreekt.";
  }
  return null;
}

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get("psv_session")?.value;
  const authError = authorize(sessionCookie);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "N8N_WEBHOOK_URL ontbreekt in de server env." },
      { status: 500 }
    );
  }

  const payload = await req.json();
  const validationError = validatePayload(payload);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (process.env.N8N_WEBHOOK_SECRET) {
    headers["X-N8N-SECRET"] = process.env.N8N_WEBHOOK_SECRET;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      return NextResponse.json(
        { error: "n8n response error", details: body },
        { status: response.status }
      );
    }

    if (contentType.includes("application/json")) {
      return NextResponse.json(body);
    }
    return new NextResponse(body as string, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Kon n8n niet bereiken.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
