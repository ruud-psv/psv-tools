import { NextRequest, NextResponse } from "next/server";
import { capabilitiesVoor, draaiProbe } from "@/lib/jwplayer/capabilities";
import { jwApi } from "@/lib/jwplayer/client";
import { foutAntwoord } from "@/lib/jwplayer/fouten";
import { laatsteVolledigeDag } from "@/lib/jwplayer/periode";
import { probeVerzoeker } from "@/lib/jwplayer/server";
import { leesSecret, leesSites } from "@/lib/jwplayer/sites";
import { snapshotRun } from "@/lib/jwplayer/snapshot";
import { blobOpslag } from "@/lib/jwplayer/store";
import { chainRemaining, isCronOrSession, startNextRun } from "@/lib/ringside/chain";

/**
 * De dagelijkse snapshot van PSV Play (zie `lib/jwplayer/snapshot.ts`).
 *
 * - **Cron** (`vercel.json`, 06.00 uur UTC: 07.00 uur in de winter, 08.00 uur
 *   in de zomer): legt gisteren en eergisteren vast (JW-datums) en vult gaten
 *   van de laatste week. Op maandag draait eerst de capability probe opnieuw.
 * - **Backfill**: `?van=JJJJ-MM-DD` legt elke ontbrekende dag vanaf die datum
 *   vast, nieuwste eerst. Past dat niet in één run, dan start de run zelf de
 *   volgende. `?van=begin` begint bij de oudste dag die de API kent.
 *   Zie `scripts/jwplayer-backfill.mjs`.
 *
 * Toegang: de cron met `CRON_SECRET`, of een ingelogde gebruiker.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUDGET_MS = 240_000;
// Ruim genoeg voor de hele historie: zo'n 15 dagen per run.
const DEFAULT_CHAIN = 150;
const MAX_CHAIN = 300;

export async function GET(req: NextRequest) {
  if (!isCronOrSession(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams;
  const vanParam = q.get("van");
  if (vanParam && vanParam !== "begin" && !/^\d{4}-\d{2}-\d{2}$/.test(vanParam)) {
    return NextResponse.json({ error: "Geef van als JJJJ-MM-DD of als begin." }, { status: 400 });
  }
  const backfill = Boolean(vanParam);
  const eersteVanKetting = !(Number(q.get("chain")) > 0);

  try {
    const secret = leesSecret();
    const sites = leesSites();
    const verzoeker = probeVerzoeker(secret);
    // Maandag (en alleen bij de gewone cron): de mogelijkheden opnieuw testen.
    if (!backfill && new Date().getUTCDay() === 1) await draaiProbe(sites, verzoeker, blobOpslag);

    const api = jwApi({ secret });
    const dataThrough = laatsteVolledigeDag();
    const start = Date.now();
    const resultaten: Record<string, unknown> = {};
    let over = 0;
    for (const site of sites) {
      const cap = await capabilitiesVoor(site, sites, verzoeker, blobOpslag);
      const van = vanParam === "begin" ? (cap.earliestDate ?? null) : vanParam;
      const budget = Math.max(10_000, BUDGET_MS - (Date.now() - start));
      const run = await snapshotRun({ api, siteId: site.id, cap, opslag: blobOpslag, dataThrough, van, budgetMs: budget });
      resultaten[site.id] = { label: site.label, ...run };
      over += run.over;
      console.info(`[psv-play] snapshot ${site.id}: ${run.gedaan.length} dagen, ${run.fouten.length} fouten, nog ${run.over}`);
    }

    const remaining = chainRemaining(q.get("chain"), DEFAULT_CHAIN, MAX_CHAIN);
    const voortgang = Object.values(resultaten).some((r) => (r as { gedaan: string[] }).gedaan.length > 0);
    const chained = backfill && over > 0 && remaining > 0 && voortgang ? await startNextRun(req, remaining - 1, "psv-play") : false;

    return NextResponse.json(
      { dataThrough, backfill, eersteVanKetting, sites: resultaten, chained },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err) {
    const { status, melding } = foutAntwoord(err);
    console.error(`[psv-play] snapshot: ${melding}`);
    return NextResponse.json({ error: melding }, { status });
  }
}
