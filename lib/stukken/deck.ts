/**
 * Slide decks in het PowerPoint-template van PSV (seizoen 2026-2027).
 *
 * Een deck is een lijst slides; elke slide kiest een layout uit het template
 * en vult de velden van die layout. De vorm ligt vast in
 * `components/stuk/deck-weergave.tsx` (maten en achtergronden uit het
 * template), de regels in packages/psv-branding/open-design/psv/DESIGN.md.
 *
 * Puur: de vorm, de controle van wat het model of de collega aanlevert, en
 * de omzetting tussen de blokken van een rapport en slides.
 */

import {
  LIMIETEN,
  StukFout,
  leesAfbeeldingUrl,
  leesBlok,
  lijst,
  nadrukKeuzes,
  object,
  tekst,
  type Blok,
  type BlokInhoud,
} from "./model";

export const LAYOUTS = [
  "welkom",
  "hoofdstuk",
  "tekst",
  "tekst-2",
  "beeld",
  "speciaal",
  "quote",
  "foto",
  "grafiek",
  "tabel",
  "cijfers",
  "rood",
  "zwart",
  "afsluiting",
] as const;

export type SlideLayout = (typeof LAYOUTS)[number];

/** De namen zoals in het template (en de uitleg in de kiezer). */
export const LAYOUT_LABEL: Record<SlideLayout, string> = {
  welkom: "Welkom",
  hoofdstuk: "Hoofdstuk",
  tekst: "Tekst",
  "tekst-2": "Tekst (2 kolommen)",
  beeld: "Beeld",
  speciaal: "Speciaal",
  quote: "Quote",
  foto: "Foto zoom",
  grafiek: "Grafiek",
  tabel: "Tabel",
  cijfers: "Kerngetallen",
  rood: "Rood",
  zwart: "Zwart",
  afsluiting: "Afsluiting",
};

export const LAYOUT_UITLEG: Record<SlideLayout, string> = {
  welkom: "Opening: rood met het PSV EINDHOVEN-patroon en de titel.",
  hoofdstuk: "Begin van een onderdeel: rood met het embleem en de titel.",
  tekst: "Titel, subkop en tekst of opsomming, met de grijze schuine vorm.",
  "tekst-2": "Zoals Tekst, in twee kolommen.",
  beeld: "Tekst links, foto rechts in de schuine vorm; de foto in 5 breedtes.",
  speciaal: "Foto over de slide met een rode schuine vorm, titel en een wit tekstvak.",
  quote: "Een citaat in wit op rood, met een foto.",
  foto: "Alleen een foto, over de hele slide.",
  grafiek: "Uitleg links, grafiek rechts.",
  tabel: "Uitleg links, tabel rechts.",
  cijfers: "Kerngetallen in tegels.",
  rood: "Effen rood met titel en tekst.",
  zwart: "Effen zwart met titel en tekst.",
  afsluiting: "Einde: rood met het embleem.",
};

/** Welke velden een layout toont. Andere velden blijven bewaard (wissel je terug, dan staan ze er weer). */
export const LAYOUT_VELDEN: Record<SlideLayout, (keyof SlideVelden)[]> = {
  welkom: ["titel", "subkop"],
  hoofdstuk: ["titel", "subkop"],
  tekst: ["titel", "subkop", "tekst"],
  "tekst-2": ["titel", "subkop", "tekst", "tekst2"],
  beeld: ["titel", "subkop", "tekst", "foto", "fotoBreedte"],
  speciaal: ["titel", "subkop", "tekst", "foto"],
  quote: ["quote", "naam", "foto"],
  foto: ["foto"],
  grafiek: ["titel", "subkop", "tekst", "grafiek", "nadruk"],
  tabel: ["titel", "subkop", "tekst", "tabel", "nadruk"],
  cijfers: ["titel", "kerngetallen", "nadruk"],
  rood: ["titel", "tekst"],
  zwart: ["titel", "tekst"],
  afsluiting: [],
};

/** Layouts met een foto; zonder foto staat er in het voorbeeld een lege plek. */
export const MET_FOTO: SlideLayout[] = ["beeld", "speciaal", "quote", "foto"];

export type Grafiek = Omit<Extract<BlokInhoud, { type: "grafiek" }>, "type" | "opmaak">;
export type Tabel = Omit<Extract<BlokInhoud, { type: "tabel" }>, "type" | "opmaak">;
export type Kerngetallen = Omit<Extract<BlokInhoud, { type: "kerngetallen" }>, "type" | "opmaak">;

