/**
 * Van handmatige cijfers en de dagelijkse telling naar wat de pagina toont:
 * een waarde per maand, de reeks Active Fans, en per doel het niveau, het tempo
 * en wat er nodig is. Puur: geen opslag, geen klok behalve `vandaag`.
 */

import { niveauVan, type SeizoenDoelen } from "./doelen";
import type { Handmatig } from "./handmatig";
import { dagenTussen, laatsteDag, maandenTussen, maandVan, plusDagen } from "./tijd";
import type { DagStand, Historie } from "./types";

export type MaandStatus = "volledig" | "lopend" | "onvolledig";
export type Bron = "handmatig" | "automatisch";

export interface MaandWaarde {
  maand: string;
  /** Ontdubbeld totaal; `null` als alleen Maileon er is. */
  totaal: number | null;
  maileon: number | null;
  mijnpsv: number | null;
  overlap: number | null;
  bron: Bron;
  /**
   * - `volledig`: de hele maand is geteld, telt mee in het gemiddelde.
   * - `lopend`: de maand loopt nog.
   * - `onvolledig`: de maand is voorbij maar niet helemaal geteld.
   */
  status: MaandStatus;
  /** Tot en met welke dag geteld is, als dat niet de hele maand is. */
  tm: string | null;
  /** Wat Tools zelf in Maileon telt, ook in een handmatige maand: om naast de Maileon-filters te leggen. */
  maileonTools?: number | null;
}

export interface ActivePunt {
  datum: string;
  maileon: number;
  mijnpsv: number;
  overlap: number;
  totaal: number;
  bron: Bron;
}

export interface EngagedStand {
  /** Gemiddelde over de volle maanden, onafgerond. */
  gemiddelde: number;
  maanden: number;
  eerste: string;
  laatste: string;
  niveau: number;
  /** Hoeveel het gemiddelde boven de ondergrens van het eigen niveau ligt. */
  boven: number | null;
  volgende: number | null;
  /** Hoeveel het gemiddelde nog omhoog moet voor het volgende niveau. */
  tekort: number | null;
  /** Met de lopende maand erbij, als die er is. */
  inclLopend: { gemiddelde: number; niveau: number; maand: string; tm: string | null } | null;
}

export interface ActiveStand {
  laatste: ActivePunt;
  niveau: number;
  /** Groei per dag over de laatste vier weken, of tussen de laatste twee peilingen. */
  tempo: { van: string; dagen: number; groei: number; perDag: number } | null;
  dagenResterend: number;
  /** Het tempo doorgetrokken tot het einde van het seizoen, op honderdtallen. */
  prognose: number | null;
  niveauPrognose: number | null;
  nodig: { niveau: number; aantal: number; perDag: number | null }[];
}

export interface Overzicht {
  seizoen: SeizoenDoelen;
  vandaag: string;
  /** De laatste dag waarover cijfers zijn. */
  peildatum: string | null;
  maanden: MaandWaarde[];
  engaged: EngagedStand | null;
  punten: ActivePunt[];
  /** Voor de tabel: de handmatige peilingen en per maand de laatste automatische. */
  tabel: ActivePunt[];
  active: ActiveStand | null;
  automatisch: {
    maileonTot: string | null;
    /** Fans met een klik in Maileon sinds 1 juli, volgens de laatste telling. */
    maileonSeizoen: number | null;
    /** BlueConic is ingesteld (client ID en secret). */
    mijnpsvGekoppeld: boolean;
    /** De laatste dag waarop BlueConic gelezen is. */
    mijnpsvLaatste: string | null;
    bijgewerkt: string | null;
    laatsteDag: DagStand | null;
  };
}

const TEMPO_DAGEN = 28;
const NODIG_NIVEAUS = [3, 5];

function gemiddelde(waarden: number[]): number {
  return waarden.reduce((s, w) => s + w, 0) / waarden.length;
}

