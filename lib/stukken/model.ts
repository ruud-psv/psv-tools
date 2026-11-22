/**
 * Stukken: een rapport of slide deck dat de assistent maakt op basis van een
 * gesprek. Een stuk bestaat uit vaste blokken (geen vrije HTML), zodat het
 * altijd in de PSV-huisstijl staat, er op een gedeelde link geen code van het
 * model draait, en één blok kan worden aangepast zonder de rest.
 *
 * Puur: de vorm, de controle van wat het model aanlevert, en de bewerkingen.
 * De opslag staat in `lib/stukken/store.ts`, de tools in
 * `lib/assistent/stukken-tools.ts`. Zie `docs/stukken.md`.
 */

/**
 * Een rapport is een pagina (ook als one-pager: dat is een kort rapport met
 * halve blokken naast elkaar). Een deck zet dezelfde blokken op slides.
 * Oude stukken met soort "onepager" worden bij het lezen een rapport.
 */
export type StukSoort = "rapport" | "deck";

export const STUK_SOORT_LABEL: Record<StukSoort, string> = {
  rapport: "Rapport",
  deck: "Slide deck",
};

export const STUK_SOORTEN = Object.keys(STUK_SOORT_LABEL) as StukSoort[];

/** Hoe breed een blok is: half (naast een ander half blok), heel, of groot (meer ruimte, grotere grafiek). */
export type Grootte = "half" | "heel" | "groot";
export const GROOTTES: Grootte[] = ["half", "heel", "groot"];

/** De achtergrond van een blok (rapport) of slide (deck), alleen huisstijlkleuren. */
export type Achtergrond = "wit" | "grijs" | "rood" | "zwart";
export const ACHTERGRONDEN: Achtergrond[] = ["wit", "grijs", "rood", "zwart"];

/**
 * De vorm van een blok, los van de inhoud. Alles is optioneel; zonder opmaak
 * kiest de weergave zelf.
 */
export interface Opmaak {
  grootte?: Grootte;
  achtergrond?: Achtergrond;
  /** De reeks (grafiek), rij (tabel, op de eerste cel) of het kerngetal (op label) dat eruit springt. */
  nadruk?: string;
  /** Wat de lezer moet onthouden, als stelling: de titel van de slide, of een kop boven het blok. */
  kernboodschap?: string;
}

export interface Kerngetal {
  label: string;
  /** Zoals hij op het stuk komt, bijvoorbeeld "€ 374.610" of "12,4%". */
  waarde: string;
  toelichting?: string;
}

export interface Reeks {
  naam: string;
  waarden: number[];
}

/** De blokken. `bron` is verplicht bij alles met cijfers: waar komen ze vandaan. */
export type BlokInhoud = (
  | { type: "kop"; tekst: string }
  | { type: "tekst"; tekst: string }
  | { type: "kerngetallen"; items: Kerngetal[]; bron: string }
  | { type: "tabel"; titel?: string; kolommen: string[]; rijen: string[][]; bron: string }
  | { type: "grafiek"; titel: string; soort: "lijn" | "staaf"; labels: string[]; reeksen: Reeks[]; eenheid?: string; bron: string }
  | { type: "conclusie"; punten: string[] }
  | { type: "afbeelding"; wens: string; url?: string; alt?: string; bijschrift?: string }
) & { opmaak?: Opmaak };

/**
 * Een foto. De assistent kiest de plek en beschrijft wat erop moet (`wens`);
 * de collega uploadt het beeld (`url`, alleen van onze eigen Bunny-CDN, map
 * stukken/). Zonder url is het een lege plek die alleen in het voorbeeld staat.
 */
export interface Afbeelding {
  wens?: string;
  url?: string;
}

export type BlokType = BlokInhoud["type"];
export type Blok = BlokInhoud & { id: string };

export interface StukInhoud {
  soort: StukSoort;
  titel: string;
  ondertitel?: string;
  /** De foto achter de titel (titelslide van een deck, kop van een rapport). */
  titelbeeld?: Afbeelding;
  blokken: Blok[];
}

/** Alleen de inhoud van een stuk: voor versies, de deellink en het model. */
export function inhoudVan(stuk: StukInhoud): StukInhoud {
  return {
    soort: stuk.soort,
    titel: stuk.titel,
    ...(stuk.ondertitel && { ondertitel: stuk.ondertitel }),
    ...(stuk.titelbeeld && { titelbeeld: stuk.titelbeeld }),
    blokken: stuk.blokken,
  };
}

