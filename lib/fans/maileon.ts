/**
 * Maileon voor Active & Engaged Fans: welke contacten met een SSO-id op een dag
 * in een e-mail klikten. Dezelfde regels als contactfilter 6027: het contactveld
 * `SSOID` is gevuld, en het contact klikte minstens één keer.
 *
 * Per dag, zodat de dagelijkse run alleen de nieuwe klikken leest en de eerste
 * vulling (vanaf 1 juli) over meerdere runs verdeeld kan worden. De SSO-id's
 * gaan alleen als hash de opslag in (`sets.ts`).
 *
 * Eerst `/reports/clicks/unique` (één regel per contact en mailing). Kent
 * Maileon dat niet, dan `/reports/clicks` (elke klik). De uitkomst is dezelfde,
 * want de run ontdubbelt; alleen het aantal pagina's verschilt.
 */

import { MAILEON_HOST, MAILEON_MIME, MaileonFout } from "../maileon/rapport";
import { normaliseerSso } from "./sets";
import { amsterdamMiddernacht, plusDagen } from "./tijd";

export const SSO_VELD = "SSOID";
export const ENDPOINTS = ["/reports/clicks/unique", "/reports/clicks"] as const;
const PAGINA = 1000;
/** Ruim boven een drukke dag; daarboven is er iets mis met de vraag. */
const MAX_PAGINAS = 300;
const WACHTTIJDEN_MS = [2_000, 5_000, 15_000];

export interface MaileonKlikken {
  /** De genormaliseerde SSO-id's van wie op `dag` klikte (Nederlandse tijd), met dubbelen. */
  klikkersOpDag(dag: string): Promise<string[]>;
  /** Het endpoint dat werkt, zodra dat bekend is. */
  endpoint(): string | null;
}

function decodeer(tekst: string): string {
  return tekst
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function blokken(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi"))].map((m) => m[1]);
}

function inhoud(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeer(m[1]) : null;
}

/** Het SSO-id uit één `<contact>`: als `<field><name>SSOID</name><value>…` of als `<SSOID>…`. */
function ssoUitContact(contact: string): string | null {
  for (const veld of blokken(contact, "field")) {
    if (inhoud(veld, "name")?.toUpperCase() === SSO_VELD) return normaliseerSso(inhoud(veld, "value"));
  }
  return normaliseerSso(inhoud(contact, SSO_VELD));
}

/**
 * Leest een pagina van een klikrapport: het aantal regels (voor het pagineren)
 * en de SSO-id's van de contacten die er een hebben.
 */
export function leesKlikPagina(xml: string): { regels: number; ids: string[] } {
  const contacten = blokken(xml, "contact");
  const ids: string[] = [];
  for (const c of contacten) {
    const id = ssoUitContact(c);
    if (id) ids.push(id);
  }
  return { regels: contacten.length, ids };
}

export function maileonKlikken(
  config: { apiKey: string },
  opties: { doeFetch?: typeof fetch; wachttijden?: number[]; endpoint?: string | null } = {}
): MaileonKlikken {
  const auth = `Basic ${Buffer.from(config.apiKey).toString("base64")}`;
  const doeFetch = opties.doeFetch ?? fetch;
  const wachttijden = opties.wachttijden ?? WACHTTIJDEN_MS;
  let werkend: string | null = opties.endpoint ?? null;

  async function get(pad: string, params: [string, string][]): Promise<{ xml: string; paginas: number | null }> {
    const url = new URL(`${MAILEON_HOST}${pad}`);
    for (const [k, v] of params) url.searchParams.append(k, v);
    for (let poging = 0; ; poging++) {
      let res: Response;
      try {
        res = await doeFetch(url, { headers: { Authorization: auth, Accept: MAILEON_MIME }, cache: "no-store" });
      } catch (err) {
        if (poging < wachttijden.length) {
          await new Promise((r) => setTimeout(r, wachttijden[poging]));
          continue;
        }
        throw err;
      }
      const tekst = await res.text();
      if (res.ok) {
        const paginas = Number(res.headers.get("X-Pages"));
        return { xml: tekst, paginas: Number.isFinite(paginas) && paginas > 0 ? paginas : null };
      }
      // Te veel verzoeken of een storing bij Maileon: even wachten en opnieuw.
      if ((res.status === 429 || res.status >= 500) && poging < wachttijden.length) {
        await new Promise((r) => setTimeout(r, wachttijden[poging]));
        continue;
      }
      const melding = tekst.match(/<message>([\s\S]*?)<\/message>/)?.[1]?.trim() || tekst.slice(0, 200) || res.statusText;
      throw new MaileonFout(melding, res.status);
    }
  }

  async function leesDag(pad: string, dag: string): Promise<string[]> {
    const van = amsterdamMiddernacht(dag);
    const tot = amsterdamMiddernacht(plusDagen(dag, 1));
    const ids: string[] = [];
    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const { xml, paginas } = await get(pad, [
        ["from_date", String(van)],
        ["to_date", String(tot)],
        ["exclude_anonymous_clicks", "true"],
        ["custom_field", SSO_VELD],
        ["page_index", String(pagina)],
        ["page_size", String(PAGINA)],
      ]);
      const deel = leesKlikPagina(xml);
      ids.push(...deel.ids);
      if (deel.regels < PAGINA || (paginas != null && pagina >= paginas)) return ids;
    }
    throw new MaileonFout(`Meer dan ${MAX_PAGINAS * PAGINA} klikken op ${dag}; de telling is gestopt.`, 500);
  }

  return {
    async klikkersOpDag(dag) {
      if (werkend) return leesDag(werkend, dag);
      for (const pad of ENDPOINTS) {
        try {
          const ids = await leesDag(pad, dag);
          werkend = pad;
          return ids;
        } catch (err) {
          // Een onbekend endpoint: het volgende proberen. Al het andere is een echte fout.
          if (err instanceof MaileonFout && (err.status === 404 || err.status === 405) && pad !== ENDPOINTS.at(-1)) continue;
          throw err;
        }
      }
      throw new MaileonFout("Geen klikrapport beschikbaar bij Maileon.", 404);
    },
    endpoint: () => werkend,
  };
}
