import type { MaileonApi } from "../mcp/servers/maileon";
import { MAILEON_HOST, MAILEON_MIME, MaileonFout, leesMailings, leesResultaten, type Mailing, type Resultaat } from "./rapport";

/**
 * Leest Maileon voor de MCP-server, met dezelfde sleutel als DM Performance
 * (`MAILEON_API_KEY`). Alleen GET, en alleen twee endpoints: de lijst met
 * mailings en de samenvatting van de resultaten per mailing. De sleutel kan
 * meer (contacten, versturen); deze client gebruikt dat bewust niet.
 */

const PAGINA = 1000;
const MAX_PAGINAS = 5;
/** Zoveel mailings per verzoek om resultaten, zoals DM Performance. */
const PER_VERZOEK = 50;
const LIJST_CACHE_MS = 5 * 60_000;

let lijstCache: { van: string; mailings: Mailing[]; at: number } | null = null;

export function maileonApi(config: { apiKey: string }, signal?: AbortSignal): MaileonApi {
  const auth = `Basic ${Buffer.from(config.apiKey).toString("base64")}`;

  async function get(pad: string, params: [string, string][]): Promise<string> {
    const url = new URL(`${MAILEON_HOST}${pad}`);
    for (const [key, value] of params) url.searchParams.append(key, value);
    const res = await fetch(url, { headers: { Authorization: auth, Accept: MAILEON_MIME }, cache: "no-store", signal });
    const tekst = await res.text();
    if (!res.ok) {
      const melding = tekst.match(/<message>([\s\S]*?)<\/message>/)?.[1]?.trim() || tekst.slice(0, 200) || res.statusText;
      throw new MaileonFout(melding, res.status);
    }
    return tekst;
  }

  return {
    async mailingsSinds(van) {
      if (lijstCache && lijstCache.van === van && Date.now() - lijstCache.at < LIJST_CACHE_MS) return lijstCache.mailings;
      const mailings: Mailing[] = [];
      for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
        const xml = await get("/mailings/filter/scheduletime", [
          ["scheduleTime", `${van} 00:00:00`],
          ["beforeSchedulingTime", "false"],
          ["fields", "name"],
          ["fields", "state"],
          ["fields", "type"],
          ["fields", "scheduleTime"],
          ["page_size", String(PAGINA)],
          ["page_index", String(pagina)],
        ]);
        const deel = leesMailings(xml);
        mailings.push(...deel);
        if (deel.length < PAGINA) break;
      }
      lijstCache = { van, mailings, at: Date.now() };
      return mailings;
    },
    async resultaten(ids) {
      const resultaten: Resultaat[] = [];
      for (let i = 0; i < ids.length; i += PER_VERZOEK) {
        const xml = await get("/reports/mailing_summaries", ids.slice(i, i + PER_VERZOEK).map((id) => ["mailing_id", String(id)]));
        resultaten.push(...leesResultaten(xml));
      }
      return resultaten;
    },
  };
}
