/**
 * Maileon voor de MCP-server van PSV Tools (`lib/mcp/servers/maileon.ts`).
 * Puur: de XML van Maileon lezen, verstuurde mailings zoeken, en resultaten
 * als tekst voor een model. Dezelfde gegevens als DM Performance
 * (`app/api/maileon/route.ts`), die ongewijzigd blijft.
 *
 * Alleen totalen per mailing: geen contacten, geen klikken per persoon.
 */

export const MAILEON_HOST = "https://api.maileon.com/1.0";
export const MAILEON_MIME = "application/vnd.maileon.api+xml";

export const MAX_RIJEN = 200;
export const MAX_MAILINGS_PER_VRAAG = 300;
const DAG = /^\d{4}-\d{2}-\d{2}$/;

/** Ontbrekende instelling aan de kant van PSV Tools. */
export class MaileonConfigError extends Error {}
/** Een fout in de vraag, die het model kan herstellen. */
export class MaileonInvoerFout extends Error {}
/** Maileon gaf een fout terug. */
export class MaileonFout extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function maileonConfig(env: Record<string, string | undefined> = process.env): { apiKey: string } {
  const apiKey = env.MAILEON_API_KEY?.trim();
  if (!apiKey) throw new MaileonConfigError("Maileon-configuratie ontbreekt: MAILEON_API_KEY.");
  return { apiKey };
}

/* ---------- XML ---------- */

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
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1]);
}

function inhoud(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? decodeer(m[1]) : "";
}

function getal(xml: string, tag: string): number {
  const n = Number(inhoud(xml, tag));
  return Number.isFinite(n) ? n : 0;
}

export interface Mailing {
  id: number;
  naam: string;
  type: string;
  status: string;
  /** Verzendmoment zoals Maileon het geeft: "JJJJ-MM-DD UU:MM:SS". */
  verzonden: string;
}

/** `<mailings><mailing><id/><fields><field><name/><value/></field>…` */
export function leesMailings(xml: string): Mailing[] {
  return blokken(xml, "mailing").map((blok) => {
    const id = getal(blok, "id");
    const velden: Record<string, string> = {};
    for (const veld of blokken(blok, "field")) {
      const naam = inhoud(veld, "name");
      if (naam) velden[naam] = inhoud(veld, "value");
    }
    return {
      id,
      naam: velden.name || `Mailing ${id}`,
      type: velden.type || "regular",
      status: velden.state || "",
      verzonden: velden.scheduleTime || "",
    };
  });
}

export interface Resultaat {
  mailingId: number;
  ontvangers: number;
  geopend: number;
  uniekGeopend: number;
  geklikt: number;
  uniekGeklikt: number;
  bounces: number;
  afmeldingen: number;
}

/** `<mailing_summaries><mailing_summary>…` */
export function leesResultaten(xml: string): Resultaat[] {
  return blokken(xml, "mailing_summary").map((blok) => ({
    mailingId: getal(blok, "mailing_id"),
    ontvangers: getal(blok, "recipients"),
    geopend: getal(blok, "opens"),
    uniekGeopend: getal(blok, "opens_unique"),
    geklikt: getal(blok, "clicks"),
    uniekGeklikt: getal(blok, "clicks_unique"),
    bounces: getal(blok, "bounces"),
    afmeldingen: getal(blok, "unsubscriptions"),
  }));
}

/* ---------- Zoeken ---------- */

