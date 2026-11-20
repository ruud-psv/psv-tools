import { createHash } from "node:crypto";

import { MAX_NAAM, NAAM_ADVIES, conceptNaam } from "./concept-naam";
import { MAILEON_HOST, MAILEON_MIME, MaileonFout } from "./rapport";

export { MAX_NAAM, NAAM_ADVIES, conceptNaam };

/**
 * Concepten in Maileon: een mailing aanmaken of bijwerken met HTML, onderwerp
 * en preview-tekst, en het voorbeeld ophalen zoals Maileon het opbouwt.
 *
 * Bewust beperkt. Deze module kan een mailing niet versturen, niet inplannen
 * en geen doelgroep kiezen: er staat geen aanroep naar `sendnow`, `schedule`
 * of `targetgroupid` in, en een test bewaakt dat. Versturen en de doelgroep
 * (met de preference-regel, die de API niet aankan) blijven in Maileon, bij
 * Digital Marketing.
 *
 * Bijwerken mag alleen zolang de mailing een concept (`draft`) is én niemand
 * hem in Maileon heeft aangepast sinds PSV Tools hem zette. Dat laatste
 * controleren we met een hash van de HTML zoals Maileon hem teruggaf direct
 * na het zetten: Maileon past de HTML bij het opslaan zelf aan, dus een hash
 * van wat wij stuurden zou nooit kloppen.
 *
 * API (REST v1.0):
 * - `POST /mailings?name=…&subject=…` → 201, het ID als tekst
 * - `POST /mailings/{id}/contents/html` → 204, body `text/html`
 * - `POST /mailings/{id}/contents/subject` en `/contents/previewtext` → 204
 * - `GET /mailings/{id}/contents/html`, `/state` en `/preview?format=html`
 *
 * Het voorbeeld wordt opgehaald zonder e-mailadres of contact-ID: Maileon
 * vult dan een algemeen contact in, zodat er geen persoonsgegevens in staan.
 * Geef hier nooit een echt contact mee; het voorbeeld komt achter een deellink.
 */

/** Wat we van een concept onthouden om het later veilig bij te werken. */
export interface ConceptStand {
  mailingId: number;
  /** Hash van de HTML zoals Maileon hem na het zetten teruggaf. */
  hash: string;
}

export interface ConceptInvoer {
  /** Naam in Maileon: uniek, 3 tot 64 tekens. */
  naam: string;
  onderwerp: string;
  previewTekst?: string;
  /** De HTML uit de export van de Mail Builder, zonder de opgeslagen staat. */
  html: string;
}

export interface ConceptUitkomst extends ConceptStand {
  /** Nieuw aangemaakt (true) of een bestaand concept bijgewerkt (false). */
  nieuw: boolean;
  /** Het eerdere concept bestond niet meer in Maileon; er is een nieuw gemaakt. */
  vervangen: boolean;
}

