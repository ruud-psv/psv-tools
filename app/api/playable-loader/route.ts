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
import {
  BunnyConfigError,
  bundleUrl,
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

/** De huidige bron van een campagne (of de startpagina van de kit) en het stukje code voor Playable. */
export async function GET(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const campaignId = parseCampaignId(req.nextUrl.searchParams.get("campagne"));
  if (!campaignId) return NextResponse.json({ error: "Vul een campagne-ID in, bijvoorbeeld 244347." }, { status: 400 });

  try {
    const url = bundleUrl(campaignId);
    const published = await readPublished(campaignId);
    return NextResponse.json({
      campaignId,
      kitVersie: KIT_VERSIE,
      bundleUrl: url,
      published,
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
    const record: PublishedPage = {
      campaignId,
      source,
      bundleUrl: url,
      kitVersie: KIT_VERSIE,
      publishedAt,
      publishedBy: session.email,
      ...(session.name && { publishedByName: session.name }),
      warnings: page.warnings,
    };
    await savePublished(record);
    console.info(`[playable-loader] ${session.email} publiceerde campagne ${campaignId} (${bundle.length} tekens).`);

    return NextResponse.json({ published: record, loader: loaderFields(campaignId, url) });
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
