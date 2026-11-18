import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { listStukken } from "@/lib/stukken/store";

/** De stukken van de ingelogde collega, nieuwste eerst. */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;
  try {
    return NextResponse.json({ stukken: await listStukken(auth.email) });
  } catch (err) {
    console.error("[assistent/stukken] lijst mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "De stukken konden niet worden geladen." }, { status: 500 });
  }
}
