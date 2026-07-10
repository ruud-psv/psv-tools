import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";

/**
 * Haalt het geverifieerde e-mailadres uit de sessiecookie van een API-request.
 * Retourneert het e-mailadres, of een kant-en-klare 401-response wanneer er
 * geen geldige sessie is. Gedeeld door alle ingelogde API-routes.
 */
export function requireEmail(req: NextRequest): { email: string } | { error: NextResponse } {
  const cookie = req.cookies.get("psv_session")?.value;
  const email = cookie ? verifySessionToken(cookie) : null;
  if (!email) {
    return { error: NextResponse.json({ error: "Geen geldige sessie. Log opnieuw in." }, { status: 401 }) };
  }
  return { email };
}
