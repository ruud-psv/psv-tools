import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { parseerModelId, type ModelProfielInfo } from "@/lib/kleurplaat";
import { maxReferenties } from "@/lib/kleurplaat/schema";
import { haalProfiel } from "@/lib/kleurplaat/replicate";

export const runtime = "nodejs";

/**
 * Controleert een model-identifier bij Replicate en vertelt wat de tool ermee
 * kan: neemt het referenties mee, kent het een verhouding, levert het een
 * afbeelding op. De UI gebruikt dit om een model te laten toevoegen en om bij
 * het gekozen model te tonen wat er meegaat.
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

    const waarschuwingen: string[] = [];
    if (!profiel.levertBestand) {
      waarschuwingen.push(
        "Dit model lijkt geen afbeelding op te leveren. Controleer of je het juiste model hebt."
      );
    }
    if (!profiel.referentieVeld) {
      waarschuwingen.push(
        "Dit model neemt geen referentiebeelden mee; Phoxy wordt dan alleen uit de omschrijving getekend."
      );
    }
    if (!profiel.promptVeld) {
      waarschuwingen.push(
        "Er is geen promptveld gevonden. De prompt gaat mee als 'prompt' — mogelijk weigert het model dat."
      );
    }
    if (!profiel.verhoudingVeld) {
      waarschuwingen.push("Dit model kent geen instelbare verhouding; het houdt zijn eigen formaat aan.");
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