export function maandWaarden(seizoen: SeizoenDoelen, handmatig: Handmatig, dagen: DagStand[], vandaag: string): MaandWaarde[] {
  const huidig = maandVan(vandaag);
  const tot = vandaag < seizoen.eind ? vandaag : seizoen.eind;
  const uit: MaandWaarde[] = [];
  for (const maand of maandenTussen(seizoen.start, tot)) {
    const vanMaand = dagen.filter((d) => d.engaged.maand === maand);
    // De laatste stand met beide bronnen; een dag zonder MijnPSV wist die niet uit.
    const auto = vanMaand.filter((d) => d.engaged.totaal != null).at(-1);
    const alleenMaileon = vanMaand.at(-1);
    const hand = handmatig.engaged.find((m) => m.maand === maand);
    const isHuidig = maand === huidig;

    if (auto) {
      const vol = !isHuidig && auto.datum >= laatsteDag(maand);
      uit.push({
        maand,
        totaal: auto.engaged.totaal,
        maileon: auto.engaged.maileon,
        mijnpsv: auto.engaged.mijnpsv,
        overlap: auto.engaged.overlap,
        bron: "automatisch",
        status: isHuidig ? "lopend" : vol ? "volledig" : "onvolledig",
        tm: vol ? null : auto.datum,
      });
    } else if (hand) {
      uit.push({
        maand,
        totaal: hand.totaal,
        maileon: null,
        mijnpsv: null,
        overlap: null,
        bron: "handmatig",
        status: !hand.tm ? "volledig" : isHuidig ? "lopend" : "onvolledig",
        tm: hand.tm ?? null,
      });
    } else if (alleenMaileon) {
      uit.push({
        maand,
        totaal: null,
        maileon: alleenMaileon.engaged.maileon,
        mijnpsv: null,
        overlap: null,
        bron: "automatisch",
        status: isHuidig ? "lopend" : "onvolledig",
        tm: alleenMaileon.datum,
      });
    }
  }
  return uit;
}

export function engagedStand(seizoen: SeizoenDoelen, maanden: MaandWaarde[]): EngagedStand | null {
  const volle = maanden.filter((m) => m.status === "volledig" && m.totaal != null);
  if (!volle.length) return null;
  const gem = gemiddelde(volle.map((m) => m.totaal as number));
  const niveau = niveauVan(seizoen.engaged, gem);
  const eigen = seizoen.engaged.find((n) => n.niveau === niveau);
  const volgende = seizoen.engaged.find((n) => n.niveau === niveau + 1);

  const lopend = maanden.find((m) => m.status === "lopend" && m.totaal != null);
  let inclLopend: EngagedStand["inclLopend"] = null;
  if (lopend) {
    const g = gemiddelde([...volle, lopend].map((m) => m.totaal as number));
    inclLopend = { gemiddelde: g, niveau: niveauVan(seizoen.engaged, g), maand: lopend.maand, tm: lopend.tm };
  }

  return {
    gemiddelde: gem,
    maanden: volle.length,
    eerste: volle[0].maand,
    laatste: volle[volle.length - 1].maand,
    niveau,
    boven: eigen?.van != null ? Math.round(gem - eigen.van) : null,
    volgende: volgende?.niveau ?? null,
    tekort: volgende?.van != null ? Math.ceil(volgende.van - gem) : null,
    inclLopend,
  };
}

export function activePunten(handmatig: Handmatig, dagen: DagStand[]): ActivePunt[] {
  const perDatum = new Map<string, ActivePunt>();
  for (const p of handmatig.active) perDatum.set(p.datum, { ...p, bron: "handmatig" });
  for (const d of dagen) {
    const a = d.active;
    if (a.totaal == null || a.mijnpsv == null || a.overlap == null) continue;
    perDatum.set(d.datum, { datum: d.datum, maileon: a.maileon, mijnpsv: a.mijnpsv, overlap: a.overlap, totaal: a.totaal, bron: "automatisch" });
  }
  return [...perDatum.values()].sort((a, b) => (a.datum < b.datum ? -1 : 1));
}

