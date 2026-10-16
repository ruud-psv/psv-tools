/**
 * Contactfilters en doelgroepen in Maileon maken via de API. Gedeeld door de
 * tools die een lijst naar Maileon doorzetten: Aangrenzende stoelen (alleen het
 * filter) en Contact Filter Import (filter en doelgroep).
 *
 * Een filter begint leeg en voegt iedereen toe van wie een veld in de lijst
 * staat. Welke preference-regel erbij hoort (bijvoorbeeld Ticketing voor
 * kaartverkoop), bepaalt Digital Marketing in Maileon zelf. De API wijst
 * filters met een `contactpreference`-regel af (zie
 * `lib/aangrenzende-stoelen/maileon.ts`), dus die regel kan er niet vanaf hier bij.
 *
 * API: `POST /contactfilters/v2` voor het filter, `POST /targetgroups` voor een
 * doelgroep erop. De regels moeten voldoen aan het JSON-schema in de
 * XQueue-wiki ("Creating and Updating Contactfilters Using the REST API"), niet
 * aan de losse documentatiepagina's: die spreken elkaar tegen.
 */

export const MAILEON_API = "https://api.maileon.com/1.0";

/** De webinterface van het PSV-account, voor de link naar het filter. */
export const MAILEON_WEBAPP = "https://psv-news-mailer.maileon.com/eagle_kp_webapp";

/**
 * Custom veld in Maileon met het relatienummer. Er bestaat ook `MEMBERNUMBER`,
 * maar dat is níet het relatienummer.
 */
export const RELATION_NUMBER_FIELD = "MEMBERNUMBERPRIOR";

/**
 * Operator voor "waarde staat in deze lijst", volgens het JSON-schema. (De
 * wiki-tekst schrijft `includein`; dat kent het schema niet.)
 */
export const IN_LIST_OPERATION = "includedin";

/** Het schema staat hooguit 100 waarden per regel toe; meer gaat in extra regels. */
export const MAX_VALUES_PER_RULE = 100;

/** Maileon staat hooguit 100 regels per filter toe. */
export const MAX_RULES = 100;

/** Eén regel blijft vrij voor de preference-regel die in Maileon zelf wordt toegevoegd. */
export const MAX_FILTER_VALUES = MAX_VALUES_PER_RULE * (MAX_RULES - 1);

/* ---------- Naam ---------- */

const SEND_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DMID = /^[A-Za-z0-9-]{2,30}$/;

/** `DMID26-XXXX`: het jaar van de verzenddatum, nummer nog onbekend. */
export function defaultDmid(sendDate: string): string {
  return `DMID${sendDate.slice(2, 4)}-XXXX`;
}

/**
 * Leest verzenddatum en DMID uit een verzoek. Geeft een foutmelding terug als
 * tekst, of `null` als alles klopt.
 */
export function validateNameInput(sendDate: unknown, dmid: unknown): string | null {
  if (typeof sendDate !== "string" || !SEND_DATE.test(sendDate) || isNaN(Date.parse(sendDate))) {
    return "Vul een geldige verzenddatum in.";
  }
  if (typeof dmid !== "string" || !DMID.test(dmid.trim())) {
    return "Vul een DMID in, bijvoorbeeld DMID26-12345.";
  }
  return null;
}

/**
 * De naam volgens de conventie van Digital Marketing, voor filter en doelgroep:
 * `2026.10.31 PSV Kaartverkoop - Aangrenzende stoelen PSV - Willem II - DMID26-12345`.
 * `title` is alles tussen de datum en het DMID.
 */
export function filterName({ sendDate, title, dmid }: { sendDate: string; title: string; dmid: string }): string {
  const middle = title.replace(/\s+/g, " ").trim();
  return `${sendDate.replaceAll("-", ".")} ${middle} - ${dmid.trim()}`;
}

/* ---------- Filter ---------- */

/**
 * Het contactfilter: begin leeg en voeg iedereen toe van wie `field` in de
 * lijst staat, in blokken van 100. Alleen de eerste regel heeft een `startset`.
 */
