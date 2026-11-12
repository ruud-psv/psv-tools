import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { listGesprekken } from "@/lib/assistent/gesprekken";

export const dynamic = "force-dynamic";

/** De gesprekken van de ingelogde collega met de assistent, nieuwste eerst. */
export async function GET(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  try {
    return NextResponse.json({ gesprekken: await listGesprekken(auth.email) });
  } catch (err) {
    console.error("[assistent/gesprekken] GET mislukt:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Ophalen van je gesprekken mislukt." }, { status: 500 });
  }
}
