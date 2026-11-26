/**
 * Van handmatige cijfers en de dagelijkse telling naar wat de pagina toont:
 * een waarde per maand, de reeks Active Fans, en per doel het niveau, het tempo
 * en wat er nodig is. Puur: geen opslag, geen klok behalve `vandaag`.
 */

import { niveauVan, type SeizoenDoelen } from "./doelen";
import type { Handmatig } from "./handmatig";
import { zonderLegeMijnpsv } from "./herstel";
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

export interface GroeiInterval {
  van: string;
  tot: string;
  dagen: number;
  groei: number;
  perDag: number;
  bron: Bron;
}

/**
 * De prognose met verzadiging. Unieke fans groeien steeds langzamer: wie al
 * meetelt, telt niet opnieuw. Het model neemt aan dat de groei per dag
 * exponentieel afneemt, `g(t) = g0 · e^(−λt)`, en schat λ uit de groei per
 * periode van de afgelopen weken (gewogen naar de lengte van elke periode).
 * Het totaal op dag d na de laatste peiling is dan
 * `N + g0/λ · (1 − e^(−λd))`. Neemt de groei niet af (λ ≤ 0), dan wordt het
 * een rechte lijn.
 */
export interface PrognoseModel {
  methode: "verzadiging" | "lineair";
  /** Groei per dag op de laatste peiling, volgens het model. */
  tempoNu: number;
  /** Hoeveel de groei per dag in 30 dagen afneemt, als fractie (0,22 = 22%). */
  afnamePerMaand: number;
  /** Het totaal waar de groei naartoe gaat als die zo blijft afnemen; `null` bij een rechte lijn. */
  plafond: number | null;
  /** Op welke perioden het model rust. */
  intervallen: GroeiInterval[];
  /** De verwachte stand per week tot het einde van het seizoen. */
  lijn: { datum: string; waarde: number }[];
}

