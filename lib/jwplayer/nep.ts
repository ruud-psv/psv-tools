import type { SiteCapabilities } from "../../config/jwplayer-capabilities";
import type { AnalyticsQuery, JwApi, JwMedia, Rij } from "./client";
import { mediaIndex } from "./media";
import type { Ctx } from "./rapport";

/**
 * Nepversies voor de tests van PSV Play: capabilities, een JW-API die
 * antwoordt met een functie, en een context voor `rapport.ts`.
 */

export function volleCaps(over: Partial<SiteCapabilities> = {}): SiteCapabilities {
  const m = ["plays", "time_watched", "unique_viewers", "completes", "complete_rate", "25_percent_completes", "50_percent_completes", "75_percent_completes"];
  const d = ["eastern_date", "media_id", "tag", "platform_id", "device_id", "country_code", "player_playback_mode"];
  return {
    label: "PSV Play",
    metrics: Object.fromEntries(m.map((x) => [x, "sum"])),
    dimensions: Object.fromEntries(d.map((x) => [x, true])),
    totalsWithoutDimension: true,
    includeMetadata: true,
    ott: { available: false, hasData: false, loggedInUniqueViewers: false },
    live: { filter: true, hasData: true },
    sort: "ascending",
    maxRangeDays: 366,
    maxRangeIsLowerBound: false,
    earliestDate: "2024-01-01",
    management: { available: true, fields: ["id", "metadata.title"] },
    ...over,
  };
}

export function media(id: string, titel: string, tags: string[] = [], extra: Partial<JwMedia> = {}): JwMedia {
  return { id, titel, tags, gepubliceerd: "2026-11-01T10:00:00Z", duur: 600, status: "ready", customParams: {}, ...extra };
}

export function nepApi(antwoord: (q: AnalyticsQuery) => Rij[], lijst: JwMedia[] = []) {
  const vragen: AnalyticsQuery[] = [];
  const api: JwApi = {
    async queryAnalytics(_site, q) {
      vragen.push(q);
      return antwoord(q);
    },
    listMedia: async () => lijst,
    getMedia: async (_site, id) => lijst.find((m) => m.id === id) ?? null,
  };
  return { api, vragen };
}

export function nepCtx(api: JwApi, cap: SiteCapabilities = volleCaps()): Ctx {
  return { api, site: { id: "abcd1234", label: "PSV Play" }, cap, media: mediaIndex(api, "abcd1234", null), archief: null };
}
