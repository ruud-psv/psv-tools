/**
 * Wat de JW Player-API voor PSV Play kan, per property. Dit bestand wordt
 * geschreven door `scripts/jwplayer-probe.ts`; pas het niet met de hand aan.
 * UI en MCP-tools tonen alleen onderdelen die hier als beschikbaar staan.
 *
 * Nog niet geprobed: alles staat uit.
 */

export interface SiteCapabilities {
  label: string;
  /** Per metric (`plays`, `play_rate`, `25_percent_completes`, …): werkt hij? */
  metrics: Record<string, boolean>;
  /** Per dimensie (`eastern_date`, `tag`, `platform_id`, …): werkt hij? */
  dimensions: Record<string, boolean>;
  includeMetadata: boolean;
  ott: { available: boolean; hasData: boolean; loggedInUniqueViewers: boolean };
  live: { filter: boolean; hasData: boolean };
  /** De schrijfwijze van `order` die de API accepteert, of `null` als sorteren niet werkt. */
  sort: "ascending" | "ASCENDING" | null;
  /** Het grootste geteste bereik (dagen) dat één query accepteert. */
  maxRangeDays: number | null;
  /** Ook het grootste geteste bereik werkte: de echte grens ligt mogelijk hoger. */
  maxRangeIsLowerBound: boolean;
  /** De oudste dag (eastern_date) met data. */
  earliestDate: string | null;
  management: { available: boolean; fields: string[] };
}

export interface JwCapabilities {
  probedAt: string | null;
  sites: Record<string, SiteCapabilities>;
}

export const JWPLAYER_CAPABILITIES: JwCapabilities = {
  probedAt: null,
  sites: {},
};
