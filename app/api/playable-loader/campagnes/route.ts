import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { PAGES_MAP, type BunnyCampagne } from "@/lib/playable-loader/bunny";
import { lookupCampaign } from "@/lib/playable-loader/playable";
import { BunnyConfigError, campagnesOpBunny, readPublished } from "@/lib/playable-loader/store";

export const dynamic = "force-dynamic";

/** Hooguit zoveel namen opzoeken in Playable; de rest heeft al een naam uit PSV Tools. */
const MAX_OPZOEKEN = 25;

/**
 * De campagnes die volgens het stramien op Bunny staan (een map
 * `playable/pages/<ID>`): alleen die zijn te openen. Met de laatste publicatie
 * uit PSV Tools, en anders de naam uit Playable.
 */
export async function GET(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  try {
    const ids = await campagnesOpBunny();
    const eigen = session.email.trim().toLowerCase();
    const records = await Promise.all(ids.map((id) => readPublished(id)));
    const campagnes: BunnyCampagne[] = ids.map((campaignId, i) => {
      const r = records[i];
      return {
        campaignId,
        ...(r?.campaignName && { campaignName: r.campaignName }),
        ...(r && { publishedAt: r.publishedAt, publishedByName: r.publishedByName ?? r.publishedBy }),
        doorJou: !!r && r.publishedBy.trim().toLowerCase() === eigen,
      };
    });

    const zonderNaam = campagnes.filter((c) => !c.campaignName).slice(0, MAX_OPZOEKEN);
    const lookups = await Promise.all(zonderNaam.map((c) => lookupCampaign(c.campaignId)));
    zonderNaam.forEach((c, i) => {
      const l = lookups[i];
      if (l.status === "gevonden" && l.campaign.name) c.campaignName = l.campaign.name;
    });

    campagnes.sort(
      (a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || b.campaignId - a.campaignId
    );
    return NextResponse.json({ campagnes, map: PAGES_MAP });
  } catch (err) {
    if (err instanceof BunnyConfigError) return NextResponse.json({ error: err.message }, { status: 500 });
    console.error("[playable-loader/campagnes] Mislukt:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "De campagnes op Bunny zijn niet op te halen." }, { status: 502 });
  }
}
