import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { buildOverlap } from "@/lib/database/analysis";
import { listCampaigns, readCampaignIndex } from "@/lib/database/campaign-store";
import type { PackedIndex } from "@/lib/database/index-format";
import type { Campaign } from "@/lib/database/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * De overlapmatrix tussen alle campagnes plus de verdeling "meegedaan aan 1 /
 * 2 / 3+ campagnes".
 *
 * Dit wordt niet opgeslagen: de matrix verandert bij elke nieuwe campagne, en
 * hem opnieuw uitrekenen is goedkoper dan hem consistent houden. De indexen
 * zijn klein (een campagne van 100.000 deelnemers is 800 kB) en een doorsnede
 * is één merge-join.
 */
export async function GET(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  try {
    const campaigns = await listCampaigns();
    // Oudste eerst: een matrix leest prettiger op chronologische volgorde.
    const ordered = [...campaigns].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const entries: { campaign: Campaign; index: PackedIndex }[] = [];
    for (const campaign of ordered) {
      const index = await readCampaignIndex(campaign.id);
      // Een campagne zonder leesbare deelnemerslijst overslaan in plaats van de
      // hele matrix laten mislukken.
      if (index) entries.push({ campaign, index });
    }

    return NextResponse.json(buildOverlap(entries));
  } catch (err) {
    console.error("[database/overlap] GET mislukt:", err);
    return NextResponse.json({ error: "Berekenen van de overlap mislukt." }, { status: 500 });
  }
}
