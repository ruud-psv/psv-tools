import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import {
  bouwPrompt,
  eigenScenePrompt,
  parseerModelId,
  vindScene,
  type DetailNiveau,
  type GenereerRequest,
  type Verhouding,
} from "@/lib/kleurplaat";
import { bouwInput, MAX_REFERENTIES } from "@/lib/kleurplaat/schema";
import { haalProfiel, startVoorspelling } from "@/lib/kleurplaat/replicate";
import { isReferentiePad, referentiesAlsDataUrls } from "@/lib/kleurplaat/opslag";

export const runtime = "nodejs";
export const maxDuration = 60;

const DETAILS: DetailNiveau[] = ["eenvoudig", "gemiddeld", "gedetailleerd"];
const VERHOUDINGEN: Verhouding[] = ["2:3", "3:2", "1:1"];

/** De hoek waar de browser het logo plakt, in de woorden van het model. */
const HOEKEN: Record<string, "top left" | "top right" | "bottom left" | "bottom right"> = {
  linksboven: "top left",
  rechtsboven: "top right",
  linksonder: "bottom left",
  rechtsonder: "bottom right",
};

export async function POST(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  let body: Partial<GenereerRequest>;
  try {
    body = (await req.json()) as Partial<GenereerRequest>;
  } catch {
    return NextResponse.json({ error: "Kon de aanvraag niet lezen." }, { status: 400 });
  }

  // Elk Replicate-model mag; hoe het aangeroepen wordt, leest het schema uit.
  const gekozen = parseerModelId(
    body.versie ? `${body.model ?? ""}:${body.versie}` : String(body.model ?? "")
  );
  if (!gekozen) {
    return NextResponse.json(
      { error: "Ongeldige model-identifier. Gebruik de vorm eigenaar/modelnaam." },
      { status: 400 }
    );
  }

  const detail: DetailNiveau = DETAILS.includes(body.detail as DetailNiveau)
    ? (body.detail as DetailNiveau)
    : "gemiddeld";
  const verhouding: Verhouding = VERHOUDINGEN.includes(body.verhouding as Verhouding)
    ? (body.verhouding as Verhouding)
    : "2:3";

  // Scène: preset of vrije tekst
  let scene: string;
  if (body.sceneId === "eigen") {
    const eigen = eigenScenePrompt(String(body.eigenScene ?? ""));
    if (eigen.length < 3) {
      return NextResponse.json(
        { error: "Beschrijf de scène in een paar woorden, of kies er een uit de lijst." },
        { status: 400 }
      );
    }
    scene = eigen.slice(0, 600);
  } else {
    const preset = vindScene(String(body.sceneId ?? ""));
    if (!preset) {
      return NextResponse.json({ error: "Onbekende scène gekozen." }, { status: 400 });
    }
    scene = preset.prompt;
  }

  // Referenties: paden in de gedeelde opslag, niet de beelden zelf.
  const ruweReferenties = Array.isArray(body.referenties) ? body.referenties : [];
  if (ruweReferenties.some((r) => typeof r !== "string" || !isReferentiePad(r))) {
    return NextResponse.json(
      { error: "Een van de referenties staat niet in de gedeelde bibliotheek." },
      { status: 400 }
    );
  }
  const referentiePaden = (ruweReferenties as string[]).slice(0, MAX_REFERENTIES);

  try {
    const { profiel } = await haalProfiel(gekozen.id, gekozen.versie);

    // Het model kan een privé blob niet zelf ophalen, dus we sturen de inhoud mee.
    const referenties = profiel.referentieVeld
      ? await referentiesAlsDataUrls(referentiePaden)
      : [];

    const prompt = bouwPrompt({
      scene,
      detail,
      rugnummer: typeof body.rugnummer === "string" ? body.rugnummer.slice(0, 3) : undefined,
      extra: typeof body.extra === "string" ? body.extra.slice(0, 400) : undefined,
      vrijeHoek: HOEKEN[String(body.logoHoek ?? "")],
      // Het model kan alleen naar referenties kijken als het er een veld voor heeft.
      metReferenties: referenties.length > 0 && Boolean(profiel.referentieVeld),
    });

    const voorspelling = await startVoorspelling(
      profiel,
      bouwInput(profiel, { prompt, referenties, verhouding })
    );

    return NextResponse.json({ id: voorspelling.id, prompt, model: gekozen.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Genereren mislukt." },
      { status: 502 }
    );
  }
}