export interface Foto {
  /** Wat erop moet; de zoekterm in FileFlow. */
  wens?: string;
  /** Alleen van onze eigen Bunny-CDN (map stukken/). */
  url?: string;
  alt?: string;
}

export interface SlideVelden {
  /** Wit op het zwarte blok. Kort: één regel. */
  titel?: string;
  /** Rood, boven de tekst (bij Welkom en Hoofdstuk: de regel onder de titel). */
  subkop?: string;
  /** Tekst met **vet** en regels die met "- " beginnen (opsomming). */
  tekst?: string;
  /** De tweede kolom bij Tekst (2 kolommen). */
  tekst2?: string;
  foto?: Foto;
  /** Bij Beeld: hoe breed de foto is, 1 (smal) t/m 5 (bijna de hele slide), zoals Beeld 1 t/m 5. */
  fotoBreedte?: 1 | 2 | 3 | 4 | 5;
  quote?: string;
  naam?: string;
  grafiek?: Grafiek;
  tabel?: Tabel;
  kerngetallen?: Kerngetallen;
  /** De reeks, rij (eerste cel) of het kerngetal dat eruit springt. */
  nadruk?: string;
}

export interface DeckSlide extends SlideVelden {
  id: string;
  layout: SlideLayout;
}

export const DECK_LIMIETEN = { slides: 40, titel: 120, subkop: 160, tekst: 2_000, quote: 300, naam: 100 } as const;

/* ---------- Controle ---------- */

function leesFoto(raw: unknown, waar: string): Foto | undefined {
  if (raw === undefined || raw === null) return undefined;
  const o = object(raw, waar);
  const wens = tekst(o.wens, `${waar}: wens`, LIMIETEN.wens, false);
  const url = leesAfbeeldingUrl(o.url, `${waar}: url`);
  const alt = tekst(o.alt, `${waar}: alt`, LIMIETEN.alt, false);
  return wens || url ? { ...(wens && { wens }), ...(url && { url }), ...(alt && { alt }) } : undefined;
}

function zonderType<T extends BlokInhoud>(blok: T): Omit<T, "type" | "opmaak"> {
  const { type: _t, opmaak: _o, ...rest } = blok;
  void _t;
  void _o;
  return rest;
}

function leesData<K extends "grafiek" | "tabel" | "kerngetallen">(type: K, raw: unknown, waar: string) {
  if (raw === undefined || raw === null) return undefined;
  const blok = leesBlok({ ...object(raw, waar), type }, waar) as Extract<BlokInhoud, { type: K }>;
  return zonderType(blok);
}

function verplicht(slide: DeckSlide, veld: keyof SlideVelden, waar: string) {
  if (slide[veld] === undefined) throw new StukFout(`${waar}: een slide met layout "${slide.layout}" heeft ${veld} nodig.`);
}

/**
 * Controleert één slide en maakt hem schoon. `streng`: een nadruk die niet
 * bestaat is een fout; anders valt hij weg (na een wijziging van de data).
 */