/** Een reden om niet door te gaan, met de HTTP-status voor de route. */
export class ConceptFout extends Error {
  readonly status: number;
  readonly code: "invoer" | "geen-concept" | "aangepast";
  constructor(message: string, status: number, code: ConceptFout["code"]) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/* ---------- Invoer ---------- */

export const MAX_ONDERWERP = 1023;
export const MAX_PREVIEW_TEKST = 300;
/** Ruim boven een gewone mail (zo'n 50 tot 150 kB), maar geen willekeurig groot bestand. */
export const MAX_HTML = 1_500_000;

const DMID = /^[A-Za-z0-9-]{2,30}$/;
// Tab, regeleinde en dergelijke: Maileon weigert ze in het onderwerp.
const STUURTEKENS = /[\u0000-\u001f\u007f-\u009f]/;
const STAAT = /\s*<!--\s*mailbuilder-state:[\s\S]*?-->\s*$/;

/** Haalt de opgeslagen staat van de Mail Builder van het eind van de HTML. */
export function zonderStaat(html: string): string {
  return html.replace(STAAT, "");
}

export interface SchoneInvoer extends ConceptInvoer {
  dmid?: string;
  /** Altijd een nieuw concept maken, ook als er al een is. */
  nieuw: boolean;
}

function tekst(waarde: unknown): string {
  return typeof waarde === "string" ? waarde.trim() : "";
}

/** Controleert wat de pagina meestuurt. Geeft de schone invoer of een melding. */
export function controleerInvoer(body: unknown): SchoneInvoer | { fout: string } {
  if (!body || typeof body !== "object") return { fout: "Ongeldige invoer." };
  const b = body as Record<string, unknown>;

  const html = typeof b.html === "string" ? zonderStaat(b.html).trim() : "";
  if (!html) return { fout: "Kies eerst de HTML van de mail." };
  if (html.length > MAX_HTML) return { fout: "De HTML is te groot voor één mail." };
  if (!/<html[\s>]/i.test(html)) return { fout: "Dit lijkt geen HTML van een mail: er staat geen <html> in." };

  const dmid = tekst(b.dmid);
  if (dmid && !DMID.test(dmid)) return { fout: "De DMID mag alleen letters, cijfers en streepjes bevatten, zoals DMID26-22619." };

  const naam = conceptNaam(tekst(b.naam), dmid);
  if (naam.length < 3) return { fout: "Geef de mail een naam van minstens 3 tekens." };
  if (naam.length > MAX_NAAM) return { fout: `De naam in Maileon wordt ${naam.length} tekens; maak de mailnaam korter.` };

  const onderwerp = tekst(b.onderwerp);
  if (!onderwerp) return { fout: "Vul het onderwerp in." };
  if (onderwerp.length > MAX_ONDERWERP) return { fout: `Het onderwerp mag hooguit ${MAX_ONDERWERP} tekens zijn.` };
  if (STUURTEKENS.test(onderwerp)) return { fout: "Het onderwerp bevat een tab of regeleinde; Maileon staat dat niet toe." };

  const previewTekst = tekst(b.previewTekst);
  if (previewTekst.length > MAX_PREVIEW_TEKST) return { fout: `De preview-tekst mag hooguit ${MAX_PREVIEW_TEKST} tekens zijn.` };

  return {
    naam,
    onderwerp,
    html,
    nieuw: b.nieuw === true,
    ...(previewTekst && { previewTekst }),
    ...(dmid && { dmid }),
  };
}

/* ---------- Antwoorden van Maileon lezen ---------- */

/** Hash van HTML, ongevoelig voor regeleinden en witruimte aan de randen. */
export function htmlHash(html: string): string {
  return createHash("sha256").update(html.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

/** Het ID uit het antwoord op het aanmaken: het getal als tekst, of `<id>` in XML. */
export function leesId(tekst: string): number | null {
  const kaal = tekst.trim();
  const ruw = /^\d+$/.test(kaal) ? kaal : kaal.match(/<id>\s*(\d+)\s*<\/id>/)?.[1];
  const id = ruw ? Number(ruw) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** De status uit `GET /mailings/{id}/state`: `<state>draft</state>`, of alleen het woord. */
export function leesStatus(tekst: string): string {
  const uitTag = tekst.match(/<state>\s*(?:<!\[CDATA\[)?\s*([a-z_]+)\s*(?:\]\]>)?\s*<\/state>/i)?.[1];
  return (uitTag ?? tekst.trim()).toLowerCase();
}

function ontsnap(xml: string): string {
  return xml
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * De HTML uit het antwoord op `GET /mailings/{id}/preview`. De documentatie
 * noemt een veld `html`; of dat JSON of XML is, hangt af van het account.
 * Daarom: JSON met `html`, XML met een CDATA-blok of geëscapete HTML, of
 * gewoon de HTML zelf. `null` als er niets bruikbaars in staat.
 */
export function leesVoorbeeld(tekst: string): string | null {
  const kaal = tekst.trim();
  if (!kaal) return null;

  if (kaal.startsWith("{")) {
    try {
      const json = JSON.parse(kaal) as { html?: unknown; preview?: { html?: unknown } };
      const html = typeof json.html === "string" ? json.html : json.preview?.html;
      return typeof html === "string" && html.trim() ? html : null;
    } catch {
      return null;
    }
  }

  if (/^<!doctype html|^<html[\s>]/i.test(kaal)) return kaal;

  // Een CDATA-blok kan in stukken staan als de HTML zelf "]]>" bevat.
  const cdata = [...kaal.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)].map((m) => m[1]).join("");
  if (/<html[\s>]/i.test(cdata)) return cdata;

  const binnen = kaal.match(/<html>([\s\S]*)<\/html>\s*(?:<\/[a-z_]+>\s*)*$/i)?.[1];
  if (binnen && /&lt;html[\s&]/i.test(binnen)) return ontsnap(binnen).trim();

  return null;
}

/** XML-body voor de setters, met de tekst in CDATA (en een eventuele "]]>" gesplitst). */
export function cdataXml(tag: string, waarde: string): string {
  const veilig = waarde.replace(/\]\]>/g, "]]]]><![CDATA[>");
  return `<?xml version="1.0" encoding="UTF-8"?><${tag}><![CDATA[${veilig}]]></${tag}>`;
}

/* ---------- Voorbeeld zonder Maileon ---------- */

const EXPORT_CDN = "[[MAILING|PROTOCOL|http]]://[[ACCOUNT|MAILING-DOMAIN]]";
const VOORBEELD_CDN = "https://images.maileon-static.com";

function escapeHtml(tekst: string): string {
  return tekst.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Een voorbeeld uit de export zelf, voor als Maileon er geen geeft: beelden
 * van het CDN van Maileon, links zonder token, onderwerp en preview-tekst
 * ingevuld, en de overige Maileon-tokens weg. Dynamische velden blijven dan
 * leeg, dus het is minder echt dan het voorbeeld van Maileon.
 */
export function voorbeeldUitExport(html: string, onderwerp: string, previewTekst = ""): string {
  return (
    html
      .split(EXPORT_CDN).join(VOORBEELD_CDN)
      // Een link kan zelf tokens bevatten (`[% email]`, `[MAILING|ID|]`): tot de eerste `]]`, binnen het attribuut.
      .replace(/\[\[LINK\|([^"]*?)\]\](?!\])/g, "$1")
      .replace(/\[\[MAILING\|SUBJECT\|[^\]]*\]\]/g, escapeHtml(onderwerp))
      .replace(/\[\[PREVIEW-TEXT\|[^\]]*\]\]/g, escapeHtml(previewTekst))
      .replace(/\[\[[\s\S]*?\]\]/g, "")
      // Wat er over is van de tokens in links: `[% …]` en `[NAAM|…]`.
      .replace(/\[(?:%[^\]]*|[A-Z][A-Z-]*\|[^\]]*)\]/g, "")
  );
}

/* ---------- De client ---------- */

export interface MaileonConceptApi {
  maakAan(naam: string, onderwerp: string): Promise<number>;
  zetHtml(id: number, html: string): Promise<void>;
  zetOnderwerp(id: number, onderwerp: string): Promise<void>;
  zetPreviewTekst(id: number, tekst: string): Promise<void>;
  leesHtml(id: number): Promise<string>;
  leesStatus(id: number): Promise<string>;
  /** De HTML van het voorbeeld, of `null` als Maileon er geen bruikbare gaf. */
  leesVoorbeeld(id: number): Promise<string | null>;
}

function maileonMelding(tekst: string): string {
  try {
    const json = JSON.parse(tekst) as { message?: unknown; error?: { message?: unknown } };
    if (typeof json?.error?.message === "string") return json.error.message;
    if (typeof json?.message === "string") return json.message;
  } catch {
    const xml = tekst.match(/<message>([\s\S]*?)<\/message>/)?.[1];
    if (xml) return xml.trim();
  }
  return tekst.trim().slice(0, 300);
}

export function maileonConceptApi(
  config: { apiKey: string },
  doeFetch: typeof fetch = fetch
): MaileonConceptApi {
  const auth = `Basic ${Buffer.from(config.apiKey).toString("base64")}`;

  async function vraag(
    methode: "GET" | "POST",
    pad: string,
    opties: { params?: Record<string, string>; body?: string; type?: string; accept?: string } = {}
  ): Promise<string> {
    const url = new URL(`${MAILEON_HOST}${pad}`);
    for (const [k, v] of Object.entries(opties.params ?? {})) url.searchParams.set(k, v);
    const headers: Record<string, string> = { Authorization: auth, Accept: opties.accept ?? MAILEON_MIME };
    if (methode === "POST") headers["Content-Type"] = opties.type ?? `${MAILEON_MIME}; charset=utf-8`;
    const res = await doeFetch(url, { method: methode, headers, body: opties.body, cache: "no-store" });
    const antwoord = await res.text();
    if (!res.ok) throw new MaileonFout(maileonMelding(antwoord) || res.statusText, res.status);
    return antwoord;
  }

  return {
    async maakAan(naam, onderwerp) {
      const antwoord = await vraag("POST", "/mailings", { params: { name: naam, subject: onderwerp, type: "regular" } });
      const id = leesId(antwoord);
      if (!id) throw new MaileonFout(`Maileon gaf geen ID van de mailing terug (${antwoord.slice(0, 100)}).`, 502);
      return id;
    },
    async zetHtml(id, html) {
      // De export gebruikt al Maileon-tokens voor beelden en links: beelden
      // staan in Maileon (grabbing zou de tokens niet kunnen ophalen) en de
      // links zijn al `[[LINK|…]]`.
      await vraag("POST", `/mailings/${id}/contents/html`, {
        params: { doImageGrabbing: "false", doLinkTracking: "false" },
        body: html,
        type: "text/html; charset=utf-8",
      });
    },
    async zetOnderwerp(id, onderwerp) {
      await vraag("POST", `/mailings/${id}/contents/subject`, { body: cdataXml("subject", onderwerp) });
    },
    async zetPreviewTekst(id, tekst) {
      await vraag("POST", `/mailings/${id}/contents/previewtext`, { body: cdataXml("previewtext", tekst) });
    },
    async leesHtml(id) {
      return vraag("GET", `/mailings/${id}/contents/html`, { accept: "text/html, */*" });
    },
    async leesStatus(id) {
      return leesStatus(await vraag("GET", `/mailings/${id}/state`));
    },
    async leesVoorbeeld(id) {
      return leesVoorbeeld(await vraag("GET", `/mailings/${id}/preview`, { params: { format: "html" } }));
    },
  };
}

/* ---------- Concept zetten ---------- */

/**
 * Zet de mail als concept in Maileon. Met een eerdere stand wordt dat concept
 * bijgewerkt, maar alleen als het nog `draft` is en de HTML in Maileon niet is
 * veranderd sinds PSV Tools hem zette. Bestaat het eerdere concept niet meer,
 * dan komt er een nieuw.
 */
export async function zetConcept(
  api: MaileonConceptApi,
  invoer: ConceptInvoer,
  eerder?: ConceptStand
): Promise<ConceptUitkomst> {
  let vervangen = false;

  if (eerder) {
    let status: string | null;
    try {
      status = await api.leesStatus(eerder.mailingId);
    } catch (err) {
      if (!(err instanceof MaileonFout && err.status === 404)) throw err;
      status = null;
    }

    if (status === null) {
      vervangen = true;
    } else {
      if (status !== "draft") {
        throw new ConceptFout(
          `Mailing ${eerder.mailingId} is in Maileon geen concept meer (status: ${status}). PSV Tools past hem daarom niet aan.`,
          409,
          "geen-concept"
        );
      }
      if (htmlHash(await api.leesHtml(eerder.mailingId)) !== eerder.hash) {
        throw new ConceptFout(
          `Mailing ${eerder.mailingId} is in Maileon aangepast sinds PSV Tools hem zette. Die wijzigingen worden niet overschreven. Maak een nieuw concept, of verwerk de wijziging in Maileon zelf.`,
          409,
          "aangepast"
        );
      }
      await api.zetHtml(eerder.mailingId, invoer.html);
      await api.zetOnderwerp(eerder.mailingId, invoer.onderwerp);
      if (invoer.previewTekst) await api.zetPreviewTekst(eerder.mailingId, invoer.previewTekst);
      const hash = htmlHash(await api.leesHtml(eerder.mailingId));
      return { mailingId: eerder.mailingId, hash, nieuw: false, vervangen: false };
    }
  }

  const mailingId = await api.maakAan(invoer.naam, invoer.onderwerp);
  await api.zetHtml(mailingId, invoer.html);
  if (invoer.previewTekst) await api.zetPreviewTekst(mailingId, invoer.previewTekst);
  const hash = htmlHash(await api.leesHtml(mailingId));
  return { mailingId, hash, nieuw: true, vervangen };
}
