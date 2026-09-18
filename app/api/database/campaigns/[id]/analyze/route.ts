import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { DatabaseError, analyzeCampaignById } from "@/lib/database/service";

export const dynamic = "force-dynamic";

/** Telt één campagne opnieuw tegen de actieve bron. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    return NextResponse.json({ campaign: await analyzeCampaignById(id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof DatabaseError ? err.status : 500;
    if (status >= 500) console.error("[database/campaigns/:id/analyze] mislukt:", message);
    return NextResponse.json({ error: message }, { status });
  }
}
