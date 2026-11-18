import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { normalizeEmail } from "@/lib/access";
import { getAccess } from "@/lib/access-store";

/**
 * Voor de API's van de beheerpagina: alleen admins. De middleware houdt de
 * rest al tegen (`ADMIN_API` in `lib/access.ts`), maar de routes controleren
 * het zelf ook, zodat ze niet op de middleware hoeven te leunen.
 */
export async function requireAdmin(req: NextRequest): Promise<{ email: string } | { error: NextResponse }> {
  const session = requireEmail(req);
  if ("error" in session) return session;
  if (!(await getAccess(session.email)).isAdmin) {
    return { error: NextResponse.json({ error: "Alleen admins kunnen dit beheren." }, { status: 403 }) };
  }
  return { email: normalizeEmail(session.email) };
}

/** Een request-body als object, of `null`. */
export async function readJsonBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}
