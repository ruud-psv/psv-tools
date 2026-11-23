import { queryCache } from "./cache";
import { capabilitiesVoor } from "./capabilities";
import { jwApi, jwRuw } from "./client";
import { mediaIndex } from "./media";
import type { Verzoeker } from "./probe";
import type { Ctx } from "./rapport";
import { kiesSite, leesSecret, leesSites, type JwSite } from "./sites";
import { blobArchief } from "./snapshot";
import { blobOpslag, type Opslag } from "./store";

/**
 * Alles wat een route of MCP-tool nodig heeft voor één property: de client
 * (met cache), de capabilities, de media-index en het archief. Alleen op de
 * server: het secret komt uit `JWPLAYER_SECRET`.
 */

export function probeVerzoeker(secret: string, signal?: AbortSignal): Verzoeker {
  const { ruw } = jwRuw({ secret }, { signal });
  return ({ method, pad, body }) => ruw(method, pad, body);
}

export interface PsvPlayOmgeving {
  sites: JwSite[];
  ctx(siteId?: string | null): Promise<Ctx>;
}

export function psvPlayOmgeving(opties: { opslag?: Opslag; signal?: AbortSignal; env?: Record<string, string | undefined> } = {}): PsvPlayOmgeving {
  const env = opties.env ?? process.env;
  const opslag = opties.opslag ?? blobOpslag;
  const sites = leesSites(env);
  return {
    sites,
    async ctx(siteId) {
      const secret = leesSecret(env);
      const site = kiesSite(sites, siteId);
      const api = jwApi({ secret }, { cache: queryCache(opslag), signal: opties.signal });
      const cap = await capabilitiesVoor(site, sites, probeVerzoeker(secret, opties.signal), opslag);
      return { api, site, cap, media: mediaIndex(api, site.id, opslag), archief: blobArchief(opslag) };
    },
  };
}
