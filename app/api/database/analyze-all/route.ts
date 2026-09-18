import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { DatabaseError, analyzeAllCampaigns } from "@/lib/database/service";

export const dynamic = "force-dynamic";
/**
 * Elke campagne is een merge-join van seconden, maar bij tientallen campagnes
 * telt dat op — en de eerste haalt de bronindex nog op.
 */
export const maxDuration = 60;

/** Telt alle campagnes opnieuw; met `?stale=1` alleen de verouderde. */
export async function POST(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  const onlyStale = req.nextUrl.searchParams.get("stale") === "1";
  try {
    return NextResponse.json(await analyzeAllCampaigns(onlyStale));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof DatabaseError ? err.status : 500;
    if (status >= 500) console.error("[database/analyze-all] mislukt:", message);
    return NextResponse.json({ error: message }, { status });
  }
}
