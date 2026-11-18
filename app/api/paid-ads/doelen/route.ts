import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { getAccess } from "@/lib/access-store";
import { geldigDoel, leesDoelen, zetCpaDoel } from "@/lib/paid-ads/doelen-store";

/**
 * De CPA-doelen per exploitatie. Lezen kan iedereen die is ingelogd; wijzigen
 * alleen wie het Paid Ads dashboard mag zien.
 */

export const dynamic = "force-dynamic";

const PAGINA = "/dashboard/paid-ads";

export async function GET(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;
  return NextResponse.json(await leesDoelen(), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const access = await getAccess(session.email);
  if (!access.isAdmin && !access.pages.includes(PAGINA)) {
    return NextResponse.json({ error: "Je hebt geen toegang tot het Paid Ads dashboard." }, { status: 403 });
  }

  let body: { exploitatie?: unknown; cpa?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  const unit = typeof body.exploitatie === "string" ? body.exploitatie.trim().slice(0, 80) : "";
  if (!unit) return NextResponse.json({ error: "Geen exploitatie opgegeven." }, { status: 400 });

  // Leeg of null haalt het doel weg; anders moet het een positief bedrag zijn.
  const leeg = body.cpa == null || body.cpa === "";
  const doel = leeg ? null : geldigDoel(body.cpa);
  if (!leeg && doel == null) {
    return NextResponse.json({ error: "Een CPA-doel is een bedrag groter dan nul." }, { status: 400 });
  }

  try {
    return NextResponse.json(await zetCpaDoel(unit, doel));
  } catch (err) {
    console.error("[paid-ads] doel opslaan mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Doel opslaan mislukt." }, { status: 500 });
  }
}
