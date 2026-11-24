import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { listMetMij, listStukken } from "@/lib/stukken/store";

/**
 * Mijn documenten: alle stukken die je met de assistent maakte, en de stukken
 * die collega's met je deelden.
 */

export const dynamic = "force-dynamic";

const MAX_DOCUMENTEN = 500;

export async function GET(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;
  try {
    const [mijn, metMij] = await Promise.all([listStukken(auth.email, MAX_DOCUMENTEN), listMetMij(auth.email)]);
    return NextResponse.json({ mijn, metMij });
  } catch (err) {
    console.error("[assistent/documenten] lijst mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "De documenten konden niet worden geladen." }, { status: 500 });
  }
}
