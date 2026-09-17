import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import {
  bewaarReferentie,
  extensieVoor,
  lijstReferenties,
  MAX_BIBLIOTHEEK,
  verwijderReferentie,
} from "@/lib/kleurplaat/opslag";

export const runtime = "nodejs";

/** Na het verkleinen in de browser is een referentie hooguit een paar honderd kB. */
const MAX_BYTES = 2_000_000;

function fout(err: unknown, standaard: string) {
  return NextResponse.json(
    { error: err instanceof Error ? err.message : standaard },
    { status: 502 }
  );
}

export async function GET(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  try {
    return NextResponse.json({ referenties: await lijstReferenties() });
  } catch (err) {
    return fout(err, "Referenties ophalen mislukt.");
  }
}

export async function POST(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  let bestand: File;
  try {
    const formulier = await req.formData();
    const f = formulier.get("bestand");
    if (!f || typeof f === "string") {
      return NextResponse.json({ error: "Geen bestand ontvangen." }, { status: 400 });
    }
    bestand = f as File;
  } catch {
    return NextResponse.json({ error: "Kon het formulier niet lezen." }, { status: 400 });
  }

  if (!extensieVoor(bestand.type)) {
    return NextResponse.json(
      { error: "Alleen jpg, png of webp kan als referentie. Andere formaten worden in de browser omgezet." },
      { status: 400 }
    );
  }
  if (bestand.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Deze referentie is te groot. Upload hem kleiner." },
      { status: 400 }
    );
  }

  try {
    const bestaand = await lijstReferenties();
    if (bestaand.length >= MAX_BIBLIOTHEEK) {
      return NextResponse.json(
        {
          error: `De bibliotheek zit vol (${MAX_BIBLIOTHEEK} referenties). Verwijder er eerst een.`,
        },
        { status: 409 }
      );
    }

    const referentie = await bewaarReferentie(
      bestand.name,
      await bestand.arrayBuffer(),
      bestand.type
    );
    return NextResponse.json({ referentie });
  } catch (err) {
    return fout(err, "Referentie opslaan mislukt.");
  }
}

export async function DELETE(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  const pad = req.nextUrl.searchParams.get("pad");
  if (!pad) return NextResponse.json({ error: "Geen referentie opgegeven." }, { status: 400 });

  try {
    await verwijderReferentie(pad);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fout(err, "Referentie verwijderen mislukt.");
  }
}
