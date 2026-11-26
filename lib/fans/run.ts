/**
 * De dagelijkse telling van Active & Engaged Fans.
 *
 * 1. **Maileon**: de klikken van elke dag die nog niet is ingelezen, tot en met
 *    vandaag. Vandaag telt mee maar blijft open: de volgende run leest hem
 *    opnieuw, helemaal. De eerste keer is dat alles vanaf 1 juli; past dat niet
 *    in één run, dan gaat de volgende verder waar deze stopte.
 * 2. **MijnPSV (BlueConic)**: alle profielen waarvan de meest recente
 *    SSO-login op of na de vorige keer lezen valt. Elk profiel telt in de maand
 *    van die login. Alleen de maanden waarin gelezen is, zijn compleet.
 * 3. **De stand van vandaag**: per bron het aantal fans in de maand en in het
 *    seizoen, de overlap, en het ontdubbelde totaal.
 *
 * Alleen als Maileon bij is, komt er een stand: een halve backfill zou een te
 * laag cijfer opleveren.
 */

import { doelenVoor, DOELEN, type SeizoenDoelen } from "./doelen";
import { zonderLegeMijnpsv } from "./herstel";
import type { MaileonKlikken } from "./maileon";
import { maakSet, normaliseerSso, overlap, voegSamen, LEGE_SET, type FanSet } from "./sets";
import { leesHistorie, leesSet, schrijfHistorie, schrijfSet, type BronSleutel, type Opslag } from "./store";
import { amsterdamDag, maandenTussen, maandVan, plusDagen } from "./tijd";
import { legeHistorie, type DagStand, type Telling } from "./types";

export interface MijnpsvProfiel {
  sso: string;
  /** SSO Ingelogd Datum (meest recent), als `JJJJ-MM-DD` in Nederlandse tijd. */
  laatsteLogin: string;
}

/** BlueConic: profielen met een SSO-id en een meest recente SSO-login op of na `sinds`. */
export interface MijnpsvBron {
  profielenSinds(sinds: string): Promise<MijnpsvProfiel[]>;
}

export class FansFout extends Error {}

export interface FansRunVerslag {
  seizoen: string;
  vandaag: string;
  maileon: { dagen: string[]; tot: string | null; klaar: boolean; endpoint: string | null };
  mijnpsv: { gelezen: number; sinds: string } | { fout: string } | null;
  stand: DagStand | null;
}

