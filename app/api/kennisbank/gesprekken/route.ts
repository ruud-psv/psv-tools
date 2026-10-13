import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { listGesprekken } from "@/lib/kennisbank-gesprekken";

export const dynamic = "force-dynamic";

/** De gesprekken van de ingelogde collega, nieuwste eerst. */
export async function GET(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  try {
    const gesprekken = await listGesprekken(auth.email);
    return NextResponse.json({ gesprekken });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[kennisbank/gesprekken] GET mislukt:", msg);
    return NextResponse.json({ error: "Ophalen van je gesprekken mislukt." }, { status: 500 });
  }
}