export function leesSlide(raw: unknown, id: string, waar = "Slide", streng = true): DeckSlide {
  const s = object(raw, waar);
  const layout = s.layout as SlideLayout;
  if (!LAYOUTS.includes(layout)) throw new StukFout(`${waar}: onbekende layout "${String(s.layout)}". Kies uit ${LAYOUTS.join(", ")}.`);
  const fotoBreedte = s.fotoBreedte === undefined || s.fotoBreedte === null ? undefined : Number(s.fotoBreedte);
  if (fotoBreedte !== undefined && ![1, 2, 3, 4, 5].includes(fotoBreedte)) throw new StukFout(`${waar}: fotoBreedte moet 1 t/m 5 zijn.`);
  const slide: DeckSlide = {
    id,
    layout,
    ...opt("titel", tekst(s.titel, `${waar}: titel`, DECK_LIMIETEN.titel, false)),
    ...opt("subkop", tekst(s.subkop, `${waar}: subkop`, DECK_LIMIETEN.subkop, false)),
    ...opt("tekst", tekst(s.tekst, `${waar}: tekst`, DECK_LIMIETEN.tekst, false)),
    ...opt("tekst2", tekst(s.tekst2, `${waar}: tekst2`, DECK_LIMIETEN.tekst, false)),
    ...opt("foto", leesFoto(s.foto, `${waar}: foto`)),
    ...opt("fotoBreedte", fotoBreedte as DeckSlide["fotoBreedte"]),
    ...opt("quote", tekst(s.quote, `${waar}: quote`, DECK_LIMIETEN.quote, false)),
    ...opt("naam", tekst(s.naam, `${waar}: naam`, DECK_LIMIETEN.naam, false)),
    ...opt("grafiek", leesData("grafiek", s.grafiek, `${waar}: grafiek`)),
    ...opt("tabel", leesData("tabel", s.tabel, `${waar}: tabel`)),
    ...opt("kerngetallen", leesData("kerngetallen", s.kerngetallen, `${waar}: kerngetallen`)),
  };
  if (layout === "grafiek") verplicht(slide, "grafiek", waar);
  if (layout === "tabel") verplicht(slide, "tabel", waar);
  if (layout === "cijfers") verplicht(slide, "kerngetallen", waar);
  if (layout === "quote") verplicht(slide, "quote", waar);
  const nadruk = tekst(s.nadruk, `${waar}: nadruk`, LIMIETEN.cel, false);
  if (nadruk) {
    const keuzes = nadrukKeuzesVan(slide);
    if (keuzes.includes(nadruk)) slide.nadruk = nadruk;
    else if (streng) {
      throw new StukFout(
        keuzes.length ? `${waar}: nadruk "${nadruk}" bestaat niet op deze slide. Kies uit: ${keuzes.join(", ")}.` : `${waar}: deze slide heeft niets om uit te lichten.`
      );
    }
  }
  return slide;
}

function opt<K extends keyof SlideVelden>(sleutel: K, waarde: SlideVelden[K] | undefined): Partial<SlideVelden> {
  return waarde === undefined ? {} : { [sleutel]: waarde };
}

/** Waarop nadruk kan wijzen: de data van de layout. */
export function nadrukKeuzesVan(slide: SlideVelden & { layout: SlideLayout }): string[] {
  if (slide.layout === "grafiek" && slide.grafiek) return nadrukKeuzes({ type: "grafiek", ...slide.grafiek });
  if (slide.layout === "tabel" && slide.tabel) return nadrukKeuzes({ type: "tabel", ...slide.tabel });
  if (slide.layout === "cijfers" && slide.kerngetallen) return nadrukKeuzes({ type: "kerngetallen", ...slide.kerngetallen });
  return [];
}

/** Een nieuw slide-id: s1, s2, …, uniek in het deck. */
export function volgendSlideId(slides: { id: string }[]): string {
  const gebruikt = new Set(slides.map((s) => s.id));
  let n = slides.length + 1;
  while (gebruikt.has(`s${n}`)) n += 1;
  return `s${n}`;
}

/** Een lijst slides zoals het model of de collega hem aanlevert. */
export function leesSlides(raw: unknown): DeckSlide[] {
  const lijstRaw = lijst(raw, "slides", 1, DECK_LIMIETEN.slides);
  const slides: DeckSlide[] = [];
  lijstRaw.forEach((s, i) => slides.push(leesSlide(s, `s${i + 1}`, `Slide ${i + 1}`)));
  return slides;
}

/**
 * Een wijziging op een bestaande slide: velden in `wijziging` vervangen die van
 * de slide, `null` of "" haalt een veld weg. Een foto wordt samengevoegd, zodat
 * een nieuwe wens de geüploade foto niet weggooit (en andersom).
 */
export function wijzigSlide(slide: DeckSlide, wijziging: unknown, waar: string): DeckSlide {
  const w = object(wijziging, waar);
  const samen: Record<string, unknown> = { ...slide };
  for (const [sleutel, waarde] of Object.entries(w)) {
    if (sleutel === "id") continue;
    if (waarde === null || waarde === "") delete samen[sleutel];
    else if (sleutel === "foto" && typeof waarde === "object" && !Array.isArray(waarde)) {
      const foto: Record<string, unknown> = { ...(slide.foto ?? {}) };
      for (const [k, v] of Object.entries(waarde as Record<string, unknown>)) {
        if (v === null || v === "") delete foto[k];
        else foto[k] = v;
      }
      samen.foto = foto;
    } else samen[sleutel] = waarde;
  }
  return leesSlide(samen, slide.id, waar, "nadruk" in w);
}