export async function fansRun(opties: {
  opslag: Opslag;
  maileon: MaileonKlikken;
  mijnpsv: MijnpsvBron | null;
  nu: Date;
  budgetMs: number;
  doelen?: SeizoenDoelen[];
}): Promise<FansRunVerslag> {
  const { opslag, maileon, mijnpsv, nu, budgetMs } = opties;
  const begin = Date.now();
  const vandaag = amsterdamDag(nu);
  const seizoen = doelenVoor(vandaag, opties.doelen ?? DOELEN);
  if (!seizoen) throw new FansFout(`Er zijn geen doelen voor het seizoen van ${vandaag}. Voeg ze toe in lib/fans/doelen.ts.`);

  const historie = (await leesHistorie(opslag, seizoen.seizoen)) ?? legeHistorie(seizoen.seizoen);

  // Sets: pas laden als ze nodig zijn, en alleen terugschrijven wat veranderde.
  const sets = new Map<string, FanSet>();
  const gewijzigd = new Set<string>();
  const sleutel = (bron: BronSleutel, s: string) => `${bron}|${s}`;
  async function set(bron: BronSleutel, s: string): Promise<FanSet> {
    const k = sleutel(bron, s);
    if (!sets.has(k)) sets.set(k, await leesSet(opslag, seizoen!.seizoen, bron, s));
    return sets.get(k)!;
  }
  async function voegToe(bron: BronSleutel, s: string, nieuw: FanSet): Promise<void> {
    if (nieuw.count === 0) return;
    sets.set(sleutel(bron, s), voegSamen(await set(bron, s), nieuw));
    gewijzigd.add(sleutel(bron, s));
  }

  // 1. Maileon
  const eind = vandaag < seizoen.eind ? vandaag : seizoen.eind;
  const gedaan: string[] = [];
  let klaar = true;
  for (let dag = historie.maileon.tot ? plusDagen(historie.maileon.tot, 1) : seizoen.start; dag <= eind; dag = plusDagen(dag, 1)) {
    if (Date.now() - begin > budgetMs) {
      klaar = false;
      break;
    }
    const nieuw = maakSet(await maileon.klikkersOpDag(dag), dag);
    await voegToe("maileon", "seizoen", nieuw);
    await voegToe("maileon", maandVan(dag), nieuw);
    if (dag < vandaag) historie.maileon.tot = dag;
    gedaan.push(dag);
  }
  historie.maileon.endpoint = maileon.endpoint() ?? historie.maileon.endpoint;

  // Per maand het aantal Maileon-fans, voor de vergelijking met de filters in
  // Maileon: de maanden van deze run, en die nog geen aantal hebben.
  const maileonMaanden = (historie.maileonMaanden ??= {});
  const aangeraakt = new Set(gedaan.map(maandVan));
  const totDag = gedaan.at(-1) ?? historie.maileon.tot;
  for (const m of totDag ? maandenTussen(seizoen.start, totDag) : []) {
    if (aangeraakt.has(m) || maileonMaanden[m] == null) maileonMaanden[m] = (await set("maileon", m)).count;
  }

  // Herstel: een stand met 0 MijnPSV-fans was een lege BlueConic-uitkomst. Is
  // de seizoensset leeg, dan begint MijnPSV opnieuw vanaf het begin.
  historie.dagen = historie.dagen.map(zonderLegeMijnpsv);
  if (historie.mijnpsv.laatste && (await set("mijnpsv", "seizoen")).count === 0) {
    historie.mijnpsv = { maanden: [], laatste: null };
  }

  // 2. MijnPSV
  let mijnpsvVerslag: FansRunVerslag["mijnpsv"] = null;
  if (klaar && mijnpsv) {
    const sinds = historie.mijnpsv.laatste ?? seizoen.start;
    try {
      const profielen = await mijnpsv.profielenSinds(sinds);
      const perMaand = new Map<string, string[]>();
      const seizoenIds: string[] = [];
      for (const p of profielen) {
        const id = normaliseerSso(p.sso);
        if (!id || p.laatsteLogin < seizoen.start || p.laatsteLogin > eind) continue;
        seizoenIds.push(id);
        const m = maandVan(p.laatsteLogin);
        const lijst = perMaand.get(m);
        if (lijst) lijst.push(id);
        else perMaand.set(m, [id]);
      }
      await voegToe("mijnpsv", "seizoen", maakSet(seizoenIds, vandaag));
      for (const [m, ids] of perMaand) await voegToe("mijnpsv", m, maakSet(ids, vandaag));
      historie.mijnpsv.laatste = vandaag;
      if (!historie.mijnpsv.maanden.includes(maandVan(vandaag))) historie.mijnpsv.maanden.push(maandVan(vandaag));
      mijnpsvVerslag = { gelezen: profielen.length, sinds };
    } catch (err) {
      mijnpsvVerslag = { fout: err instanceof Error ? err.message : String(err) };
    }
  }

  // 3. De stand van vandaag
  let stand: DagStand | null = null;
  if (klaar) {
    const maand = maandVan(vandaag);
    // Mislukte BlueConic vandaag, dan de stand van de vorige keer lezen: een dag
    // achter is beter dan geen totaal. De maand telt alleen als er in die maand
    // gelezen is.
    const telling = (ml: FanSet, bc: FanSet | null): Telling => {
      if (!bc) return { maileon: ml.count, mijnpsv: null, overlap: null, totaal: null };
      const dubbel = overlap(ml, bc);
      return { maileon: ml.count, mijnpsv: bc.count, overlap: dubbel, totaal: ml.count + bc.count - dubbel };
    };
    const bcMaand = mijnpsv && historie.mijnpsv.maanden.includes(maand) ? await set("mijnpsv", maand) : null;
    const bcSeizoen = mijnpsv && historie.mijnpsv.laatste ? await set("mijnpsv", "seizoen") : null;
    stand = {
      datum: vandaag,
      engaged: { maand, ...telling(await set("maileon", maand), bcMaand) },
      active: telling(await set("maileon", "seizoen"), bcSeizoen),
    };
    historie.dagen = [...historie.dagen.filter((d) => d.datum !== vandaag), stand].sort((a, b) => (a.datum < b.datum ? -1 : 1));
    historie.bijgewerkt = nu.toISOString();
  }

  // Eerst de sets, dan de historie: die mag nooit verder zijn dan de sets.
  for (const k of gewijzigd) {
    const [bron, s] = k.split("|") as [BronSleutel, string];
    await schrijfSet(opslag, seizoen.seizoen, bron, s, sets.get(k) ?? LEGE_SET);
  }
  await schrijfHistorie(opslag, historie);

  return {
    seizoen: seizoen.seizoen,
    vandaag,
    maileon: { dagen: gedaan, tot: historie.maileon.tot, klaar, endpoint: historie.maileon.endpoint },
    mijnpsv: mijnpsvVerslag,
    stand,
  };
}
