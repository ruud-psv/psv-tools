import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { bewaarLogo, huidigLogo, verwijderLogo } from "@/lib/kleurplaat/opslag";

export const runtime = "nodejs";

/** Een logo is klein; groter dan dit is een vergissing. */
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
    return NextResponse.json({ logo: await huidigLogo() });
  } catch (err) {
    return fout(err, "Logo ophalen mislukt.");
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

  if (bestand.type !== "image/png") {
    return NextResponse.json(
      { error: "Het logo moet een png zijn, met een doorzichtige achtergrond." },
      { status: 400 }
    );
  }
  if (bestand.size > MAX_BYTES) {
    return NextResponse.json({ error: "Dit logo is te groot." }, { status: 400 });
  }

  try {
    return NextResponse.json({ logo: await bewaarLogo(bestand.name, await bestand.arrayBuffer()) });
  } catch (err) {
    return fout(err, "Logo opslaan mislukt.");
  }
}

export async function DELETE(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  try {
    await verwijderLogo();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fout(err, "Logo verwijderen mislukt.");
  }
}