/** Handmatige peilingen, plus per maand de laatste automatische stand. */
export function tabelPunten(punten: ActivePunt[]): ActivePunt[] {
  const laatstePerMaand = new Map<string, ActivePunt>();
  for (const p of punten) if (p.bron === "automatisch") laatstePerMaand.set(maandVan(p.datum), p);
  const auto = new Set(laatstePerMaand.values());
  return punten.filter((p) => p.bron === "handmatig" || auto.has(p));
}

export function activeStand(seizoen: SeizoenDoelen, punten: ActivePunt[]): ActiveStand | null {
  const laatste = punten.at(-1);
  if (!laatste) return null;
  const grens = plusDagen(laatste.datum, -TEMPO_DAGEN);
  const eerder = punten.slice(0, -1);
  const ref = eerder.filter((p) => p.datum <= grens).at(-1) ?? eerder.at(-1);

  let tempo: ActiveStand["tempo"] = null;
  if (ref) {
    const dagen = dagenTussen(ref.datum, laatste.datum);
    const groei = laatste.totaal - ref.totaal;
    if (dagen > 0) tempo = { van: ref.datum, dagen, groei, perDag: groei / dagen };
  }

  const dagenResterend = Math.max(0, dagenTussen(laatste.datum, seizoen.eind));
  const prognoseRuw = tempo ? laatste.totaal + tempo.perDag * dagenResterend : null;
  const prognose = prognoseRuw == null ? null : Math.round(prognoseRuw / 100) * 100;

  return {
    laatste,
    niveau: niveauVan(seizoen.active, laatste.totaal),
    tempo,
    dagenResterend,
    prognose,
    niveauPrognose: prognoseRuw == null ? null : niveauVan(seizoen.active, prognoseRuw),
    nodig: NODIG_NIVEAUS.flatMap((niveau) => {
      const van = seizoen.active.find((n) => n.niveau === niveau)?.van;
      if (van == null) return [];
      const aantal = Math.max(0, van - laatste.totaal);
      return [{ niveau, aantal, perDag: dagenResterend > 0 ? Math.ceil(aantal / dagenResterend) : null }];
    }),
  };
}

export function maakOverzicht(opties: {
  seizoen: SeizoenDoelen;
  handmatig: Handmatig;
  historie: Historie | null;
  vandaag: string;
  mijnpsvGekoppeld: boolean;
}): Overzicht {
  const { seizoen, handmatig, historie, vandaag } = opties;
  const dagen = [...(historie?.dagen ?? [])].sort((a, b) => (a.datum < b.datum ? -1 : 1));
  const maanden = maandWaarden(seizoen, handmatig, dagen, vandaag).map((m) => ({
    ...m,
    maileonTools: historie?.maileonMaanden?.[m.maand] ?? null,
  }));
  const punten = activePunten(handmatig, dagen);
  const laatsteDag = dagen.at(-1) ?? null;

  const kandidaten = [punten.at(-1)?.datum, laatsteDag?.datum, ...maanden.map((m) => m.tm)].filter((d): d is string => Boolean(d));
  const peildatum = kandidaten.length ? kandidaten.sort().at(-1)! : null;

  return {
    seizoen,
    vandaag,
    peildatum,
    maanden,
    engaged: engagedStand(seizoen, maanden),
    punten,
    tabel: tabelPunten(punten),
    active: activeStand(seizoen, punten),
    automatisch: {
      maileonTot: historie?.maileon.tot ?? null,
      maileonSeizoen: laatsteDag?.active.maileon ?? null,
      mijnpsvGekoppeld: opties.mijnpsvGekoppeld,
      mijnpsvLaatste: historie?.mijnpsv.laatste ?? null,
      bijgewerkt: historie?.bijgewerkt ?? null,
      laatsteDag,
    },
  };
}
