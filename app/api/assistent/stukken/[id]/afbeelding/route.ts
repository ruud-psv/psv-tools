import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { AfbeeldingFout, MAX_AFBEELDING_BYTES, controleerAfbeelding, uploadAfbeelding } from "@/lib/stukken/afbeelding";
import { StukConflict, StukFout, handmatigBewerken, type Blok } from "@/lib/stukken/model";
import { getStuk, saveStuk } from "@/lib/stukken/store";

/**
 * Een foto toevoegen aan een stuk: aan een afbeeldingsblok (`doel` = blok-id)
 * of als titelbeeld (`doel` = "titel"). Uploaden en in het stuk zetten in één
 * keer, op de versie die de collega voor zich had; het wordt een nieuwe versie.
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const form = await req.formData().catch(() => null);
  const bestand = form?.get("bestand");
  const doel = form?.get("doel");
  const basisVersie = Number(form?.get("basisVersie"));
  if (!form || !bestand || typeof bestand === "string" || typeof doel !== "string" || !doel) {
    return NextResponse.json({ error: "Geen foto ontvangen." }, { status: 400 });
  }
  if (bestand.size > MAX_AFBEELDING_BYTES) return NextResponse.json({ error: "De foto is te groot. Hooguit 4 MB." }, { status: 413 });

  try {
    const stuk = await getStuk(auth.email, id);
    if (!stuk) return NextResponse.json({ error: "Geen stuk bij dit gesprek." }, { status: 404 });
    // Eerst controleren, dan pas uploaden: geen foto's op Bunny voor een wijziging die toch niet doorgaat.
    if (stuk.versie !== basisVersie) throw new StukConflict(stuk);
    const blok = doel === "titel" ? null : stuk.blokken.find((b): b is Extract<Blok, { type: "afbeelding" }> => b.id === doel && b.type === "afbeelding");
    if (doel !== "titel" && !blok) return NextResponse.json({ error: "Dit blok bestaat niet (meer) of is geen afbeelding." }, { status: 400 });

    const bytes = new Uint8Array(await bestand.arrayBuffer());
    const soort = controleerAfbeelding(bytes);
    const url = await uploadAfbeelding(bytes, soort);

    const bewerking = blok
      ? {
          basisVersie,
          acties: [
            {
              actie: "wijzigen",
              blok_id: blok.id,
              // Zonder opmaak: die blijft staan.
              blok: { type: "afbeelding", wens: blok.wens, url, ...(blok.alt && { alt: blok.alt }), ...(blok.bijschrift && { bijschrift: blok.bijschrift }) },
            },
          ],
        }
      : { basisVersie, titelbeeld: { ...(stuk.titelbeeld?.wens && { wens: stuk.titelbeeld.wens }), url } };
    const nieuw = handmatigBewerken(stuk, bewerking, new Date().toISOString());
    await saveStuk(nieuw);
    return NextResponse.json({ stuk: nieuw });
  } catch (err) {
    if (err instanceof StukConflict) return NextResponse.json({ error: err.message, stuk: err.stuk }, { status: 409 });
    if (err instanceof AfbeeldingFout || err instanceof StukFout) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[assistent/stukken/:id/afbeelding] mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "De foto kon niet worden toegevoegd. Probeer het opnieuw." }, { status: 500 });
  }
}
