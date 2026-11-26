/**
 * Wat de dagelijkse telling bewaart (`fans/<seizoen>/historie.json`). Alleen
 * aantallen: de SSO-id's zelf staan alleen als hash in de sets ernaast.
 */

/** Eén telling, ontdubbeld op SSO-id. MijnPSV (BlueConic) is `null` zolang die bron ontbreekt. */
export interface Telling {
  maileon: number;
  mijnpsv: number | null;
  /** Fans die in beide bronnen voorkomen. */
  overlap: number | null;
  /** maileon + mijnpsv − overlap; `null` zonder MijnPSV. */
  totaal: number | null;
}

export interface DagStand {
  datum: string;
  /** Engaged Fans in de maand van `datum`, tot en met die dag. */
  engaged: Telling & { maand: string };
  /** Active Fans sinds het begin van het seizoen. */
  active: Telling;
}

export interface Historie {
  versie: 1;
  seizoen: string;
  /** Eén stand per dag, oplopend op datum. */
  dagen: DagStand[];
  maileon: {
    /** De laatste dag waarvan alle klikken zijn ingelezen. */
    tot: string | null;
    /** Het rapport-endpoint dat Maileon accepteerde. */
    endpoint: string | null;
  };
  mijnpsv: {
    /**
     * Maanden waarin BlueConic gelezen is. Alleen die maanden zijn compleet:
     * BlueConic bewaart de meest recente logindatum, dus wie in een maand
     * inlogde en daarna opnieuw, is achteraf niet meer aan die maand te zien.
     */
    maanden: string[];
    /** De dag van de laatste keer lezen. */
    laatste: string | null;
  };
  /** Moment van de laatste geslaagde run. */
  bijgewerkt: string | null;
}

export function legeHistorie(seizoen: string): Historie {
  return {
    versie: 1,
    seizoen,
    dagen: [],
    maileon: { tot: null, endpoint: null },
    mijnpsv: { maanden: [], laatste: null },
    bijgewerkt: null,
  };
}
