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
 * serverinstantie. De campagnelijst wordt tien minuten bewaard: één vraag aan
 * de assistent zoekt vaak meerdere keren, en de lijst is lang.
 *
 * Hoeveel campagnes er per pagina komen, bepaalt Playable (`per_page` wordt
 * niet altijd gevolgd). Daarom leest de client het aantal pagina's uit het
 * eerste antwoord en haalt hij de rest in groepjes tegelijk op.
 */

/** Ruim boven het aantal campagnes van PSV, ook bij 10 per pagina. */
const MAX_PAGINAS = 600;
/** Zoveel pagina's tegelijk. */
const TEGELIJK = 8;
const LIJST_CACHE_MS = 10 * 60_000;

type Pagina = {
  data?: Record<string, unknown>[];
  links?: { next?: string | null };
  meta?: { last_page?: unknown; total?: unknown; per_page?: unknown };
};

let tokenCache: { clientId: string; token: string; expiresAt: number } | null = null;
let lijstCache: { clientId: string; lijst: PlayableCampagne[]; totaal?: number; at: number } | null = null;

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
        return { lijst: lijstCache.lijst, totaal: lijstCache.totaal };
      }
      const pagina = (nummer: number) => get("/v1/campaigns", { per_page: "100", page: String(nummer) }) as Promise<Pagina>;
      const eerste = await pagina(1);
      const paginas: Pagina[] = [eerste];
      const totaal = Number(eerste.meta?.total) || undefined;
      const perPagina = Number(eerste.meta?.per_page) || eerste.data?.length || 0;
      const laatste = Number(eerste.meta?.last_page) || (totaal && perPagina ? Math.ceil(totaal / perPagina) : undefined);

      if (laatste) {
        // Het aantal pagina's is bekend: alles in groepjes tegelijk.
        for (let start = 2; start <= Math.min(laatste, MAX_PAGINAS); start += TEGELIJK) {
          const nummers = Array.from({ length: Math.min(TEGELIJK, Math.min(laatste, MAX_PAGINAS) - start + 1) }, (_, i) => start + i);
          paginas.push(...(await Promise.all(nummers.map(pagina))));
        }
      } else if (eerste.links?.next) {
        // Onbekend: groepjes vooruit, maar alleen tot en met de eerste pagina
        // zonder vervolg; wat daarna in het groepje binnenkwam telt niet mee.
        let klaar = false;
        for (let start = 2; start <= MAX_PAGINAS && !klaar; start += TEGELIJK) {
          const groep = await Promise.all(Array.from({ length: TEGELIJK }, (_, i) => pagina(start + i)));
          for (const p of groep) {
            if (!p.data?.length) {
              klaar = true;
              break;
            }
            paginas.push(p);
            if (!p.links?.next) {
              klaar = true;
              break;
            }
          }
        }
      }

      const perId = new Map<number, PlayableCampagne>();
      for (const p of paginas) for (const raw of p.data ?? []) {
        const campagne = normaliseerCampagne(raw);
        perId.set(campagne.id, campagne);
      }
      const lijst = [...perId.values()];
      lijstCache = { clientId: config.clientId, lijst, totaal, at: Date.now() };
      return { lijst, totaal };
    },
    statistieken: async (id) => normaliseerStatistieken(await get(`/v1/campaign/${id}/statistics`)),
    aanmeldingenPerDag: (id) => get(`/v1/campaign/${id}/statistics/registrations`),
  };
}
