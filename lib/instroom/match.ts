/**
 * Uit welke wedstrijden je op de instroompagina kunt kiezen.
 *
 * De scans van een wedstrijd worden alleen op verzoek ingelezen: je kiest er
 * een uit de gespeelde thuiswedstrijden van PSV 1 van dit seizoen. De lijst
 * komt uit de productenlijst van de verkoop-ingest.
 */

import { isPsvHomeMatch } from "../aangrenzende-stoelen/events";
import { seasonOf } from "../ringside/daily-sales";

/** Het seizoen waaruit je kunt kiezen. */
export const INSTROOM_SEASON = "26/27";

/** Wat er van een product nodig is voor de keuzelijst. */
export interface KnownProduct {
  productId: string;
  name: string;
  eventDate: string;
}

/**
 * De gespeelde thuiswedstrijden van PSV 1 in een seizoen, de laatste bovenaan.
 * `today` is de datum van vandaag (`YYYY-MM-DD`); een wedstrijd van vandaag
 * staat erbij, want de scans komen binnen terwijl hij loopt.
 */
export function playedHomeMatches<T extends KnownProduct>(
  products: Iterable<T>,
  today: string,
  season: string = INSTROOM_SEASON
): T[] {
  return [...products]
    .filter(
      (product) =>
        isPsvHomeMatch(product.name) && seasonOf(product.eventDate) === season && product.eventDate.slice(0, 10) <= today
    )
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate) || a.name.localeCompare(b.name));
}
