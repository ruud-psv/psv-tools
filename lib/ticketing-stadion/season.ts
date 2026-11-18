/**
 * Het seizoensoverzicht: per thuiswedstrijd van PSV 1 de vrije verkoop en de
 * resale, naast elkaar.
 *
 * Geen nieuwe leesronde in Ringside: dit combineert de verkoop per dag die de
 * ingest al per wedstrijd bewaart (`ringside/verloop/live.json.gz`, zie
 * `docs/ticketing-verloop.md`). Alleen de tribunevakken; parkeren telt niet mee.
 *
 * Voor wedstrijden die nog gespeeld moeten worden is het de stand tot nu toe.
 * De ingest telt daar op zonder een gewijzigde regel terug te draaien, dus een
 * ticket dat na verkoop wijzigt kan dubbel tellen en een retour gaat er niet af
 * (de bekende beperking uit `ticketing-verloop.md`). Gespeelde wedstrijden
 * veranderen niet meer.
 */

import { isPsvHomeMatch } from "../aangrenzende-stoelen/events";
import { totalOf, type EventSales } from "../ringside/sales-series";
import { toCsv } from "./export";

export interface SeasonMatch {
  eventId: string;
  name: string;
  eventDate: string;
  played: boolean;
  /** Losse verkoop. */
  free: number;
  /** Gekocht via de resale. */
  resale: number;
  /** Seizoenkaarten en vrijkaarten: ter context, geen verkoop voor de wedstrijd zelf. */
  seasonTickets: number;
  complimentary: number;
}

export interface SeasonOverview {
  season: string;
  /** Seizoenen met thuiswedstrijden in de data, nieuwste eerst. */
  seasons: string[];
  matches: SeasonMatch[];
  totals: { matches: number; played: number; free: number; resale: number };
}

export function buildSeasonOverview(sales: Iterable<EventSales>, season: string, today: string): SeasonOverview {
  const home = [...sales].filter((event) => isPsvHomeMatch(event.name) && event.season);
  const matches = home
    .filter((event) => event.season === season)
    .map((event) => ({
      eventId: event.productId,
      name: event.name,
      eventDate: event.eventDate,
      played: event.eventDate.slice(0, 10) < today,
      free: totalOf(event.series.vrij),
      resale: totalOf(event.series.resale),
      seasonTickets: totalOf(event.series.seizoenkaart),
      complimentary: totalOf(event.series.vrijkaart),
    }))
    // Een product zonder één ticket is een proef- of dubbel product, geen wedstrijd.
    .filter((match) => match.played === false || match.free + match.resale + match.seasonTickets + match.complimentary > 0)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.name.localeCompare(b.name));

  return {
    season,
    seasons: [...new Set(home.map((event) => event.season))].sort().reverse(),
    matches,
    totals: {
      matches: matches.length,
      played: matches.filter((match) => match.played).length,
      free: matches.reduce((sum, match) => sum + match.free, 0),
      resale: matches.reduce((sum, match) => sum + match.resale, 0),
    },
  };
}

export function buildSeasonCsv(overview: SeasonOverview): string {
  const lines = [["Wedstrijd", "Datum", "Gespeeld", "Verkocht vrije verkoop", "Verkocht resale", "Totaal verkocht", "Aandeel resale", "Seizoenkaarten", "Vrijkaarten"]];
  for (const match of overview.matches) {
    const total = match.free + match.resale;
    lines.push([
      match.name,
      match.eventDate.slice(0, 10),
      match.played ? "ja" : "nee",
      String(match.free),
      String(match.resale),
      String(total),
      total > 0 ? `${Math.round((match.resale / total) * 1000) / 10}%`.replace(".", ",") : "",
      String(match.seasonTickets),
      String(match.complimentary),
    ]);
  }
  return toCsv(lines);
}

const nlGetal = new Intl.NumberFormat("nl-NL");

/**
 * Het seizoensoverzicht als tekst voor de assistent: dezelfde cijfers als de
 * pagina Seizoensoverzicht (`/dashboard/ticketing-stadion/seizoen`).
 */
export function seasonContext(
  overview: SeasonOverview,
  verkoop: { complete: boolean; caughtUpAt: string | null; lastError: string | null }
): string {
  const { totals } = overview;
  const regels = [
    `SEIZOENSOVERZICHT ${overview.season}: thuiswedstrijden van PSV 1 in het Philips Stadion`,
    `Seizoenen in de data: ${overview.seasons.join(", ") || "geen"}.`,
    "Losse verkoop = tickets voor die wedstrijd verkocht in de vrije verkoop; resale = gekocht via de resale. Seizoenkaarten en vrijkaarten staan erbij ter context en zijn geen verkoop voor de wedstrijd zelf.",
    `Totaal: ${nlGetal.format(totals.matches)} wedstrijden, waarvan ${nlGetal.format(totals.played)} gespeeld. Losse verkoop ${nlGetal.format(totals.free)}, resale ${nlGetal.format(
      totals.resale
    )}.`,
    "",
    "datum | wedstrijd | gespeeld | losse verkoop | resale | seizoenkaarten | vrijkaarten",
    ...overview.matches.map((m) =>
      [m.eventDate.slice(0, 10), m.name, m.played ? "ja" : "nee", m.free, m.resale, m.seasonTickets, m.complimentary].join(" | ")
    ),
  ];
  if (overview.matches.length === 0) regels.push("Geen thuiswedstrijden in dit seizoen.");
  regels.push(
    "",
    `Stand van de verkoopdata: bijgewerkt tot ${verkoop.caughtUpAt ?? "onbekend"}.${
      verkoop.complete ? "" : " Let op: de verkoop wordt nog ingelezen; aantallen kunnen nog stijgen."
    }${verkoop.lastError ? ` Laatste fout bij het inlezen: ${verkoop.lastError}` : ""}`
  );
  return regels.join("\n");
}