export interface Deellink {
  id: string;
  /** Openbaar: iedereen met de link. Anders alleen ingelogde collega's. */
  publiek: boolean;
  verlooptOp?: string;
  gedeeldOp: string;
  /** De versie die in de link staat (een momentopname). */
  versie: number;
}

export interface Stuk extends StukInhoud {
  /** Gelijk aan het id van het gesprek: één stuk per gesprek. */
  id: string;
  eigenaar: string;
  versie: number;
  /** De dag waarop de cijfers zijn opgehaald (JJJJ-MM-DD, Amsterdam). */
  peildatum: string;
  /** Eerdere versies, nieuwste eerst; om terug te gaan. */
  vorige: (StukInhoud & { versie: number; peildatum: string })[];
  deellink?: Deellink;
  createdAt: string;
  updatedAt: string;
}

export const LIMIETEN = {
  titel: 120,
  ondertitel: 200,
  kop: 120,
  tekst: 4_000,
  bron: 200,
  blokken: 40,
  kernboodschap: 120,
  wens: 200,
  alt: 200,
  url: 500,
  kerngetallen: 6,
  kolommen: 8,
  rijen: 40,
  cel: 200,
  labels: 60,
  reeksen: 4,
  punten: 6,
  punt: 300,
  vorigeVersies: 20,
} as const;

/** Een fout in wat het model aanleverde; de melding gaat terug naar het model. */
export class StukFout extends Error {}

/* ---------- Controle van wat het model aanlevert ---------- */

function object(waarde: unknown, waar: string): Record<string, unknown> {
  if (!waarde || typeof waarde !== "object" || Array.isArray(waarde)) throw new StukFout(`${waar} moet een object zijn.`);
  return waarde as Record<string, unknown>;
}

function tekst(waarde: unknown, waar: string, max: number, verplicht = true): string | undefined {
  if (waarde === undefined || waarde === null || waarde === "") {
    if (verplicht) throw new StukFout(`${waar} ontbreekt.`);
    return undefined;
  }
  if (typeof waarde !== "string" && typeof waarde !== "number") throw new StukFout(`${waar} moet tekst zijn.`);
  const schoon = String(waarde).trim();
  if (verplicht && !schoon) throw new StukFout(`${waar} ontbreekt.`);
  if (schoon.length > max) throw new StukFout(`${waar} is te lang (${schoon.length} tekens, hooguit ${max}).`);
  return schoon || undefined;
}

function lijst(waarde: unknown, waar: string, min: number, max: number): unknown[] {
  if (!Array.isArray(waarde)) throw new StukFout(`${waar} moet een lijst zijn.`);
  if (waarde.length < min) throw new StukFout(`${waar} moet minstens ${min} ${min === 1 ? "item" : "items"} hebben.`);
  if (waarde.length > max) throw new StukFout(`${waar} heeft er ${waarde.length}; hooguit ${max}.`);
  return waarde;
}

const BLOKTYPES: BlokType[] = ["kop", "tekst", "kerngetallen", "tabel", "grafiek", "conclusie", "afbeelding"];

/** Waar geüploade foto's voor stukken staan; alleen die mogen in een stuk. */
export const AFBEELDING_MAP = "stukken";

function cdnBasis(): string | undefined {
  return typeof process !== "undefined" ? process.env.BUNNY_CDN_URL?.replace(/\/+$/, "") : undefined;
}

/**
 * Een foto-adres moet van onze eigen Bunny-CDN komen, uit de map voor
 * stukken. Zo kan niemand (ook het model niet) een beeld van een andere site
 * op een gedeelde link zetten.
 */
export function leesAfbeeldingUrl(waarde: unknown, waar: string): string | undefined {
  const url = tekst(waarde, waar, LIMIETEN.url, false);
  if (!url) return undefined;
  const basis = cdnBasis();
  if (!basis) throw new StukFout(`${waar}: foto's zijn niet ingesteld (BUNNY_CDN_URL ontbreekt).`);
  const prefix = `${basis}/${AFBEELDING_MAP}/`;
  if (!url.startsWith(prefix) || !/^[a-z0-9._-]+$/i.test(url.slice(prefix.length))) {
    throw new StukFout(`${waar}: alleen een foto die in PSV Tools is geüpload kan in een stuk. Laat url leeg; de collega voegt de foto toe.`);
  }
  return url;
}