export interface ActiveStand {
  laatste: ActivePunt;
  niveau: number;
  /** Groei per dag in de laatste periode van minstens twee weken. */
  tempo: { van: string; dagen: number; groei: number; perDag: number } | null;
  dagenResterend: number;
  /** De verwachte stand op het einde van het seizoen, op honderdtallen. */
  prognose: number | null;
  niveauPrognose: number | null;
  model: PrognoseModel | null;
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

/** Perioden voor de groei per dag zijn minstens zo lang, zodat dagelijkse ruis wegvalt. */
const MIN_INTERVAL_DAGEN = 14;
/** Het model kijkt naar de laatste zoveel perioden, zo'n drie maanden. */
const MAX_INTERVALLEN = 6;
/** Kleiner dan dit telt niet als afname (minder dan 0,3% per maand). */
const MIN_LAMBDA = 1e-4;
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

/**
 * Alle peilingen zonder ontdubbeling op datum: de handmatige van 26 november
 * blijft naast de automatische van die dag staan, zodat de handmatige reeks
 * zijn laatste periode houdt.
 */
export function alleReeksen(handmatig: Handmatig, dagen: DagStand[]): ActivePunt[] {
  const auto = activePunten({ engaged: [], active: [] }, dagen);
  return [...handmatig.active.map((p) => ({ ...p, bron: "handmatig" as const })), ...auto];
}

/** Handmatige peilingen, plus per maand de laatste automatische stand. */
export function tabelPunten(punten: ActivePunt[]): ActivePunt[] {
  const laatstePerMaand = new Map<string, ActivePunt>();
  for (const p of punten) if (p.bron === "automatisch") laatstePerMaand.set(maandVan(p.datum), p);
  const auto = new Set(laatstePerMaand.values());
  return punten.filter((p) => p.bron === "handmatig" || auto.has(p));
}

/**
 * Groei per periode, binnen één bron: handmatige en automatische tellingen
 * kunnen een paar procent verschillen, en een sprong op de overgang is geen
 * groei. Per bron worden de peilingen van achter naar voren gekozen, steeds
 * minstens twee weken uit elkaar, zodat dagelijkse ruis wegvalt.
 */
export function groeiIntervallen(punten: ActivePunt[]): GroeiInterval[] {
  const uit: GroeiInterval[] = [];
  for (const bron of ["handmatig", "automatisch"] as Bron[]) {
    const reeks = punten.filter((p) => p.bron === bron).sort((a, b) => (a.datum < b.datum ? -1 : 1));
    const gekozen: ActivePunt[] = [];
    for (let i = reeks.length - 1; i >= 0; i--) {
      const vorige = gekozen.at(-1);
      if (!vorige || dagenTussen(reeks[i].datum, vorige.datum) >= MIN_INTERVAL_DAGEN) gekozen.push(reeks[i]);
    }
    gekozen.reverse();
    for (let i = 1; i < gekozen.length; i++) {
      const a = gekozen[i - 1];
      const b = gekozen[i];
      const dagen = dagenTussen(a.datum, b.datum);
      uit.push({ van: a.datum, tot: b.datum, dagen, groei: b.totaal - a.totaal, perDag: (b.totaal - a.totaal) / dagen, bron });
    }
  }
  return uit.sort((a, b) => (a.tot < b.tot ? -1 : a.tot > b.tot ? 1 : a.bron === "automatisch" ? 1 : -1));
}

/** Zie `PrognoseModel`. `null` als er geen periode met groei is. */
export function prognoseModel(intervallen: GroeiInterval[], laatste: ActivePunt, eind: string): PrognoseModel | null {
  const bruikbaar = intervallen.filter((i) => i.perDag > 0).slice(-MAX_INTERVALLEN);
  if (!bruikbaar.length) return null;

  // ln(groei per dag) tegen het midden van elke periode, in dagen vanaf de laatste peiling.
  const punten = bruikbaar.map((i) => ({
    x: (dagenTussen(laatste.datum, i.van) + dagenTussen(laatste.datum, i.tot)) / 2,
    y: Math.log(i.perDag),
    w: i.dagen,
  }));
  let lambda = 0;
  let tempoNu = bruikbaar.at(-1)!.perDag;
  if (punten.length >= 2) {
    const sw = punten.reduce((s, p) => s + p.w, 0);
    const mx = punten.reduce((s, p) => s + p.w * p.x, 0) / sw;
    const my = punten.reduce((s, p) => s + p.w * p.y, 0) / sw;
    const sxx = punten.reduce((s, p) => s + p.w * (p.x - mx) ** 2, 0);
    const sxy = punten.reduce((s, p) => s + p.w * (p.x - mx) * (p.y - my), 0);
    const helling = sxx > 0 ? sxy / sxx : 0;
    if (-helling > MIN_LAMBDA) {
      lambda = -helling;
      tempoNu = Math.exp(my - helling * mx);
    }
  }

  const waarde = (d: number) => (lambda > 0 ? laatste.totaal + (tempoNu / lambda) * (1 - Math.exp(-lambda * d)) : laatste.totaal + tempoNu * d);
  const rest = Math.max(0, dagenTussen(laatste.datum, eind));
  const lijn: PrognoseModel["lijn"] = [];
  for (let d = 0; d < rest; d += 7) lijn.push({ datum: plusDagen(laatste.datum, d), waarde: waarde(d) });
  lijn.push({ datum: plusDagen(laatste.datum, rest), waarde: waarde(rest) });

  return {
    methode: lambda > 0 ? "verzadiging" : "lineair",
    tempoNu,
    afnamePerMaand: lambda > 0 ? 1 - Math.exp(-30 * lambda) : 0,
    plafond: lambda > 0 ? laatste.totaal + tempoNu / lambda : null,
    intervallen: bruikbaar,
    lijn,
  };
}

/**
 * @param reeksen Alle peilingen, ook een handmatige op een dag met een
 *   automatische: voor de groei per bron. Standaard `punten`.
 */
export function activeStand(seizoen: SeizoenDoelen, punten: ActivePunt[], reeksen: ActivePunt[] = punten): ActiveStand | null {
  const laatste = punten.at(-1);
  if (!laatste) return null;
  const intervallen = groeiIntervallen(reeksen);
  const recent = intervallen.at(-1);
  const tempo: ActiveStand["tempo"] = recent ? { van: recent.van, dagen: recent.dagen, groei: recent.groei, perDag: recent.perDag } : null;

  const dagenResterend = Math.max(0, dagenTussen(laatste.datum, seizoen.eind));
  // Een uniek totaal kan niet dalen; zonder periode met groei is er geen prognose.
  const model = prognoseModel(intervallen, laatste, seizoen.eind);
  const prognoseRuw = model ? model.lijn.at(-1)!.waarde : null;
  const prognose = prognoseRuw == null ? null : Math.round(prognoseRuw / 100) * 100;

  return {
    laatste,
    niveau: niveauVan(seizoen.active, laatste.totaal),
    tempo,
    dagenResterend,
    prognose,
    niveauPrognose: prognoseRuw == null ? null : niveauVan(seizoen.active, prognoseRuw),
    model,
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
  const dagen = (historie?.dagen ?? []).map(zonderLegeMijnpsv).sort((a, b) => (a.datum < b.datum ? -1 : 1));
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
    active: activeStand(seizoen, punten, alleReeksen(handmatig, dagen)),
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
