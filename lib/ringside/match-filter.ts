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

/** De seizoenen die in deze verzameling voorkomen, nieuwste eerst. */
export function seasonsOf(matches: FilterableMatch[]): string[] {
  const found = new Set<string>();
  for (const match of matches) if (match.season) found.add(match.season);
  return [...found].sort((a, b) => b.localeCompare(a));
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