function leesTitelbeeld(waarde: unknown): Afbeelding | undefined {
  if (waarde === undefined || waarde === null) return undefined;
  const o = object(waarde, "Het titelbeeld");
  const wens = tekst(o.wens, "Het titelbeeld: wens", LIMIETEN.wens, false);
  const url = leesAfbeeldingUrl(o.url, "Het titelbeeld: url");
  return wens || url ? { ...(wens && { wens }), ...(url && { url }) } : undefined;
}

/** De namen waarop `nadruk` kan wijzen, per bloktype; leeg = geen nadruk mogelijk. */
export function nadrukKeuzes(blok: BlokInhoud): string[] {
  switch (blok.type) {
    case "grafiek":
      return blok.reeksen.map((r) => r.naam);
    case "tabel":
      return blok.rijen.map((r) => r[0]).filter(Boolean);
    case "kerngetallen":
      return blok.items.map((k) => k.label);
    default:
      return [];
  }
}

function keuze<T extends string>(waarde: unknown, opties: T[], waar: string): T | undefined {
  if (waarde === undefined || waarde === null || waarde === "") return undefined;
  if (typeof waarde === "string" && (opties as string[]).includes(waarde)) return waarde as T;
  throw new StukFout(`${waar} moet ${opties.map((o) => `"${o}"`).join(", ")} zijn.`);
}

/**
 * Controleert de opmaak van een blok. `streng`: een nadruk die niet bestaat
 * is een fout (wat het model of de collega aanlevert); anders valt hij weg
 * (opmaak die bleef staan terwijl de inhoud veranderde).
 */
export function leesOpmaak(raw: unknown, blok: BlokInhoud, waar = "Opmaak", streng = true): Opmaak | undefined {
  if (raw === undefined || raw === null) return undefined;
  const o = object(raw, waar);
  const grootte = keuze(o.grootte, GROOTTES, `${waar}: grootte`);
  const achtergrond = keuze(o.achtergrond, ACHTERGRONDEN, `${waar}: achtergrond`);
  const kernboodschap = tekst(o.kernboodschap, `${waar}: kernboodschap`, LIMIETEN.kernboodschap, false);
  let nadruk = tekst(o.nadruk, `${waar}: nadruk`, LIMIETEN.cel, false);
  if (nadruk) {
    const keuzes = nadrukKeuzes(blok);
    if (!keuzes.includes(nadruk)) {
      if (streng) {
        throw new StukFout(
          keuzes.length
            ? `${waar}: nadruk "${nadruk}" bestaat niet in dit blok. Kies uit: ${keuzes.join(", ")}.`
            : `${waar}: een ${blok.type}-blok heeft geen nadruk.`
        );
      }
      nadruk = undefined;
    }
  }
  const opmaak: Opmaak = {
    ...(grootte && { grootte }),
    ...(achtergrond && { achtergrond }),
    ...(nadruk && { nadruk }),
    ...(kernboodschap && { kernboodschap }),
  };
  return Object.keys(opmaak).length ? opmaak : undefined;
}

/** Controleert één blok zoals het model het aanlevert, en maakt het schoon. */
export function leesBlok(raw: unknown, waar = "Blok"): BlokInhoud {
  const inhoud = leesInhoud(raw, waar);
  const opmaak = leesOpmaak((raw as Record<string, unknown>).opmaak, inhoud, `${waar}: opmaak`);
  return opmaak ? { ...inhoud, opmaak } : inhoud;
}