/** Een slide met een foto-layout maar (nog) zonder foto: alleen een lege plek in het voorbeeld. */
export function wachtOpFoto(slide: DeckSlide): boolean {
  return MET_FOTO.includes(slide.layout) && !slide.foto?.url;
}

/** De bronnen van de cijfers op de slides, uniek, in volgorde. */
export function bronnenVanSlides(slides: DeckSlide[]): string[] {
  const bronnen = slides.flatMap((s) => {
    const data = s.layout === "grafiek" ? s.grafiek : s.layout === "tabel" ? s.tabel : s.layout === "cijfers" ? s.kerngetallen : undefined;
    return data ? [data.bron] : [];
  });
  return [...new Set(bronnen)];
}

/** Een korte regel per slide, voor het model. */
export function slideSamenvatting(slide: DeckSlide): string {
  const kern = slide.titel ?? slide.quote ?? slide.foto?.wens ?? "";
  const foto = MET_FOTO.includes(slide.layout) ? (slide.foto?.url ? " [foto]" : " [wacht op foto]") : "";
  return `${slide.id} ${slide.layout}${kern ? `: ${kern.slice(0, 60)}` : ""}${foto}`;
}

/* ---------- Omzetten: rapport ↔ deck ---------- */

function opsomming(punten: string[]): string {
  return punten.map((p) => `- ${p}`).join("\n");
}

/**
 * Een rapport als slides in het template: een welkomstslide, per kop een
 * hoofdstuk, per blok een slide (tekst naast een grafiek, tabel of foto op
 * één slide als ze half naast elkaar stonden), en een afsluiting.
 */
export function vanBlokken(stuk: { titel: string; ondertitel?: string; blokken: Blok[] }): DeckSlide[] {
  const slides: Omit<DeckSlide, "id">[] = [{ layout: "welkom", titel: stuk.titel, ...(stuk.ondertitel && { subkop: stuk.ondertitel }) }];
  const b = stuk.blokken;
  const tekstVan = (blok: Blok): string | undefined =>
    blok.type === "tekst" ? blok.tekst : blok.type === "conclusie" ? opsomming(blok.punten) : undefined;
  for (let i = 0; i < b.length; i++) {
    const blok = b[i];
    const volgende = b[i + 1];
    const kern = blok.opmaak?.kernboodschap;
    // Tekst half naast een grafiek, tabel of foto: samen op één slide.
    const paar =
      blok.opmaak?.grootte === "half" && volgende?.opmaak?.grootte === "half"
        ? tekstVan(blok) !== undefined && ["grafiek", "tabel", "afbeelding"].includes(volgende.type)
          ? { tekstBlok: blok, data: volgende }
          : tekstVan(volgende) !== undefined && ["grafiek", "tabel", "afbeelding"].includes(blok.type)
            ? { tekstBlok: volgende, data: blok }
            : null
        : null;
    if (paar) {
      i += 1;
      const titel = paar.tekstBlok.opmaak?.kernboodschap ?? paar.data.opmaak?.kernboodschap;
      const tekstWaarde = tekstVan(paar.tekstBlok);
      const d = paar.data;
      if (d.type === "afbeelding") {
        slides.push({ layout: "beeld", ...(titel && { titel }), ...(tekstWaarde && { tekst: tekstWaarde }), foto: fotoVan(d), fotoBreedte: 3 });
      } else if (d.type === "grafiek") {
        slides.push({ layout: "grafiek", titel: titel ?? d.titel, ...(tekstWaarde && { tekst: tekstWaarde }), grafiek: zonderType(d), ...(d.opmaak?.nadruk && { nadruk: d.opmaak.nadruk }) });
      } else if (d.type === "tabel") {
        slides.push({ layout: "tabel", ...((titel ?? d.titel) && { titel: titel ?? d.titel }), ...(tekstWaarde && { tekst: tekstWaarde }), tabel: zonderType(d), ...(d.opmaak?.nadruk && { nadruk: d.opmaak.nadruk }) });
      }
      continue;
    }
    switch (blok.type) {
      case "kop":
        slides.push({ layout: "hoofdstuk", titel: kern ?? blok.tekst });
        break;
      case "tekst":
        slides.push({ layout: "tekst", ...(kern && { titel: kern }), tekst: blok.tekst });
        break;
      case "conclusie":
        slides.push({ layout: "tekst", titel: kern ?? "Conclusie", tekst: opsomming(blok.punten) });
        break;
      case "kerngetallen":
        slides.push({ layout: "cijfers", titel: kern ?? "In cijfers", kerngetallen: zonderType(blok), ...(blok.opmaak?.nadruk && { nadruk: blok.opmaak.nadruk }) });
        break;
      case "grafiek":
        slides.push({ layout: "grafiek", titel: kern ?? blok.titel, grafiek: zonderType(blok), ...(blok.opmaak?.nadruk && { nadruk: blok.opmaak.nadruk }) });
        break;
      case "tabel":
        slides.push({ layout: "tabel", ...((kern ?? blok.titel) && { titel: kern ?? blok.titel }), tabel: zonderType(blok), ...(blok.opmaak?.nadruk && { nadruk: blok.opmaak.nadruk }) });
        break;
      case "afbeelding":
        slides.push(kern ? { layout: "speciaal", titel: kern, foto: fotoVan(blok) } : { layout: "foto", foto: fotoVan(blok) });
        break;
    }
  }
  slides.push({ layout: "afsluiting" });
  return slides.map((s, i) => ({ ...s, id: `s${i + 1}` }));
}

