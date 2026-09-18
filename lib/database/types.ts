/**
 * Types die de bron, de campagnes en de analyses van de Database-tool delen.
 * Wordt zowel door de route handlers als door de client-componenten gebruikt,
 * dus hier staat niets dat alleen in een browser of alleen in Node werkt.
 */

/** Eén upload van het volledige SSO-bronbestand. */
export interface SourceVersion {
  id: string;
  uploadedAt: string;
  uploadedBy: string;
  fileName: string;
  /** Unieke SSO-ID's na ontdubbelen — dit is "aantal records". */
  recordCount: number;
  /** Regels met data die we hebben gelezen (koptekst niet meegeteld). */
  rowsRead: number;
  /** Regels zonder bruikbaar ID of zonder leesbare datum. */
  rowsSkipped: number;
  /** Regels met een ID dat al eerder in hetzelfde bestand stond. */
  duplicates: number;
  hashVersion: number;
  /** Aantal shards waarin de index is weggeschreven. */
  parts: number;
  /** Accounts per aanmaakmaand, `YYYY-MM` → aantal. Voedt de groeicurve. */
  growthByMonth: Record<string, number>;
  /** Oudste en nieuwste aanmaakdatum in de export, `YYYY-MM-DD`. */
  firstRecordDate: string;
  lastRecordDate: string;
}

/** `database/source/versions.json`. */
export interface SourceState {
  /** De versie waartegen campagnes worden geanalyseerd. */
  activeVersionId: string | null;
  /** Nieuwste eerst. */
  versions: SourceVersion[];
}

/** Eén dag binnen de campagneperiode. */
export interface DailyPoint {
  date: string;
  isNew: number;
  existing: number;
  unknown: number;
}

export interface CampaignAnalysis {
  /** Tegen welke bronversie dit is geteld. Wijkt die af van de actieve versie,
   *  dan is de uitkomst verouderd. */
  sourceVersionId: string;
  analyzedAt: string;
  /** Aanmaakdatum ≥ startdatum campagne. */
  isNew: number;
  /** Aanmaakdatum < startdatum campagne. */
  existing: number;
  /** ID komt niet voor in de bron. */
  unknown: number;
  /** Deelnames per dag, opgesplitst. Alleen dagen met deelnames. */
  daily: DailyPoint[];
  /**
   * De bronexport is van vóór het einde van de campagne. "Nieuw" is dan per
   * definitie te laag en "onbekend" te hoog.
   */
  sourceEndsBeforeCampaign: boolean;
  /** Laatste aanmaakdatum in de gebruikte bron, ter onderbouwing. */
  sourceLastRecordDate: string;
}

export interface Campaign {
  id: string;
  title: string;
  /** `YYYY-MM-DD`. */
  startDate: string;
  endDate: string;
  createdAt: string;
  createdBy: string;
  fileName: string;
  /** Regels in de export — iemand kan vaker hebben meegedaan. */
  participations: number;
  /** Unieke SSO-ID's. */
  uniqueParticipants: number;
  rowsSkipped: number;
  hashVersion: number;
  analysis: CampaignAnalysis | null;
}

export interface OverlapEntry {
  id: string;
  title: string;
  uniqueParticipants: number;
}

export interface OverlapResult {
  campaigns: OverlapEntry[];
  /** `matrix[i][j]` = unieke personen in zowel campagne i als j. */
  matrix: number[][];
  /** `participation[k]` = personen die aan k+1 campagnes meededen. */
  participation: number[];
}