function leesInhoud(raw: unknown, waar: string): BlokInhoud {
  const b = object(raw, waar);
  const type = b.type as BlokType;
  if (!BLOKTYPES.includes(type)) throw new StukFout(`${waar}: onbekend type "${String(b.type)}". Kies uit ${BLOKTYPES.join(", ")}.`);
  const bron = () => tekst(b.bron, `${waar} (${type}): bron`, LIMIETEN.bron)!;

  switch (type) {
    case "kop":
      return { type, tekst: tekst(b.tekst, `${waar} (kop): tekst`, LIMIETEN.kop)! };
    case "tekst":
      return { type, tekst: tekst(b.tekst, `${waar} (tekst): tekst`, LIMIETEN.tekst)! };
    case "kerngetallen":
      return {
        type,
        items: lijst(b.items, `${waar} (kerngetallen): items`, 1, LIMIETEN.kerngetallen).map((item, i) => {
          const k = object(item, `${waar} kerngetal ${i + 1}`);
          const toelichting = tekst(k.toelichting, `${waar} kerngetal ${i + 1}: toelichting`, 120, false);
          return {
            label: tekst(k.label, `${waar} kerngetal ${i + 1}: label`, 60)!,
            waarde: tekst(k.waarde, `${waar} kerngetal ${i + 1}: waarde`, 30)!,
            ...(toelichting && { toelichting }),
          };
        }),
        bron: bron(),
      };
    case "tabel": {
      const kolommen = lijst(b.kolommen, `${waar} (tabel): kolommen`, 1, LIMIETEN.kolommen).map(
        (k, i) => tekst(k, `${waar} kolom ${i + 1}`, 60)!
      );
      const rijen = lijst(b.rijen, `${waar} (tabel): rijen`, 1, LIMIETEN.rijen).map((rij, r) => {
        const cellen = lijst(rij, `${waar} rij ${r + 1}`, kolommen.length, kolommen.length);
        return cellen.map((c, i) => tekst(c ?? "", `${waar} rij ${r + 1}, cel ${i + 1}`, LIMIETEN.cel, false) ?? "");
      });
      const titel = tekst(b.titel, `${waar} (tabel): titel`, LIMIETEN.kop, false);
      return { type, ...(titel && { titel }), kolommen, rijen, bron: bron() };
    }
    case "grafiek": {
      const soort = b.soort === "staaf" ? "staaf" : b.soort === "lijn" ? "lijn" : null;
      if (!soort) throw new StukFout(`${waar} (grafiek): soort moet "lijn" of "staaf" zijn.`);
      const labels = lijst(b.labels, `${waar} (grafiek): labels`, 1, LIMIETEN.labels).map((l, i) => tekst(l, `${waar} label ${i + 1}`, 40)!);
      const reeksen = lijst(b.reeksen, `${waar} (grafiek): reeksen`, 1, LIMIETEN.reeksen).map((raw, i) => {
        const r = object(raw, `${waar} reeks ${i + 1}`);
        const waarden = lijst(r.waarden, `${waar} reeks ${i + 1}: waarden`, labels.length, labels.length).map((w, j) => {
          const getal = typeof w === "number" ? w : Number(w);
          if (!Number.isFinite(getal)) throw new StukFout(`${waar} reeks ${i + 1}, waarde ${j + 1} is geen getal.`);
          return getal;
        });
        return { naam: tekst(r.naam, `${waar} reeks ${i + 1}: naam`, 60)!, waarden };
      });
      const eenheid = tekst(b.eenheid, `${waar} (grafiek): eenheid`, 20, false);
      return { type, titel: tekst(b.titel, `${waar} (grafiek): titel`, LIMIETEN.kop)!, soort, labels, reeksen, ...(eenheid && { eenheid }), bron: bron() };
    }
    case "conclusie":
      return {
        type,
        punten: lijst(b.punten, `${waar} (conclusie): punten`, 1, LIMIETEN.punten).map((p, i) => tekst(p, `${waar} punt ${i + 1}`, LIMIETEN.punt)!),
      };
    case "afbeelding": {
      const url = leesAfbeeldingUrl(b.url, `${waar} (afbeelding): url`);
      const alt = tekst(b.alt, `${waar} (afbeelding): alt`, LIMIETEN.alt, false);
      const bijschrift = tekst(b.bijschrift, `${waar} (afbeelding): bijschrift`, LIMIETEN.punt, false);
      return {
        type,
        wens: tekst(b.wens, `${waar} (afbeelding): wens`, LIMIETEN.wens)!,
        ...(url && { url }),
        ...(alt && { alt }),
        ...(bijschrift && { bijschrift }),
      };
    }
  }
}

function controleerAantal(aantal: number) {
  if (aantal > LIMIETEN.blokken) throw new StukFout(`Een stuk heeft hooguit ${LIMIETEN.blokken} blokken (nu ${aantal}).`);
}

function leesSoort(waarde: unknown): StukSoort {
  if (waarde === "rapport" || waarde === "deck") return waarde;
  // Een one-pager is een kort rapport (zo heette het eerder).
  if (waarde === "onepager") return "rapport";
  throw new StukFout('De soort moet "rapport" of "deck" zijn.');
}

