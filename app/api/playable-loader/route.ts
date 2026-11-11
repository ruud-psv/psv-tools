import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import {
  PageSourceError,
  buildBundle,
  loaderFields,
  parseCampaignId,
  preparePage,
} from "@/lib/playable-loader/bundle";
import { KIT_VERSIE, STARTER_HTML } from "@/lib/playable-loader/kit";
import { lookupCampaign } from "@/lib/playable-loader/playable";
import { checkBundle } from "@/lib/playable-loader/status";
import {
  BunnyConfigError,
  bundleUrl,
  purgeBundle,
  readPublished,
  savePublished,
  uploadBundle,
  type PublishedPage,
} from "@/lib/playable-loader/store";

export const dynamic = "force-dynamic";

/**
 * Playable loader (beta): de pagina-code van een campagne publiceren naar
 * Bunny, waar het vaste stukje code in Playable hem vandaan laadt. Wie de
 * pagina niet mag zien houdt de middleware tegen (`API_PAGES` in
 * `lib/access.ts`). Zie `lib/playable-loader/bundle.ts`.
 */

function configError(err: unknown) {
  if (err instanceof BunnyConfigError) {
    console.error("[playable-loader]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
  return null;
}

/**
 * Een campagne openen: de huidige bron (of de startpagina van de kit), het
 * stukje code voor Playable, en de controle: bestaat de campagne in Playable,
 * en geeft Bunny dezelfde versie als PSV Tools.
 */
export async function GET(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const campaignId = parseCampaignId(req.nextUrl.searchParams.get("campagne"));
  if (!campaignId) return NextResponse.json({ error: "Vul een campagne-ID in, bijvoorbeeld 244347." }, { status: 400 });

  try {
    const url = bundleUrl(campaignId);
    const [published, lookup] = await Promise.all([readPublished(campaignId), lookupCampaign(campaignId)]);
    // Een tikfout in het ID wil je meteen zien; staat er al een pagina in PSV
    // Tools, dan mag hij open, ook als Playable hem niet (meer) kent.
    if (lookup.status === "niet-gevonden" && !published) {
      return NextResponse.json({ error: `Playable kent geen campagne met ID ${campaignId}.` }, { status: 404 });
    }
    const bundle = await checkBundle(url, published?.publishedAt ?? null);
    return NextResponse.json({
      campaignId,
      kitVersie: KIT_VERSIE,
      bundleUrl: url,
      published,
      campaign: lookup.status === "gevonden" ? lookup.campaign : null,
      playableFout:
        lookup.status === "fout"
          ? `Playable gaf geen antwoord (${lookup.message}).`
          : lookup.status === "niet-gevonden"
            ? "Playable kent deze campagne niet meer."
            : null,
      bundleStatus: bundle,
      starter: { html: STARTER_HTML, css: "", js: "" },
      loader: loaderFields(campaignId, url),
    });
  } catch (err) {
    return configError(err) ?? NextResponse.json({ error: "Ophalen mislukt." }, { status: 500 });
  }
}

/** Publiceert de pagina: bundel maken, naar Bunny, en de bron bewaren. */
export async function POST(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const campaignId = parseCampaignId(body?.campaignId);
  if (!campaignId) return NextResponse.json({ error: "Vul een campagne-ID in, bijvoorbeeld 244347." }, { status: 400 });

  const campaignName =
    typeof body?.campaignName === "string" && body.campaignName.trim() ? body.campaignName.trim().slice(0, 200) : undefined;
  const source = {
    html: typeof body?.html === "string" ? body.html : "",
    css: typeof body?.css === "string" ? body.css : "",
    js: typeof body?.js === "string" ? body.js : "",
  };

  try {
    const page = preparePage(source);
    const publishedAt = new Date().toISOString();
    const bundle = buildBundle(page, { campaignId, publishedAt });
    // Laatste vangnet: een bundel die niet te lezen is, maakt de pagina leeg.
    new Function(bundle);

    const url = await uploadBundle(campaignId, bundle);

    // De bundel staat erop; een mislukte purge maakt de publicatie niet ongedaan.
    const warnings = [...page.warnings];
    try {
      if (!(await purgeBundle(url))) {
        warnings.push(
          "De cache van Bunny is niet geleegd, want BUNNY_API_KEY ontbreekt in Vercel. De nieuwe versie is pas " +
            "zichtbaar als je de cache in Bunny leegt of als hij verloopt."
        );
      }
    } catch (err) {
      console.error("[playable-loader] Purge mislukt:", err);
      warnings.push(`${err instanceof Error ? err.message : String(err)}. Leeg de cache in Bunny met de hand.`);
    }

    const record: PublishedPage = {
      campaignId,
      ...(campaignName && { campaignName }),
      source,
      bundleUrl: url,
      kitVersie: KIT_VERSIE,
      publishedAt,
      publishedBy: session.email,
      ...(session.name && { publishedByName: session.name }),
      warnings,
    };
    await savePublished(record);
    console.info(`[playable-loader] ${session.email} publiceerde campagne ${campaignId} (${bundle.length} tekens).`);

    // Meteen nakijken wat Bunny nu teruggeeft, zodat de collega ziet of het live staat.
    const bundleStatus = await checkBundle(url, publishedAt);
    return NextResponse.json({ published: record, loader: loaderFields(campaignId, url), bundleStatus });
  } catch (err) {
    if (err instanceof PageSourceError) return NextResponse.json({ error: err.message }, { status: 400 });
    const config = configError(err);
    if (config) return config;
    console.error("[playable-loader] Publiceren mislukt:", err);
    return NextResponse.json(
      { error: `Publiceren mislukt: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
