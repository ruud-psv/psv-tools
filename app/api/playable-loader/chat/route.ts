import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { AssistentError, MODEL, vraagAanpassing, type Bericht } from "@/lib/playable-loader/assistent";
import { MAX_FIELD_CHARS, parseCampaignId } from "@/lib/playable-loader/bundle";
import { leesSelectie } from "@/lib/playable-loader/selectie";

export const dynamic = "force-dynamic";
// Claude doet er bij een grote pagina soms een minuut over, en probeert het
// opnieuw als een wijziging niet past.
export const maxDuration = 300;

const MAX_BERICHTEN = 30;
const MAX_VRAAG = 4_000;

/**
 * Playable loader: een collega vraagt in gewone taal wat er anders moet en
 * krijgt de aangepaste code terug. Er wordt niets gepubliceerd; dat doet de
 * collega zelf na het voorbeeld. Toegang via de middleware (`API_PAGES`).
 */
export async function POST(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[playable-loader/chat] ANTHROPIC_API_KEY ontbreekt.");
    return NextResponse.json({ error: "Server configuratie fout" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const campaignId = parseCampaignId(body?.campaignId);

  const berichten: Bericht[] = (Array.isArray(body?.berichten) ? body.berichten : [])
    .filter(
      (b): b is Bericht =>
        !!b &&
        typeof b === "object" &&
        ((b as Bericht).rol === "gebruiker" || (b as Bericht).rol === "assistent") &&
        typeof (b as Bericht).tekst === "string"
    )
    .slice(-MAX_BERICHTEN)
    .map((b) => ({ rol: b.rol, tekst: b.tekst.slice(0, MAX_VRAAG) }));
  if (berichten.length === 0 || berichten[berichten.length - 1].rol !== "gebruiker") {
    return NextResponse.json({ error: "Er is geen vraag." }, { status: 400 });
  }

  const raw = (body?.bron ?? {}) as Record<string, unknown>;
  const bron = {
    html: typeof raw.html === "string" ? raw.html : "",
    css: typeof raw.css === "string" ? raw.css : "",
    js: typeof raw.js === "string" ? raw.js : "",
  };
  if (!bron.html.trim()) return NextResponse.json({ error: "Er is nog geen pagina om aan te passen." }, { status: 400 });
  if ([bron.html, bron.css, bron.js].some((v) => v.length > MAX_FIELD_CHARS)) {
    return NextResponse.json({ error: "De pagina is te groot." }, { status: 400 });
  }

  // Het onderdeel dat de collega in het voorbeeld aanwees, bij de laatste vraag.
  const selectie = leesSelectie(body?.selectie);

  try {
    const resultaat = await vraagAanpassing({ berichten, bron, selectie });
    console.info(
      `[playable-loader/chat] ${session.email}, campagne ${campaignId ?? "?"}, ${MODEL}: ` +
        `${resultaat.wijzigingen.length} wijzigingen${selectie ? " (aangewezen)" : ""}, tokens in ${resultaat.gebruik.input} ` +
        `(cache ${resultaat.gebruik.cacheRead}), uit ${resultaat.gebruik.output}`
    );
    return NextResponse.json({
      antwoord: resultaat.antwoord,
      bron: resultaat.bron,
      wijzigingen: resultaat.wijzigingen,
    });
  } catch (err) {
    if (err instanceof AssistentError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("[playable-loader/chat] Mislukt:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Claude is nu niet bereikbaar. Probeer het zo opnieuw." }, { status: 502 });
  }
}
