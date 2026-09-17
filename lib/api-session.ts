import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";

/**
 * Haalt de geverifieerde sessiegegevens uit de cookie van een API-request:
 * het e-mailadres en — als de SAML-assertion die gaf — de voornaam.
 * Retourneert een kant-en-klare 401-response wanneer er geen geldige sessie
 * is. Gedeeld door alle ingelogde API-routes.
 */
export function requireEmail(
  req: NextRequest
): { email: string; name?: string } | { error: NextResponse } {
  const cookie = req.cookies.get("psv_session")?.value;
  const session = cookie ? verifySession(cookie) : null;
  if (!session) {
    return { error: NextResponse.json({ error: "Geen geldige sessie. Log opnieuw in." }, { status: 401 }) };
  }
  return session;
}