function fotoVan(blok: Extract<Blok, { type: "afbeelding" }>): Foto {
  return { wens: blok.wens, ...(blok.url && { url: blok.url }), ...(blok.alt && { alt: blok.alt }) };
}

/** Slides terug als blokken van een rapport (als er nog geen rapport is). */
export function naarBlokken(slides: DeckSlide[]): BlokInhoud[] {
  const blokken: BlokInhoud[] = [];
  const metTitel = (titel?: string) => (titel ? { opmaak: { kernboodschap: titel } } : {});
  for (const s of slides) {
    const foto = s.foto && (s.foto.wens || s.foto.url) ? ({ type: "afbeelding", wens: s.foto.wens ?? "Foto", ...(s.foto.url && { url: s.foto.url }), ...(s.foto.alt && { alt: s.foto.alt }) } as BlokInhoud) : null;
    const tekstBlok = (t?: string, titel?: string) => (t ? ({ type: "tekst", tekst: t, ...metTitel(titel) } as BlokInhoud) : null);
    switch (s.layout) {
      case "welkom":
      case "afsluiting":
        break;
      case "hoofdstuk":
        if (s.titel) blokken.push({ type: "kop", tekst: s.titel });
        break;
      case "grafiek":
        if (s.tekst) blokken.push(tekstBlok(s.tekst)!);
        if (s.grafiek) blokken.push({ type: "grafiek", ...s.grafiek, ...(s.nadruk || s.titel ? { opmaak: { ...(s.nadruk && { nadruk: s.nadruk }), ...(s.titel && { kernboodschap: s.titel }) } } : {}) });
        break;
      case "tabel":
        if (s.tekst) blokken.push(tekstBlok(s.tekst)!);
        if (s.tabel) blokken.push({ type: "tabel", ...s.tabel, ...(s.nadruk || s.titel ? { opmaak: { ...(s.nadruk && { nadruk: s.nadruk }), ...(s.titel && { kernboodschap: s.titel }) } } : {}) });
        break;
      case "cijfers":
        if (s.kerngetallen) blokken.push({ type: "kerngetallen", ...s.kerngetallen, ...(s.nadruk || s.titel ? { opmaak: { ...(s.nadruk && { nadruk: s.nadruk }), ...(s.titel && { kernboodschap: s.titel }) } } : {}) });
        break;
      case "quote":
        if (s.quote) blokken.push({ type: "tekst", tekst: `'${s.quote}'${s.naam ? `\n${s.naam}` : ""}` });
        if (foto) blokken.push(foto);
        break;
      case "foto":
        if (foto) blokken.push(foto);
        break;
      default: {
        const t = [s.subkop && `**${s.subkop}**`, s.tekst, s.tekst2].filter(Boolean).join("\n\n");
        const blok = tekstBlok(t, s.titel);
        if (blok) blokken.push(blok);
        if (foto) blokken.push(foto);
      }
    }
  }
  return blokken.length ? blokken : [{ type: "tekst", tekst: "Leeg rapport" }];
}
