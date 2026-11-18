/**
 * De aanpak voor paid ads zoals afgesproken in de workshop: elke briefing
 * geeft 2 à 3 koopredenen mee, 75-80% van het budget gaat naar bewezen
 * koopredenen en 20-25% naar testen, en een test beoordeel je vanaf € 150.
 *
 * Koopreden en test staan in de naam van de advertentie of de
 * advertentieset; hier worden ze herkend en worden de cijfers per koopreden
 * en per test opgeteld.
 */

import { derive, type DerivedMetrics } from "./derive";
import { emptyMetrics, type PaidAdsAd, type PaidAdsAdSet, type PaidAdsCampaign, type PaidMetrics } from "./types";

export type KoopredenKey =
  | "trots"
  | "matchday"
  | "speler"
  | "verhaal"
  | "samen"
  | "nostalgie"
  | "erbijhoren"
  | "alseerste";

export interface Koopreden {
  key: KoopredenKey;
  label: string;
  /** Waar de koopreden over gaat, zoals op de kaart uit de workshop. */
  uitleg: string;
  /** Woorden in de naam die de koopreden aanwijzen; het label zelf telt ook. */
  trefwoorden: string[];
}

export const KOOPREDENEN: Koopreden[] = [
  { key: "trots", label: "Trots & identiteit", uitleg: "Wie je bent als fan", trefwoorden: ["trots", "identiteit"] },
  { key: "matchday", label: "Matchday", uitleg: "Het stadion, de sfeer", trefwoorden: ["matchday", "wedstrijddag"] },
  { key: "speler", label: "Speler", uitleg: "De held, het rugnummer", trefwoorden: ["speler", "held", "rugnummer"] },
  { key: "verhaal", label: "Het verhaal", uitleg: "Achter de schermen, de details", trefwoorden: ["verhaal", "achter de schermen", "bts"] },
  { key: "samen", label: "Samen", uitleg: "Ouder en kind, vrienden, cadeau", trefwoorden: ["samen", "cadeau", "ouder en kind"] },
  { key: "nostalgie", label: "Nostalgie", uitleg: "Historie, oude successen", trefwoorden: ["nostalgie", "historie", "retro"] },
  { key: "erbijhoren", label: "Erbij horen", uitleg: "Voordelen en voorrang als lid", trefwoorden: ["erbij horen", "erbijhoren", "voorrang"] },
  { key: "alseerste", label: "Als eerste", uitleg: "Voorverkoop, nieuw, exclusief", trefwoorden: ["als eerste", "alseerste", "voorverkoop", "exclusief"] },
];

/** Deel van het budget dat naar testen hoort te gaan, in procenten. */
export const TESTBUDGET = { min: 20, max: 25 };
/** Vanaf dit bedrag is een test te beoordelen. */
export const TEST_DREMPEL = 150;
/** Zo lang leert een nieuwe campagne; tot dan zijn de cijfers nog onrustig. */
export const LEERFASE_DAGEN = 10;
/** De formaten waarin het materiaal geleverd hoort te worden. */
export const FORMATEN = ["4:5", "9:16"];

/** Kleine letters, zonder accenten en leestekens: "Trots & Identiteit" → "trots identiteit". */
function addMetrics(doel: PaidMetrics, bron: PaidMetrics): void {
  doel.spend += bron.spend;
  doel.impressions += bron.impressions;
  doel.reach += bron.reach;
  doel.clicks += bron.clicks;
  doel.results += bron.results;
  doel.revenue += bron.revenue;
}

