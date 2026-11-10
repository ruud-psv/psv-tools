/**
 * Welke wedstrijd de instroom laat zien.
 *
 * Voor nu één vaste wedstrijd. Het product-id staat nergens in de code: het
 * wordt opgezocht in de productenlijst van de verkoop-ingest, op tegenstander
 * en datum.
 */

import { isPsvHomeMatch } from "../aangrenzende-stoelen/events";
import type { EventSales } from "../ringside/store";
import { opponentOf } from "../ticketing-stadion/summary";

export interface InstroomTarget {
  opponent: string;
  /** De wedstrijddag, als `YYYY-MM-DD`. */
  date: string;
}

export const INSTROOM_MATCH: InstroomTarget = { opponent: "Willem II", date: "2026-10-31" };

/** `PSV - Willem II op 31 oktober 2026`, voor meldingen. */
export function describeTarget(target: InstroomTarget = INSTROOM_MATCH): string {
  const [year, month, day] = target.date.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return `PSV - ${target.opponent} op ${date}`;
}

/**
 * Het product van de wedstrijd. Staan er meer producten op die dag tegen die
 * tegenstander, dan het product met de meeste verkoop: dat is de wedstrijd zelf.
 */
export function findInstroomMatch(
  sales: Record<string, EventSales>,
  target: InstroomTarget = INSTROOM_MATCH
): EventSales | null {
  const opponent = opponentOf(`PSV - ${target.opponent}`);
  return (
    Object.values(sales)
      .filter(
        (event) =>
          isPsvHomeMatch(event.name) && event.eventDate.slice(0, 10) === target.date && opponentOf(event.name) === opponent
      )
      .sort((a, b) => b.total - a.total)[0] ?? null
  );
}
