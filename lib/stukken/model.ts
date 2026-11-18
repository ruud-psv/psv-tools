/**
 * Stukken: een rapport of one-pager die de assistent maakt op basis van een
 * gesprek. Een stuk bestaat uit vaste blokken (geen vrije HTML), zodat het
 * altijd in de PSV-huisstijl staat, er op een gedeelde link geen code van het
 * model draait, en één blok kan worden aangepast zonder de rest.
 *
 * Puur: de vorm, de controle van wat het model aanlevert, en de bewerkingen.
 * De opslag staat in `lib/stukken/store.ts`, de tools in
 * `lib/assistent/stukken-tools.ts`. Zie `docs/stukken.md`.
 */

export type StukSoort = "rapport" | "onepager";

export const STUK_SOORT_LABEL: Record<StukSoort, string> = {
  rapport: "Rapport",
  onepager: "One-pager",
};

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
export type BlokInhoud =
  | { type: "kop"; tekst: string }
  | { type: "tekst"; tekst: string }
  | { type: "kerngetallen"; items: Kerngetal[]; bron: string }
  | { type: "tabel"; titel?: string; kolommen: string[]; rijen: string[][]; bron: string }
  | { type: "grafiek"; titel: string; soort: "lijn" | "staaf"; labels: string[]; reeksen: Reeks[]; eenheid?: string; bron: string }
  | { type: "conclusie"; punten: string[] };

export type BlokType = BlokInhoud["type"];
export type Blok = BlokInhoud & { id: string };

export interface StukInhoud {
  soort: StukSoort;
  titel: string;
  ondertitel?: string;
  blokken: Blok[];
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
  blokkenRapport: 40,
  blokkenOnepager: 8,
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

const BLOKTYPES: BlokType[] = ["kop", "tekst", "kerngetallen", "tabel", "grafiek", "conclusie"];

/** Controleert één blok zoals het model het aanlevert, en maakt het schoon. */
export function leesBlok(raw: unknown, waar = "Blok"): BlokInhoud {
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
  }
}

function maxBlokken(soort: StukSoort): number {
  return soort === "onepager" ? LIMIETEN.blokkenOnepager : LIMIETEN.blokkenRapport;
}

function controleerAantal(soort: StukSoort, aantal: number) {
  if (aantal > maxBlokken(soort)) {
    throw new StukFout(
      soort === "onepager"
        ? `Een one-pager heeft hooguit ${LIMIETEN.blokkenOnepager} blokken (nu ${aantal}). Houd hem kort, of maak er een rapport van.`
        : `Een rapport heeft hooguit ${LIMIETEN.blokkenRapport} blokken (nu ${aantal}).`
    );
  }
}

function leesSoort(waarde: unknown): StukSoort {
  if (waarde === "rapport" || waarde === "onepager") return waarde;
  throw new StukFout('De soort moet "rapport" of "onepager" zijn.');
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
  const blokkenRaw = lijst(raw.blokken, "blokken", 1, LIMIETEN.blokkenRapport);
  controleerAantal(soort, blokkenRaw.length);
  const ondertitel = tekst(raw.ondertitel, "De ondertitel", LIMIETEN.ondertitel, false);
  const blokken = blokkenRaw.map((b, i) => ({ ...leesBlok(b, `Blok ${i + 1}`), id: `b${i + 1}` }));
  return { soort, titel: tekst(raw.titel, "De titel", LIMIETEN.titel)!, ...(ondertitel && { ondertitel }), blokken };
}

export type Actie =
  | { actie: "toevoegen"; blok: unknown; na?: string }
  | { actie: "wijzigen"; blok_id: string; blok: unknown }
  | { actie: "verwijderen"; blok_id: string }
  | { actie: "verplaatsen"; blok_id: string; na: string };

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
        blokken[i] = { ...leesBlok(actie.blok, waar), id: blokken[i].id };
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
        throw new StukFout(`${waar}: kies toevoegen, wijzigen, verwijderen of verplaatsen.`);
    }
  });

  const soort = raw.soort === undefined ? inhoud.soort : leesSoort(raw.soort);
  if (blokken.length === 0) throw new StukFout("Een stuk heeft minstens één blok.");
  controleerAantal(soort, blokken.length);
  const titel = raw.titel === undefined ? inhoud.titel : tekst(raw.titel, "De titel", LIMIETEN.titel)!;
  const ondertitel =
    raw.ondertitel === undefined ? inhoud.ondertitel : tekst(raw.ondertitel, "De ondertitel", LIMIETEN.ondertitel, false);
  blokken = blokken.map((b) => ({ ...b }));
  return { soort, titel, ...(ondertitel && { ondertitel }), blokken };
}

/** Een nieuwe versie: de huidige gaat naar `vorige`. */
export function nieuweVersie(stuk: Stuk, inhoud: StukInhoud, peildatum: string, nu: string): Stuk {
  const huidig = { soort: stuk.soort, titel: stuk.titel, ondertitel: stuk.ondertitel, blokken: stuk.blokken, versie: stuk.versie, peildatum: stuk.peildatum };
  return {
    ...stuk,
    soort: inhoud.soort,
    titel: inhoud.titel,
    ondertitel: inhoud.ondertitel,
    blokken: inhoud.blokken,
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
  const inhoud: StukInhoud = { soort: vorige.soort, titel: vorige.titel, ondertitel: vorige.ondertitel, blokken: vorige.blokken };
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
            : `${b.punten.length} punten`;
    return `${b.id} ${b.type}${kern ? `: ${kern}` : ""}`;
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
  for (const sleutel of ["acties", "titel", "ondertitel", "soort"]) {
    if (raw[sleutel] !== undefined) bewerking[sleutel] = raw[sleutel];
  }
  return nieuweVersie(stuk, pasToe(stuk, bewerking), stuk.peildatum, nu);
}
