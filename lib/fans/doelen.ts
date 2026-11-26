/**
 * De seizoensdoelen voor Engaged en Active Fans. Elk doel heeft vijf niveaus;
 * het niveau van een waarde is het hoogste niveau waarvan de ondergrens gehaald
 * is. Zo valt een gemiddelde van 42.749,5 (tussen twee grenzen in) gewoon in
 * niveau 1.
 */

export interface Niveau {
  niveau: number;
  /** Ondergrens, inclusief. `null` bij niveau 1. */
  van: number | null;
  /** Bovengrens, inclusief. `null` bij niveau 5. */
  tot: number | null;
}

export interface SeizoenDoelen {
  /** Zoals `2026-27`. */
  seizoen: string;
  label: string;
  start: string;
  eind: string;
  /** Gemiddelde Engaged Fans per maand. */
  engaged: Niveau[];
  /** Unieke Active Fans over het hele seizoen. */
  active: Niveau[];
}

export const DOELEN: SeizoenDoelen[] = [
  {
    seizoen: "2026-27",
    label: "2026/27",
    start: "2026-07-01",
    eind: "2027-06-30",
    engaged: [
      { niveau: 1, van: null, tot: 42_749 },
      // In de doelstelling in Asana staat hier 44.4549: een typfout voor 44.549.
      { niveau: 2, van: 42_750, tot: 44_549 },
      { niveau: 3, van: 44_550, tot: 45_450 },
      { niveau: 4, van: 45_451, tot: 47_249 },
      { niveau: 5, van: 47_250, tot: null },
    ],
    active: [
      { niveau: 1, van: null, tot: 128_249 },
      { niveau: 2, van: 128_250, tot: 133_649 },
      { niveau: 3, van: 133_650, tot: 136_350 },
      { niveau: 4, van: 136_351, tot: 141_749 },
      { niveau: 5, van: 141_750, tot: null },
    ],
  },
];

/** De doelen van het seizoen waar `dag` in valt, of `null` als die er (nog) niet zijn. */
export function doelenVoor(dag: string, doelen: SeizoenDoelen[] = DOELEN): SeizoenDoelen | null {
  return doelen.find((d) => dag >= d.start && dag <= d.eind) ?? null;
}

export function niveauVan(niveaus: Niveau[], waarde: number): number {
  let hoogste = niveaus[0]?.niveau ?? 1;
  for (const n of niveaus) if (n.van == null || waarde >= n.van) hoogste = Math.max(hoogste, n.niveau);
  return hoogste;
}

export function ondergrens(niveaus: Niveau[], niveau: number): number | null {
  return niveaus.find((n) => n.niveau === niveau)?.van ?? null;
}