/** Kleine letters, zonder accenten, spaties en leestekens: "Coen Dillen" vindt ook "coendillen". */
function plat(tekst: string): string {
  return tekst
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export interface PeriodeInvoer {
  van: string;
  tot: string;
  zoek?: string;
  mailing_ids?: number[];
  limiet?: number;
}

export function controleerPeriode(invoer: Pick<PeriodeInvoer, "van" | "tot">): void {
  if (!DAG.test(invoer.van) || !DAG.test(invoer.tot)) throw new MaileonInvoerFout("Geef van en tot als JJJJ-MM-DD.");
  if (invoer.van > invoer.tot) throw new MaileonInvoerFout("van ligt na tot.");
}

/**
 * De verstuurde mailings in de periode (status done of archived, verzonden
 * tussen van en tot), eventueel gefilterd op een zoekterm of id's; nieuwste eerst.
 */
export function verstuurd(mailings: Mailing[], invoer: PeriodeInvoer): Mailing[] {
  const term = invoer.zoek?.trim() ?? "";
  const platteTerm = plat(term);
  const ids = invoer.mailing_ids?.length ? new Set(invoer.mailing_ids) : null;
  return mailings
    .filter((m) => m.status === "done" || m.status === "archived")
    .filter((m) => {
      const dag = m.verzonden.slice(0, 10);
      return !dag || (dag >= invoer.van && dag <= invoer.tot);
    })
    .filter((m) => !ids || ids.has(m.id))
    .filter((m) => !term || m.naam.toLowerCase().includes(term.toLowerCase()) || (platteTerm.length > 0 && plat(m.naam).includes(platteTerm)))
    .sort((a, b) => b.verzonden.localeCompare(a.verzonden));
}

function limiet(waarde: number | undefined, standaard: number): number {
  if (!waarde || !Number.isFinite(waarde)) return standaard;
  return Math.min(Math.max(1, Math.floor(waarde)), MAX_RIJEN);
}

function kop(invoer: PeriodeInvoer, wat: string, aantal: number): string {
  const filter = [invoer.zoek && `met "${invoer.zoek}"`, invoer.mailing_ids?.length && `id's ${invoer.mailing_ids.join(", ")}`].filter(Boolean).join(", ");
  return `MAILEON · ${wat} verstuurd van ${invoer.van} tot en met ${invoer.tot}${filter ? ` (${filter})` : ""} · ${aantal} gevonden`;
}

export function mailingsTekst(gevonden: Mailing[], invoer: PeriodeInvoer): string {
  const getoond = gevonden.slice(0, limiet(invoer.limiet, 50));
  const regels = [kop(invoer, "mailings", gevonden.length)];
  if (getoond.length === 0) {
    regels.push("Geen verstuurde mailings gevonden. Probeer een langere periode, een ander woord of een deel van het DMID-nummer.");
    return regels.join("\n");
  }
  regels.push("", "verzonden | id | naam | type", ...getoond.map((m) => [m.verzonden, m.id, m.naam, m.type].join(" | ")));
  if (gevonden.length > getoond.length) regels.push("", `Er zijn er meer (${gevonden.length}); zoek specifieker of vraag een hogere limiet.`);
  return regels.join("\n");
}

function pct(deel: number, geheel: number): string {
  return geheel > 0 ? (Math.round((deel / geheel) * 1000) / 10).toFixed(1) : "–";
}

export function resultatenTekst(gevonden: Mailing[], resultaten: Resultaat[], invoer: PeriodeInvoer): string {
  const perId = new Map(resultaten.map((r) => [r.mailingId, r]));
  const getoond = gevonden.slice(0, limiet(invoer.limiet, 50));
  const regels = [kop(invoer, "resultaten van mailings", gevonden.length)];
  if (gevonden.length === 0) {
    regels.push("Geen verstuurde mailings gevonden. Zoek eerst met mailings, of probeer een langere periode.");
    return regels.join("\n");
  }
  regels.push(
    "Open % = uniek geopend / ontvangers; klik % = uniek geklikt / ontvangers; CTOR = uniek geklikt / uniek geopend.",
    "",
    "verzonden | id | naam | ontvangers | uniek geopend | open % | uniek geklikt | klik % | CTOR % | bounces | afmeldingen"
  );
  const totaal = { ontvangers: 0, uniekGeopend: 0, uniekGeklikt: 0, bounces: 0, afmeldingen: 0, zonder: 0 };
  for (const m of gevonden) {
    const r = perId.get(m.id);
    if (!r) {
      totaal.zonder += 1;
      continue;
    }
    totaal.ontvangers += r.ontvangers;
    totaal.uniekGeopend += r.uniekGeopend;
    totaal.uniekGeklikt += r.uniekGeklikt;
    totaal.bounces += r.bounces;
    totaal.afmeldingen += r.afmeldingen;
  }
  for (const m of getoond) {
    const r = perId.get(m.id);
    regels.push(
      r
        ? [m.verzonden, m.id, m.naam, r.ontvangers, r.uniekGeopend, pct(r.uniekGeopend, r.ontvangers), r.uniekGeklikt, pct(r.uniekGeklikt, r.ontvangers), pct(r.uniekGeklikt, r.uniekGeopend), r.bounces, r.afmeldingen].join(" | ")
        : [m.verzonden, m.id, m.naam, "geen resultaten"].join(" | ")
    );
  }
  regels.push(
    [
      `TOTAAL (${gevonden.length - totaal.zonder} mailings)`,
      "",
      "",
      totaal.ontvangers,
      totaal.uniekGeopend,
      pct(totaal.uniekGeopend, totaal.ontvangers),
      totaal.uniekGeklikt,
      pct(totaal.uniekGeklikt, totaal.ontvangers),
      pct(totaal.uniekGeklikt, totaal.uniekGeopend),
      totaal.bounces,
      totaal.afmeldingen,
    ].join(" | ")
  );
  if (gevonden.length > getoond.length) regels.push("", `De tabel toont ${getoond.length} van ${gevonden.length} mailings; het totaal telt ze allemaal.`);
  if (totaal.zonder > 0) regels.push("", `${totaal.zonder} mailings hebben (nog) geen resultaten in Maileon en tellen niet mee in het totaal.`);
  return regels.join("\n");
}
