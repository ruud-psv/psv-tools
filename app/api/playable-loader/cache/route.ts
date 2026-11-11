import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { parseCampaignId } from "@/lib/playable-loader/bundle";
import { checkBundle } from "@/lib/playable-loader/status";
import { BunnyConfigError, bundleUrl, purgeBundle, readPublished } from "@/lib/playable-loader/store";

export const dynamic = "force-dynamic";

/**
 * Leegt de cache van Bunny voor één campagne en kijkt daarna opnieuw wat
 * Bunny teruggeeft. Voor als de controle zegt dat de demo een oudere versie
 * krijgt dan PSV Tools.
 */
export async function POST(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const body = (await req.json().catch(() => null)) as { campaignId?: unknown } | null;
  const campaignId = parseCampaignId(body?.campaignId);
  if (!campaignId) return NextResponse.json({ error: "Geen geldig campagne-ID." }, { status: 400 });

  try {
    const url = bundleUrl(campaignId);
    if (!(await purgeBundle(url))) {
      return NextResponse.json(
        { error: "De cache legen kan niet: BUNNY_API_KEY ontbreekt in Vercel." },
        { status: 500 }
      );
    }
    const published = await readPublished(campaignId);
    console.info(`[playable-loader/cache] ${session.email} leegde de cache van campagne ${campaignId}.`);
    return NextResponse.json({ bundleStatus: await checkBundle(url, published?.publishedAt ?? null) });
  } catch (err) {
    if (err instanceof BunnyConfigError) return NextResponse.json({ error: err.message }, { status: 500 });
    console.error("[playable-loader/cache] Mislukt:", err);
    return NextResponse.json(
      { error: `Cache legen mislukt: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