/** Een opgeslagen stuk zoals het nu hoort: oude one-pagers worden een rapport. */
export function normaliseer<T extends { soort: string; vorige?: { soort: string }[] }>(stuk: T): T {
  const soort = (s: string) => (s === "deck" ? "deck" : "rapport");
  return {
    ...stuk,
    soort: soort(stuk.soort),
    ...(stuk.vorige && { vorige: stuk.vorige.map((v) => ({ ...v, soort: soort(v.soort) })) }),
  };
}

/** Het volgende vrije blok-id: b1, b2, …, uniek binnen het stuk. */
function volgendId(blokken: Blok[], gebruikt: Set<string>): string {
  let n = blokken.length + 1;
  while (gebruikt.has(`b${n}`)) n += 1;
  gebruikt.add(`b${n}`);
  return `b${n}`;
}

/** Een nieuw stuk, of de inhoud van een bestaand stuk vervangen. */
export function nieuweInhoud(invoer: unknown): StukInhoud {
  const raw = object(invoer, "Het stuk");
  const soort = leesSoort(raw.soort);
  const blokkenRaw = lijst(raw.blokken, "blokken", 1, LIMIETEN.blokken);
  controleerAantal(blokkenRaw.length);
  const ondertitel = tekst(raw.ondertitel, "De ondertitel", LIMIETEN.ondertitel, false);
  const blokken = blokkenRaw.map((b, i) => ({ ...leesBlok(b, `Blok ${i + 1}`), id: `b${i + 1}` }));
  const titelbeeld = leesTitelbeeld(raw.titelbeeld);
  return { soort, titel: tekst(raw.titel, "De titel", LIMIETEN.titel)!, ...(ondertitel && { ondertitel }), ...(titelbeeld && { titelbeeld }), blokken };
}

export type Actie =
  | { actie: "toevoegen"; blok: unknown; na?: string }
  | { actie: "wijzigen"; blok_id: string; blok: unknown }
  | { actie: "verwijderen"; blok_id: string }
  | { actie: "verplaatsen"; blok_id: string; na: string }
  | { actie: "opmaken"; blok_id: string; opmaak: Partial<Record<keyof Opmaak, string | null>> };

/**
 * Past bewerkingen toe op de inhoud, allemaal of geen: klopt er één niet,
 * dan verandert er niets. `na` is een blok-id of "begin".
 */
export function pasToe(inhoud: StukInhoud, invoer: unknown): StukInhoud {
  const raw = object(invoer, "De bewerking");
  let blokken = [...inhoud.blokken];
  const gebruikt = new Set(blokken.map((b) => b.id));
  const plek = (na: unknown, waar: string): number => {
    if (na === undefined || na === null || na === "einde") return blokken.length;
    if (na === "begin") return 0;
    const i = blokken.findIndex((b) => b.id === na);
    if (i === -1) throw new StukFout(`${waar}: blok "${String(na)}" bestaat niet.`);
    return i + 1;
  };
  const index = (id: unknown, waar: string): number => {
    const i = blokken.findIndex((b) => b.id === id);
    if (i === -1) throw new StukFout(`${waar}: blok "${String(id)}" bestaat niet. Bestaande blokken: ${blokken.map((b) => b.id).join(", ") || "geen"}.`);
    return i;
  };

  const acties = raw.acties === undefined ? [] : lijst(raw.acties, "acties", 0, 40);
  acties.forEach((a, n) => {
    const actie = object(a, `Actie ${n + 1}`);
    const waar = `Actie ${n + 1} (${String(actie.actie)})`;
    switch (actie.actie) {
      case "toevoegen": {
        const blok = { ...leesBlok(actie.blok, waar), id: volgendId(blokken, gebruikt) };
        blokken.splice(plek(actie.na, waar), 0, blok);
        break;
      }
      case "wijzigen": {
        const i = index(actie.blok_id, waar);
        const nieuw: Blok = { ...leesBlok(actie.blok, waar), id: blokken[i].id };
        // Zonder opmaak in het nieuwe blok blijft de vorige opmaak staan, voor zover die nog past.
        const rawBlok = actie.blok as Record<string, unknown>;
        if (rawBlok.opmaak === undefined && blokken[i].opmaak) {
          const behouden = leesOpmaak(blokken[i].opmaak, nieuw, waar, false);
          if (behouden) nieuw.opmaak = behouden;
        }
        blokken[i] = nieuw;
        break;
      }
      case "opmaken": {
        const i = index(actie.blok_id, waar);
        const wijziging = object(actie.opmaak, `${waar}: opmaak`);
        const samen: Record<string, unknown> = { ...blokken[i].opmaak };
        for (const [sleutel, waarde] of Object.entries(wijziging)) {
          if (waarde === null || waarde === "") delete samen[sleutel];
          else samen[sleutel] = waarde;
        }
        const { opmaak: _oud, ...zonder } = blokken[i];
        void _oud;
        const opmaak = leesOpmaak(samen, blokken[i], `${waar}: opmaak`);
        blokken[i] = opmaak ? { ...zonder, opmaak } : (zonder as Blok);
        break;
      }
      case "verwijderen":
        blokken.splice(index(actie.blok_id, waar), 1);
        break;
      case "verplaatsen": {
        const [blok] = blokken.splice(index(actie.blok_id, waar), 1);
        blokken.splice(plek(actie.na, waar), 0, blok);
        break;
      }
      default:
        throw new StukFout(`${waar}: kies toevoegen, wijzigen, opmaken, verwijderen of verplaatsen.`);
    }
  });

  const soort = raw.soort === undefined ? inhoud.soort : leesSoort(raw.soort);
  if (blokken.length === 0) throw new StukFout("Een stuk heeft minstens één blok.");
  controleerAantal(blokken.length);
  const titel = raw.titel === undefined ? inhoud.titel : tekst(raw.titel, "De titel", LIMIETEN.titel)!;
  const ondertitel =
    raw.ondertitel === undefined ? inhoud.ondertitel : tekst(raw.ondertitel, "De ondertitel", LIMIETEN.ondertitel, false);
  // Titelbeeld: weglaten laat het staan, null haalt het weg.
  const titelbeeld = raw.titelbeeld === undefined ? inhoud.titelbeeld : leesTitelbeeld(raw.titelbeeld);
  blokken = blokken.map((b) => ({ ...b }));
  return { soort, titel, ...(ondertitel && { ondertitel }), ...(titelbeeld && { titelbeeld }), blokken };
}

