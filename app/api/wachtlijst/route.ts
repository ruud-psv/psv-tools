import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { todayInAmsterdam } from "@/lib/ringside/seat-state";
import { buildWaitlistAnalysis } from "@/lib/wachtlijst/analysis";
import { readWaitlistData, readWaitlistState } from "@/lib/wachtlijst/store";
import { waitlistStatus } from "@/lib/wachtlijst/status";

/**
 * De analyse van de wachtlijst: omvang, verloop, leeftijd en postcode. Alleen
 * aantallen. `?productId=<id>` beperkt tot één product als er meerdere zijn.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = authorize(req.cookies.get("psv_session")?.value);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  try {
    const [data, state] = await Promise.all([readWaitlistData(), readWaitlistState()]);
    const status = waitlistStatus(data, state);
    const productId = new URL(req.url).searchParams.get("productId")?.trim().toLowerCase() || null;
    const analysis =
      data && Object.keys(data.rows).length > 0
        ? buildWaitlistAnalysis(data, todayInAmsterdam(), productId && data.products[productId] ? productId : null)
        : null;
    return NextResponse.json({ status, analysis }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("[wachtlijst]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "De wachtlijst kon niet worden geladen." },
      { status: 500 }
    );
  }
}
