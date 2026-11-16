import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { todayInAmsterdam } from "@/lib/ringside/seat-state";
import { buildWaitlistAnalysis } from "@/lib/wachtlijst/analysis";
import { shownProductIds } from "@/lib/wachtlijst/data";
import { readWaitlistData, readWaitlistState } from "@/lib/wachtlijst/store";
import { waitlistStatus } from "@/lib/wachtlijst/status";

/**
 * De analyse van de wachtlijst: omvang, verloop, leeftijd en postcode. Alleen
 * aantallen. Standaard zonder de pre wachtlijst (`shownProductIds()`);
 * `?productId=<id>` toont één product, ook de pre wachtlijst.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = authorize(req.cookies.get("psv_session")?.value);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  try {
    const [data, state] = await Promise.all([readWaitlistData(), readWaitlistState()]);
    const status = waitlistStatus(data, state);
    const productId = new URL(req.url).searchParams.get("productId")?.trim().toLowerCase() || null;
    const shown = data ? (productId && data.products[productId] ? [productId] : shownProductIds(data)) : [];
    const analysis = data && Object.keys(data.rows).length > 0 ? buildWaitlistAnalysis(data, todayInAmsterdam(), shown) : null;
    const shownProducts = shown.map((id) => ({ productId: id, name: data?.products[id]?.name ?? id }));
    return NextResponse.json({ status, analysis, shownProducts }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("[wachtlijst]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "De wachtlijst kon niet worden geladen." },
      { status: 500 }
    );
  }
}
