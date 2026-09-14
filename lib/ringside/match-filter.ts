/**
 * Filteren en sorteren van de wedstrijdlijst.
 *
 * Apart van de component, zodat het te testen is: het seizoen loopt van 1 juli
 * tot en met 30 juni en dat soort grenzen wil je niet per ongeluk verschuiven.
 * Het `season`-label zelf komt uit `seasonOf()` en wordt bij het inlezen al
 * vastgelegd.
 */

export interface FilterableMatch {
  productId: string;
  name: string;
  eventDate: string;
  season: string;
}

export interface MatchFilter {
  /** Seizoenlabel als `25/26`, of `"alle"`. */
  season?: string;
  /** Vrije tekst; kijkt naar naam en seizoen. */
  query?: string;
  /** Wedstrijddatum aflopend (standaard) of oplopend. */
  newestFirst?: boolean;
  /** Hoeveel rijen er teruggegeven worden; `total` blijft het volledige aantal. */
  limit?: number;
}

export interface FilteredMatches<T> {
  rows: T[];
  /** Hoeveel er aan het filter voldoen, ook als `limit` minder teruggeeft. */
  total: number;
}

export interface SeasonProgress {
  season: string;
  /** Alle wedstrijden in dit seizoen. */
  total: number;
  /** Hoeveel daarvan al verkoopdata hebben. */
  withData: number;
}

/**
 * De seizoenen die voorkomen, nieuwste eerst, met per seizoen hoeveel
 * wedstrijden al verkoopdata hebben.
 *
 * Die verhouding is het antwoord op "komt dit nog?": zolang de ingest loopt
 * kruipt hij omhoog, en de recente seizoenen blijven het langst achter omdat de
 * verkooptabel op sleutel geordend is en dat meeloopt met de tijd.
 */
export function seasonsOf(matches: (FilterableMatch & { hasSales?: boolean })[]): SeasonProgress[] {
  const perSeason = new Map<string, SeasonProgress>();

  for (const match of matches) {
    if (!match.season) continue;
    let entry = perSeason.get(match.season);
    if (!entry) {
      entry = { season: match.season, total: 0, withData: 0 };
      perSeason.set(match.season, entry);
    }
    entry.total++;
    if (match.hasSales) entry.withData++;
  }

  return [...perSeason.values()].sort((a, b) => b.season.localeCompare(a.season));
}

export function filterMatches<T extends FilterableMatch>(
  matches: T[],
  filter: MatchFilter = {}
): FilteredMatches<T> {
  const query = (filter.query ?? "").trim().toLowerCase();
  const season = filter.season ?? "alle";
  const newestFirst = filter.newestFirst ?? true;

  const result = matches
    .filter((match) => season === "alle" || match.season === season)
    .filter((match) => !query || `${match.name} ${match.season}`.toLowerCase().includes(query))
    // Vergelijken als tekst kan omdat de datums met het jaar beginnen; een
    // tijd erachter verandert de volgorde tussen dagen niet.
    .sort((a, b) =>
      newestFirst
        ? b.eventDate.localeCompare(a.eventDate)
        : a.eventDate.localeCompare(b.eventDate)
    );

  return {
    rows: filter.limit === undefined ? result : result.slice(0, filter.limit),
    total: result.length,
  };
}
