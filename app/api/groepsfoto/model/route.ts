import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { modelBezwaar, parseerModelId, type ModelProfielInfo } from "@/lib/groepsfoto";
import { haalProfiel } from "@/lib/replicate/client";
import { maxReferenties } from "@/lib/replicate/schema";

export const runtime = "nodejs";

/**
 * Controleert een model-identifier bij Replicate en vertelt of de Groepsfoto
 * Creator ermee kan werken. Anders dan bij de kleurplaat is een model dat maar
 * één beeld meeneemt hier een harde fout, geen waarschuwing.
 */
export async function GET(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  const gekozen = parseerModelId(req.nextUrl.searchParams.get("id") ?? "");
  if (!gekozen) {
    return NextResponse.json(
      { error: "Ongeldige model-identifier. Gebruik eigenaar/modelnaam, of plak de URL van replicate.com." },
      { status: 400 }
    );
  }

  try {
    const { profiel, omschrijving } = await haalProfiel(gekozen.id, gekozen.versie);

    const bezwaar = modelBezwaar(profiel);
    if (bezwaar) return NextResponse.json({ error: bezwaar }, { status: 422 });

    const waarschuwingen: string[] = [];
    if (!profiel.promptVeld) {
      waarschuwingen.push(
        "Er is geen promptveld gevonden. De prompt gaat mee als 'prompt' — mogelijk weigert het model dat."
      );
    }
    if (!profiel.verhoudingVeld) {
      waarschuwingen.push(
        "Dit model kent geen instelbare verhouding; het resultaat kan een ander formaat hebben dan de basisfoto."
      );
    }

    const info: ModelProfielInfo = {
      id: profiel.id,
      versie: profiel.versie,
      omschrijving,
      maxReferenties: maxReferenties(profiel),
      referentieVeld: profiel.referentieVeld,
      verhoudingOpties: profiel.verhoudingOpties,
      levertBestand: profiel.levertBestand,
      waarschuwingen,
    };

    return NextResponse.json(info);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Model opvragen mislukt." },
      { status: 502 }
    );
  }
}
