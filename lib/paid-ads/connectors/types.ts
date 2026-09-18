/**
 * Gedeeld contract voor de platformkoppelingen van het Paid Ads dashboard.
 *
 * Elke connector levert uitsluitend ruwe tellers aan in het formaat uit
 * `lib/paid-ads/types.ts`. Alles wat daaruit te berekenen valt — CTR, CPC, CVR,
 * CPA, scores, funnel, forecast — blijft in `derive.ts`, zodat een metric
 * precies één definitie heeft ongeacht van welk kanaal de rij komt.
 */

import type {
  PaidAdsAd,
  PaidAdsAdSet,
  PaidAdsCampaign,
  PaidMetrics,
  PaidPlatform,
} from "@/lib/paid-ads/types";

/** Datumvenster waarover een connector rapporteert; beide grenzen tellen mee. */
export interface FetchWindow {
  /** ISO-datum (YYYY-MM-DD). */
  from: string;
  /** ISO-datum (YYYY-MM-DD). */
  to: string;
}

/**
 * Eén dag uit de tijdreeks. De connector levert de volledige metrics per dag;
 * de route destilleert daar zowel de dag- als de weekgrafiek uit.
 */
export interface ConnectorDailyPoint {
  /** ISO-datum (YYYY-MM-DD). */
  date: string;
  metrics: PaidMetrics;
}

/** Wat een connector teruggeeft voor de gekozen periode. */
export interface ConnectorResult {
  campaigns: PaidAdsCampaign[];
  adSets: PaidAdsAdSet[];
  ads: PaidAdsAd[];
  daily: ConnectorDailyPoint[];
}

/**
 * De vorm die elk platform implementeert. `fetchTotals` bestaat apart omdat de
 * vergelijkingsperiodes alleen totalen nodig hebben: die hoeven niet de hele
 * campagne-, advertentieset- en advertentielijst op te halen.
 */
export interface PaidConnector {
  platform: PaidPlatform;
  /** Of alle verplichte environment variabelen gezet zijn. */
  isConfigured(): boolean;
  fetchAll(window: FetchWindow, signal?: AbortSignal): Promise<ConnectorResult>;
  fetchTotals(window: FetchWindow, signal?: AbortSignal): Promise<PaidMetrics>;
}

/** Ontbrekende of onvolledige configuratie — een serverprobleem, geen API-fout. */
export class ConnectorConfigError extends Error {}

/**
 * Bewaakt dat een credential geen witruimte bevat.
 *
 * Een token of secret met een spatie of regeleinde erin is altijd fout
 * overgenomen — meestal twee keer geplakt, of met een regeleinde uit een mail.
 * Zonder deze controle belandt zo'n waarde in een HTTP-header, en gooit de
 * fetch een `Headers.append`-fout mét de volledige waarde erin. Die komt dan
 * via `platformErrors` op het scherm, en daar hoort een credential niet.
 */
export function assertCleanSecret(name: string, value: string): void {
  if (/\s/.test(value)) {
    throw new ConnectorConfigError(
      `De waarde van ${name} bevat spaties of regeleindes. Zet er precies één waarde in, zonder witruimte eromheen of ertussen.`
    );
  }
}

/** Het platform gaf een foutstatus terug of was onbereikbaar. */
export class ConnectorRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string
  ) {
    super(message);
  }
}