/** Een nieuwe versie: de huidige gaat naar `vorige`. */
export function nieuweVersie(stuk: Stuk, inhoud: StukInhoud, peildatum: string, nu: string): Stuk {
  const huidig = { ...inhoudVan(stuk), versie: stuk.versie, peildatum: stuk.peildatum };
  const { ondertitel: _o, titelbeeld: _t, ...rest } = stuk;
  void _o;
  void _t;
  return {
    ...rest,
    ...inhoudVan(inhoud),
    versie: stuk.versie + 1,
    peildatum,
    vorige: [huidig, ...stuk.vorige].slice(0, LIMIETEN.vorigeVersies),
    updatedAt: nu,
  };
}

/**
 * Terug naar de vorige versie, zoals ongedaan maken: de huidige versie
 * vervalt, dus nog een keer terug gaat nog een stap verder. Het
 * versienummer loopt wel door, zodat een deellink ziet dat er iets veranderde.
 */
export function vorigeVersie(stuk: Stuk, nu: string): Stuk {
  const [vorige, ...rest] = stuk.vorige;
  if (!vorige) throw new StukFout("Er is geen vorige versie.");
  const inhoud = inhoudVan(vorige);
  return { ...nieuweVersie(stuk, inhoud, vorige.peildatum, nu), vorige: rest };
}

/** De bronnen onderaan het stuk: uniek, in volgorde van de blokken. */
export function bronnenVan(stuk: Pick<StukInhoud, "blokken">): string[] {
  const bronnen = stuk.blokken.flatMap((b) => ("bron" in b ? [b.bron] : []));
  return [...new Set(bronnen)];
}

/** Een korte samenvatting voor het model: welke blokken met welk id. */
export function samenvatting(stuk: Stuk): string {
  const blokken = stuk.blokken.map((b) => {
    const kern =
      b.type === "kop" || b.type === "tekst"
        ? b.tekst.slice(0, 60)
        : b.type === "grafiek" || b.type === "tabel"
          ? b.titel ?? ""
          : b.type === "kerngetallen"
            ? b.items.map((k) => k.label).join(", ")
            : b.type === "afbeelding"
              ? `${b.wens} (${b.url ? "foto toegevoegd" : "wacht op een foto van de collega"})`
              : `${b.punten.length} punten`;
    const opmaak = b.opmaak
      ? ` [${[b.opmaak.grootte, b.opmaak.achtergrond, b.opmaak.nadruk && `nadruk: ${b.opmaak.nadruk}`, b.opmaak.kernboodschap && `kernboodschap: ${b.opmaak.kernboodschap}`].filter(Boolean).join(", ")}]`
      : "";
    return `${b.id} ${b.type}${kern ? `: ${kern}` : ""}${opmaak}`;
  });
  return `${STUK_SOORT_LABEL[stuk.soort]} "${stuk.titel}", versie ${stuk.versie}, ${stuk.blokken.length} blokken:\n${blokken.join("\n")}`;
}

