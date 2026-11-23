/**
 * Wat de JW Player-API voor PSV Play kan, per property: de vorm van de
 * uitkomst van de capability probe (`lib/jwplayer/probe.ts`).
 *
 * De probe draait op de server, met het secret uit Vercel: automatisch bij de
 * eerste vraag, elke maandag via de cron, of met de hand via
 * `/api/psv-play/probe?opnieuw=1`. De uitkomst staat in Vercel Blob
 * (`psv-play/capabilities.json`). UI en MCP-tools tonen alleen wat hier als
 * beschikbaar staat; niets is hardgecodeerd op aannames over de licentie.
 */

export interface SiteCapabilities {
  label: string;
  /** Per metric: de `operation` die werkt (meestal `sum`), of `null` als hij niet werkt. */
  metrics: Record<string, string | null>;
  /** Per dimensie (`eastern_date`, `media_id`, `tag`, `platform_id`, …): werkt hij? */
  dimensions: Record<string, boolean>;
  /** Een query zonder dimensie (één totaal over de hele periode) werkt. Nodig voor unieke kijkers over een periode. */
  totalsWithoutDimension: boolean;
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
  /** Wanneer de probe draaide (ISO), of `null` als hij nog nooit draaide. */
  probedAt: string | null;
  sites: Record<string, SiteCapabilities>;
}

export const GEEN_CAPABILITIES: JwCapabilities = { probedAt: null, sites: {} };
