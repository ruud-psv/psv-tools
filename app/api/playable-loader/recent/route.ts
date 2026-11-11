import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { listRecent } from "@/lib/playable-loader/store";

export const dynamic = "force-dynamic";

/** De campagnes waar recent een pagina voor is gepubliceerd, voor de eerste stap. */
export async function GET(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;
  try {
    return NextResponse.json({ recent: await listRecent(10) });
  } catch (err) {
    console.error("[playable-loader/recent] Mislukt:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ recent: [], error: "De lijst met recente campagnes is niet te laden." });
  }
}