export function contactFilterBody(name: string, field: string, values: readonly string[]) {
  const unique = [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
  if (unique.length === 0) throw new Error("Er zijn geen waarden om door te zetten.");
  if (unique.length > MAX_FILTER_VALUES) {
    throw new Error(
      `Maileon past hooguit ${MAX_FILTER_VALUES} waarden in één filter; deze lijst heeft er ${unique.length}.`
    );
  }

  const rules = [];
  for (let start = 0; start < unique.length; start += MAX_VALUES_PER_RULE) {
    rules.push({
      ...(start === 0 ? { startset: "empty" } : {}),
      operation: "add",
      selection: {
        selection_base: "contactfield",
        criterion: {
          field_name: field,
          operation: IN_LIST_OPERATION,
          value: unique.slice(start, start + MAX_VALUES_PER_RULE),
        },
      },
    });
  }
  return { name, rules };
}

export function contactFilterUrl(contactFilterId: number): string {
  return `${MAILEON_WEBAPP}/contacts/filters/cfilter.msa?contactFilterId=${contactFilterId}`;
}

/* ---------- API ---------- */

const MAILEON_XML = "application/vnd.maileon.api+xml";

/** Een fout van de API, met de HTTP-status erbij. */
export class MaileonError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function isMaileonConfigured(): boolean {
  return Boolean(process.env.MAILEON_API_KEY);
}

function authorization(): string {
  const key = process.env.MAILEON_API_KEY;
  if (!key) throw new Error("MAILEON_API_KEY is niet ingesteld.");
  return `Basic ${Buffer.from(key).toString("base64")}`;
}

/**
 * De foutmelding uit een antwoord van Maileon: JSON met `error.message` (v2),
 * JSON met `message`, of XML met `<message>`.
 */
export function maileonMessage(text: string): string {
  try {
    const parsed = JSON.parse(text) as { message?: unknown; error?: { message?: unknown } };
    if (typeof parsed?.error?.message === "string") return parsed.error.message;
    if (typeof parsed?.message === "string") return parsed.message;
  } catch {
    const match = text.match(/<message>([\s\S]*?)<\/message>/);
    if (match) return match[1].trim();
  }
  return text.trim();
}

async function maileonError(res: Response): Promise<string> {
  const message = maileonMessage(await res.text().catch(() => ""));
  return `Maileon ${res.status}: ${message.slice(0, 500) || res.statusText}`;
}

export async function createContactFilter(name: string, field: string, values: readonly string[]): Promise<number> {
  const res = await fetch(`${MAILEON_API}/contactfilters/v2`, {
    method: "POST",
    headers: {
      Authorization: authorization(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(contactFilterBody(name, field, values)),
    cache: "no-store",
  });
  if (!res.ok) throw new MaileonError(`Maileon maakte het filter niet. ${await maileonError(res)}`, res.status);
  const data = (await res.json()) as { contact_filter_id?: unknown };
  const contactFilterId = Number(data.contact_filter_id);
  if (!Number.isInteger(contactFilterId) || contactFilterId <= 0) {
    throw new Error("Maileon gaf geen ID van het contactfilter terug.");
  }
  return contactFilterId;
}

/**
 * Laat Maileon het filter opnieuw doorrekenen. Asynchroon: het verzoek wacht
 * er niet op. Maileon staat dit per filter hooguit eens per tien minuten toe.
 */
export async function refreshContactFilter(contactFilterId: number): Promise<void> {
  const res = await fetch(`${MAILEON_API}/contactfilters/contactfilter/${contactFilterId}/refresh?async=true`, {
    headers: { Authorization: authorization(), Accept: MAILEON_XML },
    cache: "no-store",
  });
  if (!res.ok) throw new MaileonError(await maileonError(res), res.status);
}

/* ---------- Doelgroep ---------- */

/** De doelgroep op een filter, als XML voor `POST /targetgroups`. */
export function targetGroupXml(name: string, contactFilterId: number): string {
  const escaped = name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<targetgroup><name>${escaped}</name><type>regular</type>` +
    `<contact_filter_id>${contactFilterId}</contact_filter_id></targetgroup>`
  );
}

function xmlTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  if (!match) return null;
  return match[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "").trim();
}

function xmlNumber(xml: string, tag: string): number | null {
  const value = xmlTag(xml, tag);
  return value !== null && /^\d+$/.test(value) ? Number(value) : null;
}

/** Het ID uit het antwoord op `POST /targetgroups`: `<id>` in XML, of alleen het getal. */
export function parseTargetGroupId(text: string): number | null {
  const id = xmlNumber(text, "id") ?? (/^\s*\d+\s*$/.test(text) ? Number(text) : null);
  return id && id > 0 ? id : null;
}

export async function createTargetGroup(name: string, contactFilterId: number): Promise<number> {
  const res = await fetch(`${MAILEON_API}/targetgroups`, {
    method: "POST",
    headers: {
      Authorization: authorization(),
      "Content-Type": `${MAILEON_XML}; charset=utf-8`,
      Accept: MAILEON_XML,
    },
    body: targetGroupXml(name, contactFilterId),
    cache: "no-store",
  });
  if (!res.ok) throw new MaileonError(`Maileon maakte de doelgroep niet. ${await maileonError(res)}`, res.status);
  const id = parseTargetGroupId(await res.text());
  if (!id) throw new Error("Maileon gaf geen ID van de doelgroep terug.");
  return id;
}

export interface TargetGroupStatus {
  /** `outofdate`, `updating` of `uptodate`. */
  state: string;
  countContacts: number | null;
  countActiveContacts: number | null;
}

export function parseTargetGroup(xml: string): TargetGroupStatus {
  return {
    state: xmlTag(xml, "state") ?? "",
    countContacts: xmlNumber(xml, "count_contacts"),
    countActiveContacts: xmlNumber(xml, "count_active_contacts"),
  };
}

/** De stand van een doelgroep. Maileon rekent hem op de achtergrond door. */
export async function getTargetGroup(targetGroupId: number): Promise<TargetGroupStatus> {
  const res = await fetch(`${MAILEON_API}/targetgroups/targetgroup/${targetGroupId}`, {
    headers: { Authorization: authorization(), Accept: MAILEON_XML },
    cache: "no-store",
  });
  if (!res.ok) throw new MaileonError(await maileonError(res), res.status);
  return parseTargetGroup(await res.text());
}
