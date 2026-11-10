/**
 * De vorm van de afspeeldata, gedeeld door de server die hem maakt
 * (`replay.ts`) en het scherm dat hem tekent. Apart gehouden, zonder imports:
 * `replay.ts` leunt op Node (`crypto`), en dat mag niet in de browser belanden.
 */

/** Eén teken per stoelnummer, net als bij de vakweergave. */
export const REPLAY_CODE = {
  /** Geen stoel op dit nummer (trap, gat). */
  none: ".",
  /** Een stoel zonder geldig ticket. */
  seat: "o",
  /** Een stoel met een geldig ticket. */
  sold: "s",
} as const;

/**
 * `[rij, eerste stoelnummer, tekens, tijden]`. `tijden` loopt gelijk op met de
 * tekens: seconden vanaf het begin van de tijdlijn, of -1 als de stoel niet is
 * gescand.
 */
export type ReplayRow = [row: number, firstSeat: number, codes: string, times: number[]];

export interface ReplayStanding {
  capacity: number;
  sold: number;
  /** Seconden vanaf het begin van de tijdlijn, oplopend. */
  times: number[];
}

export interface ReplayArea {
  area: string;
  rows: ReplayRow[];
  standing?: ReplayStanding;
}

export interface ReplayTotals {
  /** Stoelen op de plattegrond, plus de capaciteit van de staanvakken. */
  capacity: number;
  /** Plaatsen met een geldig ticket. */
  sold: number;
  /** Plaatsen die op de plattegrond oplichten. */
  entered: number;
  /** Tickets met een geslaagde scan naar binnen, ook die zonder plek op de plattegrond. */
  scannedTickets: number;
  /** Gescande tickets waarvan de stoel niet te vinden was. */
  unplaced: number;
  /** Gescande tickets voor een vak buiten de plattegrond, zoals parkeren. */
  elsewhere: number;
  failedScans: number;
}

/** Via welke weg een scan aan zijn plek kwam. */
export interface ReplayJoins {
  onScan: number;
  primaryTicket: number;
  productItem: number;
  salesItem: number;
  scannedItem: number;
  none: number;
}

export interface Replay {
  match: { productId: string; name: string; kickoff: string | null };
  /** Begin van de tijdlijn, als ISO-tijdstip. */
  start: string;
  /** Lengte van de tijdlijn in seconden. */
  duration: number;
  areas: ReplayArea[];
  totals: ReplayTotals;
  joins: ReplayJoins;
  layoutSource: string | null;
  /** Nagebootste scans, geen echte wedstrijd. */
  demo?: boolean;
}
