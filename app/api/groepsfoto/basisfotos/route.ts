import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { extensieVoor } from "@/lib/blob/beelden";
import type { BasisfotoWijziging } from "@/lib/groepsfoto";
import {
  bewaarBasisfoto,
  lijstBasisfotos,
  MAX_BASISFOTOS,
  verwijderBasisfoto,
  wijzigBasisfoto,
} from "@/lib/groepsfoto/opslag";

export const runtime = "nodejs";

/**
 * Een basisfoto wordt in de browser verkleind tot 2048px; dan is hij hooguit
 * een paar MB. De grens ligt onder de 4,5 MB die een Vercel-functie aanneemt.
 */
const MAX_BYTES = 4_000_000;

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
    return NextResponse.json({ basisfotos: await lijstBasisfotos() });
  } catch (err) {
    return fout(err, "Basisfoto's ophalen mislukt.");
  }
}

export async function POST(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  let formulier: FormData;
  try {
    formulier = await req.formData();
  } catch {
    return NextResponse.json({ error: "Kon het formulier niet lezen." }, { status: 400 });
  }

  const bestand = formulier.get("bestand");
  if (!bestand || typeof bestand === "string") {
    return NextResponse.json({ error: "Geen bestand ontvangen." }, { status: 400 });
  }
  if (!extensieVoor(bestand.type)) {
    return NextResponse.json({ error: "Alleen jpg, png of webp kan als basisfoto." }, { status: 400 });
  }
  if (bestand.size > MAX_BYTES) {
    return NextResponse.json({ error: "Deze foto is te groot. Upload hem kleiner." }, { status: 400 });
  }

  // Wie de foto toevoegt, bevestigt dat de spelers erop toestemming gaven.
  if (formulier.get("rechten") !== "ja") {
    return NextResponse.json(
      { error: "Bevestig eerst dat de spelers op deze foto toestemming gaven voor dit gebruik." },
      { status: 400 }
    );
  }

  const breedte = Number(formulier.get("breedte"));
  const hoogte = Number(formulier.get("hoogte"));
  if (!(breedte > 0 && hoogte > 0)) {
    return NextResponse.json({ error: "De afmetingen van de foto ontbreken." }, { status: 400 });
  }

  try {
    const bestaand = await lijstBasisfotos();
    if (bestaand.length >= MAX_BASISFOTOS) {
      return NextResponse.json(
        { error: `De bibliotheek zit vol (${MAX_BASISFOTOS} foto's). Verwijder er eerst een.` },
        { status: 409 }
      );
    }

    const basisfoto = await bewaarBasisfoto({
      inhoud: await bestand.arrayBuffer(),
      contentType: bestand.type,
      label: String(formulier.get("label") ?? ""),
      gelegenheid: formulier.get("gelegenheid"),
      breedte,
      hoogte,
      plaatsingshint: formulier.get("plaatsingshint"),
      kleding: formulier.get("kleding"),
      toegevoegdDoor: sessie.email,
    });
    return NextResponse.json({ basisfoto });
  } catch (err) {
    return fout(err, "Basisfoto opslaan mislukt.");
  }
}

export async function PATCH(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  let body: BasisfotoWijziging & { id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Kon de aanvraag niet lezen." }, { status: 400 });
  }
  if (typeof body.id !== "string") {
    return NextResponse.json({ error: "Geen basisfoto opgegeven." }, { status: 400 });
  }

  try {
    const basisfoto = await wijzigBasisfoto(body.id, {
      label: body.label,
      gelegenheid: body.gelegenheid,
      plaatsingshint: body.plaatsingshint,
      kleding: body.kleding,
    });
    return NextResponse.json({ basisfoto });
  } catch (err) {
    return fout(err, "Basisfoto bijwerken mislukt.");
  }
}

export async function DELETE(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Geen basisfoto opgegeven." }, { status: 400 });

  try {
    await verwijderBasisfoto(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fout(err, "Basisfoto verwijderen mislukt.");
  }
}