function normaliseer(tekst: string): string {
  return ` ${tekst
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

function bevat(naam: string, woord: string): boolean {
  return naam.includes(` ${normaliseer(woord).trim()} `);
}

/**
 * De koopreden in een naam: eerst het volledige label, dan de trefwoorden.
 * `null` als er geen in staat.
 */
export function koopredenIn(naam: string): KoopredenKey | null {
  const n = normaliseer(naam);
  for (const k of KOOPREDENEN) if (bevat(n, k.label.replace("&", " "))) return k.key;
  for (const k of KOOPREDENEN) if (k.trefwoorden.some((w) => bevat(n, w))) return k.key;
  return null;
}

/** De koopreden van een advertentie: uit haar eigen naam, anders uit die van de set. */
export function koopredenVan(ad: PaidAdsAd, adSet: PaidAdsAdSet | undefined): KoopredenKey | null {
  return koopredenIn(ad.name) ?? (adSet ? koopredenIn(adSet.name) : null);
}

/** Een test heeft "test" als los woord in de naam van advertentie, set of campagne. */
export function isTest(...namen: (string | undefined)[]): boolean {
  return namen.some((naam) => naam != null && bevat(normaliseer(naam), "test"));
}

export interface KoopredenRij {
  key: KoopredenKey | "onbekend";
  label: string;
  uitleg: string;
  advertenties: number;
  metrics: PaidMetrics;
  derived: DerivedMetrics;
}

/**
 * Cijfers per koopreden over de advertenties. Advertenties zonder herkende
 * koopreden komen onder "Onbekend", zodat zichtbaar is hoeveel budget nog
 * niet volgens de aanpak benoemd is.
 */
export function perKoopreden(ads: PaidAdsAd[], adSets: PaidAdsAdSet[]): KoopredenRij[] {
  const sets = new Map(adSets.map((s) => [`${s.platform}:${s.id}`, s]));
  const rijen = new Map<KoopredenKey | "onbekend", { advertenties: number; metrics: PaidMetrics }>();
  for (const ad of ads) {
    const key = koopredenVan(ad, sets.get(`${ad.platform}:${ad.adSetId}`)) ?? "onbekend";
    const rij = rijen.get(key) ?? { advertenties: 0, metrics: emptyMetrics() };
    rij.advertenties += 1;
    addMetrics(rij.metrics, ad.metrics);
    rijen.set(key, rij);
  }
  const uit = [...rijen.entries()].map(([key, rij]) => {
    const k = KOOPREDENEN.find((x) => x.key === key);
    return {
      key,
      label: k?.label ?? "Onbekend",
      uitleg: k?.uitleg ?? "Geen koopreden in de naam herkend",
      advertenties: rij.advertenties,
      metrics: rij.metrics,
      derived: derive(rij.metrics),
    };
  });
  // Onbekend onderaan; de rest op besteding.
  return uit.sort((a, b) =>
    a.key === "onbekend" ? 1 : b.key === "onbekend" ? -1 : b.metrics.spend - a.metrics.spend
  );
}

export type TestOordeel = "te-vroeg" | "beter" | "slechter" | "geen-vergelijking";

export interface TestRij {
  ad: PaidAdsAd;
  adSetName: string | null;
  koopreden: KoopredenKey | null;
  derived: DerivedMetrics;
  /** De CPA van de bewezen advertenties in dezelfde exploitatie en fase. */
  vergelijkCpa: number | null;
  oordeel: TestOordeel;
}

export interface TestOverzicht {
  /** Aandeel van het budget dat naar tests ging, in procenten; `null` zonder besteding. */
  aandeel: number | null;
  testSpend: number;
  totaalSpend: number;
  rijen: TestRij[];
}

/**
 * Hoe de tests ervoor staan. Een test wordt vergeleken met de bewezen
 * advertenties uit dezelfde exploitatie en fase: een ticketingtest naast een
 * ticketingadvertentie, niet naast PSV Connect. Onder de drempel is het te
 * vroeg voor een oordeel.
 */
export function testOverzicht(
  ads: PaidAdsAd[],
  adSets: PaidAdsAdSet[],
  campaigns: PaidAdsCampaign[]
): TestOverzicht {
  const sets = new Map(adSets.map((s) => [`${s.platform}:${s.id}`, s]));
  const camps = new Map(campaigns.map((c) => [`${c.platform}:${c.id}`, c]));

  const groep = (ad: PaidAdsAd) => {
    const c = camps.get(`${ad.platform}:${ad.campaignId}`);
    return `${c?.businessUnit ?? "?"}|${ad.phase}`;
  };
  const test = (ad: PaidAdsAd) =>
    isTest(ad.name, sets.get(`${ad.platform}:${ad.adSetId}`)?.name, camps.get(`${ad.platform}:${ad.campaignId}`)?.name);

  const bewezen = new Map<string, PaidMetrics>();
  let testSpend = 0;
  let totaalSpend = 0;
  for (const ad of ads) {
    totaalSpend += ad.metrics.spend;
    if (test(ad)) {
      testSpend += ad.metrics.spend;
      continue;
    }
    const m = bewezen.get(groep(ad)) ?? emptyMetrics();
    addMetrics(m, ad.metrics);
    bewezen.set(groep(ad), m);
  }

  const rijen = ads
    .filter(test)
    .map((ad): TestRij => {
      const set = sets.get(`${ad.platform}:${ad.adSetId}`);
      const d = derive(ad.metrics);
      const ref = bewezen.get(groep(ad));
      const vergelijkCpa = ref ? derive(ref).costPerResult : null;
      let oordeel: TestOordeel;
      if (ad.metrics.spend < TEST_DREMPEL) oordeel = "te-vroeg";
      else if (vergelijkCpa == null) oordeel = "geen-vergelijking";
      // Geen enkel resultaat na de drempel is slechter dan elke CPA.
      else if (d.costPerResult == null) oordeel = "slechter";
      else oordeel = d.costPerResult <= vergelijkCpa ? "beter" : "slechter";
      return {
        ad,
        adSetName: set?.name ?? null,
        koopreden: koopredenVan(ad, set),
        derived: d,
        vergelijkCpa,
        oordeel,
      };
    })
    .sort((a, b) => b.ad.metrics.spend - a.ad.metrics.spend);

  return {
    aandeel: totaalSpend > 0 ? (testSpend / totaalSpend) * 100 : null,
    testSpend,
    totaalSpend,
    rijen,
  };
}

/** De aanpak in tekst, voor het model dat vragen over het dashboard beantwoordt. */
export const METHODE_TEKST = `AANPAK PAID ADS VAN PSV (afgesproken in de workshop):
- Waarom een fan koopt, de 8 koopredenen: ${KOOPREDENEN.map((k) => `${k.label} (${k.uitleg.toLowerCase()})`).join("; ")}.
- Elke briefing geeft 2 à 3 koopredenen mee; zo testen we welke het beste werkt. De koopreden staat in de naam van de advertentie of advertentieset.
- De briefing in Asana: 1 aanbod en doel (wat verkopen we, wat is succes), 2 koopredenen, 3 target (wat mag een aankoop of aanmelding kosten), 4 planning (totaalbudget, verkoopstart en deadline; ${LEERFASE_DAGEN} dagen leerfase), 5 materiaal (beeld en video, liefst in 4:5 (3:4) en 9:16), 6 eerdere learnings. De rest (structuur, doelgroepen, testen en meten) regelt het paid-team.
- Doelgroep: Advantage+ als basis, kopers en fans als signaal, recente kopers uitsluiten.
- Budget: ${100 - TESTBUDGET.max}-${100 - TESTBUDGET.min}% naar bewezen koopredenen, ${TESTBUDGET.min}-${TESTBUDGET.max}% naar testen. Een test beoordeel je vanaf € ${TEST_DREMPEL} besteding. Een test heeft "test" in de naam.
- CPA: het target wordt vooraf vastgelegd per exploitatie, gemeten op 7-day click en getoetst aan de eigen omzet. Let op: het dashboard meet Meta op het attributievenster van het account.`;
