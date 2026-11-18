import type { PlayableApi } from "../mcp/servers/playable";
import {
  LEES_SCOPES,
  PLAYABLE_HOST,
  PlayableFout,
  normaliseerCampagne,
  normaliseerStatistieken,
  type PlayableCampagne,
} from "./rapport";

/**
 * Leest de API van Playable voor de MCP-server, met de app-sleutels van
 * Landingspagina's (`PLAYABLE_CLIENT_ID`, `PLAYABLE_SECRET`). Het token vraagt
 * alleen leesrechten (`LEES_SCOPES`) en de client doet alleen GET-verzoeken.
 *
 * Playable vraagt tokens te hergebruiken; daarom een cache per
 * serverinstantie. De campagnelijst wordt een minuut bewaard: één vraag aan de
 * assistent zoekt vaak meerdere keren.
 */

const MAX_PAGINAS = 50;
const LIJST_CACHE_MS = 60_000;

let tokenCache: { clientId: string; token: string; expiresAt: number } | null = null;
let lijstCache: { clientId: string; campagnes: PlayableCampagne[]; at: number } | null = null;

async function leesFout(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { message?: unknown; error?: unknown; error_description?: unknown };
    const bericht = [body.message, body.error_description, body.error].find((v) => typeof v === "string");
    if (bericht) return String(bericht).slice(0, 300);
  } catch {
    // Geen JSON; dan de ruwe tekst.
  }
  return text.slice(0, 300) || res.statusText;
}

export function playableApi(config: { clientId: string; clientSecret: string }, signal?: AbortSignal): PlayableApi {
  async function token(): Promise<string> {
    if (tokenCache && tokenCache.clientId === config.clientId && Date.now() < tokenCache.expiresAt) return tokenCache.token;
    const res = await fetch(`${PLAYABLE_HOST}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: LEES_SCOPES,
      }),
      signal,
    });
    if (!res.ok) throw new PlayableFout(`inloggen mislukt: ${await leesFout(res)}`, res.status);
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new PlayableFout("inloggen gaf geen token terug.", res.status);
    tokenCache = {
      clientId: config.clientId,
      token: data.access_token,
      expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
    };
    return tokenCache.token;
  }

  async function get(pad: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(`${PLAYABLE_HOST}${pad}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${await token()}`, Accept: "application/json" },
      cache: "no-store",
      signal,
    });
    if (!res.ok) throw new PlayableFout(await leesFout(res), res.status);
    return res.json();
  }

  return {
    async campagnes() {
      if (lijstCache && lijstCache.clientId === config.clientId && Date.now() - lijstCache.at < LIJST_CACHE_MS) {
        return lijstCache.campagnes;
      }
      const campagnes: PlayableCampagne[] = [];
      for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
        const body = (await get("/v1/campaigns", { per_page: "100", page: String(pagina) })) as {
          data?: Record<string, unknown>[];
          links?: { next?: string | null };
        };
        campagnes.push(...(body.data ?? []).map(normaliseerCampagne));
        if (!body.links?.next) break;
      }
      lijstCache = { clientId: config.clientId, campagnes, at: Date.now() };
      return campagnes;
    },
    statistieken: async (id) => normaliseerStatistieken(await get(`/v1/campaign/${id}/statistics`)),
    aanmeldingenPerDag: (id) => get(`/v1/campaign/${id}/statistics/registrations`),
  };
}
