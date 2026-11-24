import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { adminEmails, readUsers } from "@/lib/access-store";
import { readRegister } from "@/lib/gebruikers-register";
import { collegaSuggesties } from "@/lib/stukken/collegas";

/**
 * Collega's om een stuk mee te delen: wie in PSV Tools heeft ingelogd of in
 * het gebruikersbeheer staat. Met `?q=` op naam of e-mail.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;
  const zoek = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  const [register, users] = await Promise.all([readRegister(), readUsers()]);
  const collegas = collegaSuggesties(
    [register, users.map((u) => ({ email: u.email })), adminEmails().map((email) => ({ email }))],
    auth.email,
    zoek
  );
  return NextResponse.json({ collegas });
}
