import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth";

const REQUIRED: Record<string, string[]> = {
  mail_nl: ["doelgroep", "exploitatie", "doel_van_de_mail", "cta_omschrijving"],
  partner_copy: ["partner", "doel_van_de_mail", "cta_omschrijving"],
  huisstijl_check: ["tekst"],
};


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
