/**
 * De cijfers van vóór de automatische telling, uit de handmatige updates van
 * Marnix in Asana. Ze zijn op dezelfde manier geteld: een BlueConic-export en
 * een Maileon-export, ontdubbeld op SSO-id.
 *
 * BlueConic bewaart alleen de meest recente logindatum. Een afgelopen maand is
 * daardoor niet meer na te rekenen, dus deze maanden blijven handmatig.
 */

export interface HandmatigeMaand {
  maand: string;
  totaal: number;
  /** Bij een maand die nog liep: tot en met welke dag geteld is. */
  tm?: string;
}

export interface HandmatigePeiling {
  datum: string;
  maileon: number;
  mijnpsv: number;
  overlap: number;
  totaal: number;
}

export interface Handmatig {
  engaged: HandmatigeMaand[];
  active: HandmatigePeiling[];
}

export const HANDMATIG: Handmatig = {
  engaged: [
    { maand: "2026-07", totaal: 46_857 },
    { maand: "2026-08", totaal: 41_903 },
    { maand: "2026-09", totaal: 48_154 },
    { maand: "2026-10", totaal: 52_471 },
    { maand: "2026-11", totaal: 41_914, tm: "2026-11-25" },
  ],
  active: [
    { datum: "2026-09-15", maileon: 62_546, mijnpsv: 52_264, overlap: 26_755, totaal: 88_055 },
    { datum: "2026-10-13", maileon: 68_708, mijnpsv: 57_233, overlap: 30_326, totaal: 95_615 },
    // In de Asana-update staat bij Maileon 68.708, hetzelfde getal als op 13
    // oktober. Alleen 73.852 (68.708 + de vermelde 5.144) klopt met het totaal.
    { datum: "2026-11-26", maileon: 73_852, mijnpsv: 64_748, overlap: 34_106, totaal: 104_494 },
  ],
};
