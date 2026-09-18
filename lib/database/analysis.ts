/**
 * De rekenkern van de Database-tool: een campagne-export naast de SSO-bron
 * leggen, en campagnes onderling vergelijken.
 *
 * De afgesproken definities:
 *
 *   nieuw     ID staat in de bron met aanmaakdatum ≥ startdatum campagne
 *   bestaand  ID staat in de bron met aanmaakdatum < startdatum campagne
 *   onbekend  ID staat niet in de bron
 *
 * "Onbekend" is geen restcategorie maar een signaal: meestal betekent het dat
 * de bronexport ouder is dan de campagne, en dan zijn de andere twee getallen
 * ook niet af. Vandaar `sourceEndsBeforeCampaign` in de uitkomst.
 *
 * Alles draait op gesorteerde indexen uit `index-format`, dus elke telling is
 * één merge-join: geen hashmap met een miljoen sleutels in het geheugen van een
 * serverless function.
 */

import {
  dayAt,
  dayToIso,
  intersectionSize,
  isoToDay,
  mergeJoin,
  participationCounts,
  type PackedIndex,
} from "@/lib/database/index-format";
import type {
  Campaign,
  CampaignAnalysis,
  DailyPoint,
  OverlapResult,
  SourceVersion,
} from "@/lib/database/types";

/**
 * Telt een campagne uit tegen de bron.
 *
 * `campaign` en `source` moeten allebei ontdubbeld zijn — `dedupe()` doet dat
 * en houdt per ID de vroegste datum aan, dus een deelnemer telt hier één keer
 * mee, ook als die drie keer heeft meegedaan.
 */
export function analyzeCampaign(
  campaign: PackedIndex,
  source: PackedIndex,
  campaignMeta: Pick<Campaign, "startDate" | "endDate">,
  sourceVersion: SourceVersion
): CampaignAnalysis {
  const startDay = isoToDay(campaignMeta.startDate);
  if (startDay < 0) {
    throw new Error(`Ongeldige startdatum: ${campaignMeta.startDate}`);
  }

  let isNew = 0;
  let existing = 0;
  let unknown = 0;

  // Per deelnamedag de drie uitkomsten. De deelnamedatum komt uit de
  // campagne-export; de aanmaakdatum uit de bron bepaalt alleen het hokje.
  const byDay = new Map<number, DailyPoint>();
  const bucket = (day: number): DailyPoint => {
    let point = byDay.get(day);
    if (!point) {
      point = { date: dayToIso(day), isNew: 0, existing: 0, unknown: 0 };
      byDay.set(day, point);
    }
    return point;
  };

  mergeJoin(
    campaign,
    source,
    (ci, si) => {
      const point = bucket(dayAt(campaign, ci));
      if (dayAt(source, si) >= startDay) {
        isNew++;
        point.isNew++;
      } else {
        existing++;
        point.existing++;
      }
    },
    (ci) => {
      unknown++;
      bucket(dayAt(campaign, ci)).unknown++;
    }
  );

  const daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  return {
    sourceVersionId: sourceVersion.id,
    analyzedAt: new Date().toISOString(),
    isNew,
    existing,
    unknown,
    daily,
    sourceEndsBeforeCampaign:
      !!sourceVersion.lastRecordDate &&
      !!campaignMeta.endDate &&
      sourceVersion.lastRecordDate < campaignMeta.endDate,
    sourceLastRecordDate: sourceVersion.lastRecordDate,
  };
}

/** Of een uitkomst nog tegen de huidige bron is geteld. */
export function isStale(
  campaign: Campaign,
  activeVersionId: string | null
): boolean {
  return (
    !campaign.analysis ||
    !activeVersionId ||
    campaign.analysis.sourceVersionId !== activeVersionId
  );
}

/**
 * De overlapmatrix en de verdeling "meegedaan aan 1 / 2 / 3+ campagnes".
 *
 * De matrix is symmetrisch en de diagonaal is het eigen aantal unieke
 * deelnemers; dat scheelt de helft van de merge-joins en leest in de UI als een
 * totaal per rij.
 */
export function buildOverlap(
  entries: { campaign: Campaign; index: PackedIndex }[]
): OverlapResult {
  const n = entries.length;
  const matrix: number[][] = Array.from({ length: n }, () =>
    new Array<number>(n).fill(0)
  );

  for (let i = 0; i < n; i++) {
    matrix[i][i] = entries[i].index.count;
    for (let j = i + 1; j < n; j++) {
      const shared = intersectionSize(entries[i].index, entries[j].index);
      matrix[i][j] = shared;
      matrix[j][i] = shared;
    }
  }

  return {
    campaigns: entries.map((e) => ({
      id: e.campaign.id,
      title: e.campaign.title,
      uniqueParticipants: e.index.count,
    })),
    matrix,
    participation: participationCounts(entries.map((e) => e.index)),
  };
}
