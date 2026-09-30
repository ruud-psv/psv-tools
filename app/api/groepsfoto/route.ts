import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import {
  bouwPrompt,
  modelBezwaar,
  parseerModelId,
  vindKleding,
  vindPositie,
  type GenereerRequest,
} from "@/lib/groepsfoto";
import { basisfotoAlsDataUrl, vindBasisfoto } from "@/lib/groepsfoto/opslag";
import { haalProfiel, startVoorspelling } from "@/lib/replicate/client";
import { bouwInput } from "@/lib/replicate/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Een selfie van 1024px als JPEG is een paar honderd kB; dit is ruim. */
const MAX_SELFIE_BYTES = 3_000_000;
const SELFIE_PATROON = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

/** De gedecodeerde grootte van een base64 data-URL, zonder hem te decoderen. */
function grootteVan(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((base64.length * 3) / 4);
}

/**
 * Start een generatie. De selfie komt als data-URL mee in de aanvraag en gaat
 * rechtstreeks door naar Replicate; hij wordt nergens opgeslagen. De basisfoto
 * haalt de server zelf uit de privé opslag.
 */
export async function POST(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  let body: Partial<GenereerRequest>;
  try {
    body = (await req.json()) as Partial<GenereerRequest>;
  } catch {
    return NextResponse.json(
      { error: "Kon de aanvraag niet lezen. Is de selfie misschien te groot?" },
      { status: 400 }
    );
  }

  if (body.toestemming !== true) {
    return NextResponse.json(
      { error: "Bevestig eerst dat de selfie van jou is, of dat je toestemming hebt." },
      { status: 400 }
    );
  }

  const selfie = typeof body.selfie === "string" ? body.selfie : "";
  if (!SELFIE_PATROON.test(selfie)) {
    return NextResponse.json({ error: "Upload eerst een selfie (jpg, png of webp)." }, { status: 400 });
  }
  if (grootteVan(selfie) > MAX_SELFIE_BYTES) {
    return NextResponse.json({ error: "De selfie is te groot. Probeer een kleinere foto." }, { status: 400 });
  }

  const gekozen = parseerModelId(
    body.versie ? `${body.model ?? ""}:${body.versie}` : String(body.model ?? "")
  );
  if (!gekozen) {
    return NextResponse.json(
      { error: "Ongeldige model-identifier. Gebruik de vorm eigenaar/modelnaam." },
      { status: 400 }
    );
  }

  const positie = vindPositie(body.positie);
  const kleding = vindKleding(body.kleding);
  if (!positie || !kleding) {
    return NextResponse.json({ error: "Onbekende positie of kleding gekozen." }, { status: 400 });
  }

  try {
    const basisfoto = await vindBasisfoto(String(body.basisfoto ?? ""));
    if (!basisfoto) {
      return NextResponse.json(
        { error: "Deze basisfoto staat niet (meer) in de bibliotheek." },
        { status: 400 }
      );
    }

    const { profiel } = await haalProfiel(gekozen.id, gekozen.versie);
    const bezwaar = modelBezwaar(profiel);
    if (bezwaar) return NextResponse.json({ error: bezwaar }, { status: 422 });

    const basisDataUrl = await basisfotoAlsDataUrl(basisfoto);
    if (!basisDataUrl) {
      return NextResponse.json({ error: "De basisfoto kon niet worden gelezen." }, { status: 502 });
    }

    const prompt = bouwPrompt({
      positie: positie.waarde,
      kleding: kleding.waarde,
      plaatsingshint: basisfoto.plaatsingshint,
      groepskleding: basisfoto.kleding,
      extra: typeof body.extra === "string" ? body.extra.slice(0, 400) : undefined,
    });

    // De volgorde is vast en de prompt leunt erop: eerst de foto, dan de selfie.
    const input = bouwInput(profiel, {
      prompt,
      referenties: [basisDataUrl, selfie],
      verhouding: `${basisfoto.breedte}:${basisfoto.hoogte}`,
    });

    // Kan het model het formaat van de eerste foto overnemen, dan is dat exact.
    if (profiel.verhoudingVeld && profiel.verhoudingOpties.includes("match_input_image")) {
      input[profiel.verhoudingVeld] = "match_input_image";
    }

    const voorspelling = await startVoorspelling(profiel, input);
    return NextResponse.json({ id: voorspelling.id, prompt, model: gekozen.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Genereren mislukt." },
      { status: 502 }
    );
  }
}
