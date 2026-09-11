import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import {
  RingsideAuthError,
  RingsideConfigError,
  getRingsideTokenInfo,
  isRingsideConfigured,
  resetRingsideToken,
} from "@/lib/ringside/auth";
import { buildRingsideUrl, getRingsideBaseUrl, ringsideFetch } from "@/lib/ringside/client";

/**
 * Diagnose-endpoint voor de Ringside-koppeling. Twee functies:
 *
 * 1. Zonder `path`: controleert of de Locksmith-credentials werken en toont de
 *    tokengeldigheid — de snelste manier om te zien of de environment
 *    variables in Vercel goed staan.
 * 2. Met `path`: doet een geauthenticeerde GET naar dat Ringside-pad en geeft
 *    het antwoord terug. Daarmee brengen we de echte endpoints en veldnamen in
 *    kaart, zodat `/api/ticket-feed` daarna van de XML-feed af kan.
 *
 * Alleen bereikbaar met een geldige sessie, en alleen GET — het is een
 * leeshulpmiddel, geen doorgeefluik. Het access token verlaat de server niet.
 */

/** Bovengrens op wat we teruggeven, zodat een grote lijst de browser niet plat legt. */
const MAX_BODY_CHARS = 20_000;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = authorize(req.cookies.get("psv_session")?.value);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const { searchParams } = new URL(req.url);

  if (!isRingsideConfigured()) {
    return NextResponse.json(
      {
        configured: false,
        error:
          "Ringside is nog niet geconfigureerd. Zet RINGSIDE_CLIENT_ID, RINGSIDE_CLIENT_SECRET en RINGSIDE_TOKEN_URL in Vercel.",
        required: ["RINGSIDE_CLIENT_ID", "RINGSIDE_CLIENT_SECRET", "RINGSIDE_TOKEN_URL"],
        optional: ["RINGSIDE_AUDIENCE", "RINGSIDE_BASE_URL"],
      },
      { status: 503 }
    );
  }

  if (searchParams.get("refresh") === "1") resetRingsideToken();

  try {
    const token = await getRingsideTokenInfo();
    const path = searchParams.get("path");

    if (!path) {
      return NextResponse.json({
        configured: true,
        authenticated: true,
        baseUrl: getRingsideBaseUrl(),
        token,
        hint: "Geef ?path=/… mee om een Ringside-endpoint te proberen.",
      });
    }

    // Alles behalve `path` en `refresh` gaat als querystring mee naar Ringside,
    // zodat filters en paginatie direct uitgeprobeerd kunnen worden.
    const forwarded: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      if (key !== "path" && key !== "refresh") forwarded[key] = value;
    }

    const res = await ringsideFetch(path, { searchParams: forwarded });
    const text = await res.text();
    const truncated = text.length > MAX_BODY_CHARS;

    let body: unknown = truncated ? text.slice(0, MAX_BODY_CHARS) : text;
    if (!truncated) {
      try {
        body = JSON.parse(text);
      } catch {
        // Geen JSON — dan is de rauwe tekst juist het interessante signaal.
      }
    }

    return NextResponse.json({
      configured: true,
      authenticated: true,
      request: { url: buildRingsideUrl(path, forwarded) },
      status: res.status,
      ok: res.ok,
      contentType: res.headers.get("content-type"),
      truncated,
      body,
    });
  } catch (error) {
    if (error instanceof RingsideConfigError) {
      return NextResponse.json({ configured: false, error: error.message }, { status: 400 });
    }
    if (error instanceof RingsideAuthError) {
      console.error("[ringside/probe]", error.message);
      return NextResponse.json(
        { configured: true, authenticated: false, error: error.message },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ringside-aanroep mislukt." },
      { status: 502 }
    );
  }
}
