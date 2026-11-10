/**
 * Welke wedstrijd de instroom laat zien.
 *
 * Voor nu één vaste wedstrijd. Het product-id staat nergens in de code: het
 * wordt opgezocht in de productenlijst van de verkoop-ingest, op tegenstander
 * en datum.
 */

import { isPsvHomeMatch } from "../aangrenzende-stoelen/events";
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

/** Wat er van een product nodig is om de wedstrijd te herkennen. */
export interface KnownProduct {
  productId: string;
  name: string;
  eventDate: string;
  total?: number;
}

function sameOpponent(a: string, b: string): boolean {
  return Boolean(a && b) && (a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `));
}

/**
 * Het product van de wedstrijd: een thuiswedstrijd van PSV 1 op die dag tegen
 * die tegenstander. De naam mag iets achter de tegenstander hebben staan
 * (`PSV - Willem II 26/27`). Staan er meer producten, dan dat met de meeste
 * verkoop: dat is de wedstrijd zelf.
 */
export function findInstroomMatch<T extends KnownProduct>(
  products: Iterable<T>,
  target: InstroomTarget = INSTROOM_MATCH
): T | null {
  const opponent = opponentOf(`PSV - ${target.opponent}`);
  return (
    [...products]
      .filter(
        (event) =>
          isPsvHomeMatch(event.name) &&
          event.eventDate.slice(0, 10) === target.date &&
          sameOpponent(opponentOf(event.name), opponent)
      )
      .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))[0] ?? null
  );
}

/** Thuiswedstrijden van PSV 1 binnen een week van de gezochte dag, voor de melding als hij niet gevonden is. */
export function nearbyMatches(products: Iterable<KnownProduct>, target: InstroomTarget = INSTROOM_MATCH): string[] {
  const day = Date.parse(`${target.date}T00:00:00Z`);
  return [...products]
    .filter((event) => {
      const other = Date.parse(`${event.eventDate.slice(0, 10)}T00:00:00Z`);
      return isPsvHomeMatch(event.name) && Math.abs(other - day) <= 7 * 86_400_000;
    })
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
    .map((event) => `${event.name} (${event.eventDate.slice(0, 16)})`);
}