/* ---------- Bewerken in het voorbeeld ---------- */

/** Het stuk is intussen gewijzigd (bijvoorbeeld door de assistent); `stuk` is de nieuwste versie. */
export class StukConflict extends Error {
  readonly stuk: Stuk;
  constructor(stuk: Stuk) {
    super("Het stuk is intussen gewijzigd, bijvoorbeeld door de assistent. Je ziet nu de nieuwste versie.");
    this.stuk = stuk;
  }
}

/**
 * Een wijziging van de collega zelf, in het voorbeeld. Dezelfde bewerkingen en
 * regels als de assistent (`pasToe`), op de versie die de collega voor zich had:
 * is het stuk intussen veranderd, dan een conflict in plaats van eroverheen
 * schrijven. De peildatum blijft staan: die gaat over het ophalen van de cijfers.
 */
export function handmatigBewerken(stuk: Stuk, invoer: unknown, nu: string): Stuk {
  const raw = (invoer && typeof invoer === "object" ? invoer : {}) as Record<string, unknown>;
  if (raw.basisVersie !== stuk.versie) throw new StukConflict(stuk);
  const bewerking: Record<string, unknown> = {};
  for (const sleutel of ["acties", "titel", "ondertitel", "soort", "titelbeeld"]) {
    if (raw[sleutel] !== undefined) bewerking[sleutel] = raw[sleutel];
  }
  return nieuweVersie(stuk, pasToe(stuk, bewerking), stuk.peildatum, nu);
}

/* ---------- Slides (deck) ---------- */

export interface Slide {
  /** De laatste kop ervoor: het hoofdstuk, klein boven de titel. */
  sectie?: string;
  /** De kernboodschap, of de titel van het blok, of een standaard per type. */
  titel?: string;
  /** Eén blok, of twee halve naast elkaar. */
  blokken: Blok[];
  achtergrond: Achtergrond;
  groot: boolean;
}

function standaardTitel(blok: Blok): string | undefined {
  switch (blok.type) {
    case "grafiek":
      return blok.titel;
    case "tabel":
      return blok.titel;
    case "kerngetallen":
      return "In cijfers";
    case "conclusie":
      return "Conclusie";
    default:
      return undefined;
  }
}

/** Een afbeelding zonder foto: alleen een lege plek in het voorbeeld, niet op een deellink of afdruk. */
export function isLegeAfbeelding(blok: Blok): boolean {
  return blok.type === "afbeelding" && !blok.url;
}

/**
 * Hoe de blokken op slides komen. Een kop wordt geen slide, maar het
 * hoofdstuk boven de slides erna. Elk ander blok krijgt een eigen slide,
 * behalve twee halve blokken na elkaar: die delen er een. De titelslide en de
 * bronnen voegt de weergave toe.
 */
export function slidesVan(stuk: Pick<StukInhoud, "blokken">): Slide[] {
  const slides: Slide[] = [];
  let sectie: string | undefined;
  const blokken = stuk.blokken;
  for (let i = 0; i < blokken.length; i++) {
    const blok = blokken[i];
    if (blok.type === "kop") {
      sectie = blok.opmaak?.kernboodschap ?? blok.tekst;
      continue;
    }
    const volgende = blokken[i + 1];
    const samen = blok.opmaak?.grootte === "half" && volgende && volgende.type !== "kop" && volgende.opmaak?.grootte === "half";
    const opSlide = samen ? [blok, volgende] : [blok];
    if (samen) i += 1;
    const achtergrond = blok.opmaak?.achtergrond ?? (blok.type === "conclusie" ? "rood" : "wit");
    slides.push({
      ...(sectie && { sectie }),
      titel: blok.opmaak?.kernboodschap ?? (samen ? undefined : standaardTitel(blok)),
      blokken: opSlide,
      achtergrond,
      groot: blok.opmaak?.grootte === "groot",
    });
  }
  return slides;
}
