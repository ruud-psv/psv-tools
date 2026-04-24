import { NextRequest, NextResponse } from "next/server";

const BASE_URL = "https://api.maileon.com/1.0";
const MAILEON_MIME = "application/vnd.maileon.api+xml";

function getAuthHeader(): string | null {
  const key = process.env.MAILEON_API_KEY;
  if (!key) return null;
  return `Basic ${Buffer.from(key).toString("base64")}`;
}

export async function GET(req: NextRequest) {
  const mailingId = req.nextUrl.searchParams.get("mailingId");
  if (!mailingId || !/^\d+$/.test(mailingId)) {
    return NextResponse.json({ error: "Invalid mailingId" }, { status: 400 });
  }

  const auth = getAuthHeader();
  if (!auth) {
    console.error("[maileon/archive] MAILEON_API_KEY niet geconfigureerd.");
    return NextResponse.json({ error: "Server configuratie fout" }, { status: 500 });
  }

  try {
    const res = await fetch(`${BASE_URL}/mailings/${mailingId}/archiveurl`, {
      headers: { Authorization: auth, Accept: MAILEON_MIME },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[maileon/archive] Maileon API ${res.status}: ${text.slice(0, 500)}`);
      return NextResponse.json({ error: "Ophalen van archive URL mislukt" }, { status: 502 });
    }

    const text = await res.text();

    // Extract URL from XML: <archive_url>...</archive_url> or plain text
    const match = text.match(/<archive_url[^>]*>\s*(https?:\/\/[^\s<]+)\s*<\/archive_url>/i)
      ?? text.match(/<archiveurl[^>]*>\s*(https?:\/\/[^\s<]+)\s*<\/archiveurl>/i)
      ?? text.match(/(https?:\/\/\S+)/);

    const archiveUrl = match?.[1]?.trim() ?? text.trim();

    if (!archiveUrl.startsWith("http")) {
      return NextResponse.json({ error: "Geen geldige archive URL ontvangen" }, { status: 502 });
    }

    return NextResponse.json({ archiveUrl });
  } catch (err) {
    console.error("[maileon/archive] Ophalen mislukt:", err);
    return NextResponse.json({ error: "Ophalen mislukt" }, { status: 502 });
  }
}
