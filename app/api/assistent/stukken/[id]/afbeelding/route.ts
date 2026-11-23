import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { AfbeeldingFout, MAX_AFBEELDING_BYTES, MAX_KOPIE_BYTES, controleerAfbeelding, uploadAfbeelding } from "@/lib/stukken/afbeelding";
import { FileflowFout, haalBeeldOp } from "@/lib/fileflow/client";
import { StukConflict, StukFout, handmatigBewerken, type Blok } from "@/lib/stukken/model";
import { getStuk, saveStuk } from "@/lib/stukken/store";

/**
 * Een foto toevoegen aan een stuk: aan een afbeeldingsblok (`doel` = blok-id)
 * of als titelbeeld (`doel` = "titel"). De foto is een geüpload bestand
 * (`bestand`) of een foto uit FileFlow (`fileflowId`); die haalt de server zelf
 * op. In beide gevallen gaat er een kopie naar onze Bunny-map en komt het stuk
 * in één keer op de nieuwe versie, uitgaand van de versie die de collega voor
 * zich had.
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const form = await req.formData().catch(() => null);
  const bestand = form?.get("bestand");
  const fileflowId = Number(form?.get("fileflowId"));
  const uitFileflow = Number.isInteger(fileflowId) && fileflowId > 0;
  const doel = form?.get("doel");
  const basisVersie = Number(form?.get("basisVersie"));
  const metBestand = bestand && typeof bestand !== "string";
  if (!form || (!metBestand && !uitFileflow) || typeof doel !== "string" || !doel) {
    return NextResponse.json({ error: "Geen foto ontvangen." }, { status: 400 });
  }
  if (metBestand && bestand.size > MAX_AFBEELDING_BYTES) return NextResponse.json({ error: "De foto is te groot. Hooguit 4 MB." }, { status: 413 });

  try {
    const stuk = await getStuk(auth.email, id);
    if (!stuk) return NextResponse.json({ error: "Geen stuk bij dit gesprek." }, { status: 404 });
    // Eerst controleren, dan pas uploaden: geen foto's op Bunny voor een wijziging die toch niet doorgaat.
    if (stuk.versie !== basisVersie) throw new StukConflict(stuk);
    // Het doel: "titel", "slide:<id>" (de foto van een slide) of het id van een afbeeldingsblok.
    const slideId = doel.startsWith("slide:") ? doel.slice("slide:".length) : null;
    const slide = slideId ? stuk.slides?.find((x) => x.id === slideId) : null;
    if (slideId && !slide) return NextResponse.json({ error: "Deze slide bestaat niet (meer)." }, { status: 400 });
    const blok = doel === "titel" || slideId ? null : stuk.blokken.find((b): b is Extract<Blok, { type: "afbeelding" }> => b.id === doel && b.type === "afbeelding");
    if (doel !== "titel" && !slideId && !blok) return NextResponse.json({ error: "Dit blok bestaat niet (meer) of is geen afbeelding." }, { status: 400 });

    const { bytes, alt } = metBestand
      ? { bytes: new Uint8Array(await bestand.arrayBuffer()), alt: undefined }
      : await haalBeeldOp(fileflowId).then(({ bytes, item }) => ({ bytes, alt: item.name?.trim() || undefined }));
    const soort = controleerAfbeelding(bytes, metBestand ? MAX_AFBEELDING_BYTES : MAX_KOPIE_BYTES);
    const url = await uploadAfbeelding(bytes, soort);

    const bewerking = slide
      ? {
          basisVersie,
          acties: [{ actie: "slide_wijzigen", slide_id: slide.id, slide: { foto: { url, positie: null, ...(!slide.foto?.alt && alt && { alt: alt.slice(0, 200) }) } } }],
        }
      : blok
      ? {
          basisVersie,
          acties: [
            {
              actie: "wijzigen",
              blok_id: blok.id,
              // Zonder opmaak: die blijft staan.
              blok: {
                type: "afbeelding",
                wens: blok.wens,
                url,
                // Uit FileFlow: de naam van de foto als beschrijving, tenzij er al een is.
                ...((blok.alt ?? alt) && { alt: (blok.alt ?? alt)!.slice(0, 200) }),
                ...(blok.bijschrift && { bijschrift: blok.bijschrift }),
              },
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
    if (err instanceof FileflowFout) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[assistent/stukken/:id/afbeelding] mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "De foto kon niet worden toegevoegd. Probeer het opnieuw." }, { status: 500 });
  }
}
