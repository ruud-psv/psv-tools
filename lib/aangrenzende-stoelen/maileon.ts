/**
 * Doorzetten naar Maileon: de lijst wordt een contactfilter op relatienummer,
 * met een doelgroep erop, zodat kaartverkoop er direct een mailing naar kan
 * sturen. Er gaan alleen relatienummers naar Maileon; Maileon kent de
 * contacten zelf al.
 *
 * API: eerst het filter (`POST /contactfilters/v2`), dan de doelgroep erop
 * (`POST /targetgroups`). Twee stappen in plaats van `createTargetGroup=true`,
 * zodat we weten welke stap Maileon afwijst. De regels moeten voldoen aan het
 * JSON-schema in de XQueue-wiki ("Creating and Updating Contactfilters Using
 * the REST API"), niet aan de losse documentatiepagina's: die spreken elkaar
 * tegen.
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

/**
 * Alleen contacten met deze preference op ja mogen mail over kaartverkoop
 * krijgen. Op de voorkeurenpagina (`psv-voorkeuren-algemeen`) heet hij "PSV
 * Kaartverkoop thuiswedstrijden"; het veld daar is `Email###Ticketing`, dus
 * categorie `Email`, preference `Ticketing`.
 */
export const TICKETING_PREFERENCE = { category_name: "Email", preference_name: "Ticketing" } as const;

/** Het schema staat hooguit 100 waarden per regel toe; meer gaat in extra regels. */
export const MAX_VALUES_PER_RULE = 100;

/** Maileon staat hooguit 100 regels per filter toe. */
export const MAX_RULES = 100;

/** Eén regel gaat op aan de Ticketing-preference; de rest is voor relatienummers. */
export const MAX_RELATION_NUMBERS = MAX_VALUES_PER_RULE * (MAX_RULES - 1);

const SEND_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DMID = /^[A-Za-z0-9-]{2,30}$/;

/** `DMID26-XXXX`: het jaar van de verzenddatum, nummer nog onbekend. */
export function defaultDmid(sendDate: string): string {
  return `DMID${sendDate.slice(2, 4)}-XXXX`;
}

export interface MaileonNameInput {
  /** Verzenddatum als `yyyy-mm-dd`. */
  sendDate: string;
  eventName: string;
  dmid: string;
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
 */
export function maileonName({ sendDate, eventName, dmid }: MaileonNameInput): string {
  const event = eventName.replace(/\s+/g, " ").trim();
  return `${sendDate.replaceAll("-", ".")} PSV Kaartverkoop - Aangrenzende stoelen ${event} - ${dmid.trim()}`;
}

/**
 * Het contactfilter: begin leeg en voeg iedereen toe met een relatienummer uit
 * de lijst, in blokken van 100. Alleen de eerste regel heeft een `startset`.
 * De laatste regel houdt daarvan alleen de contacten over met de
 * Ticketing-preference op ja.
 */
export function contactFilterBody(name: string, relationNumbers: readonly string[]) {
  const values = [...new Set(relationNumbers.map((value) => value.trim()).filter(Boolean))].sort();
  if (values.length === 0) throw new Error("Er zijn geen relatienummers om door te zetten.");
  if (values.length > MAX_RELATION_NUMBERS) {
    throw new Error(
      `Maileon past hooguit ${MAX_RELATION_NUMBERS} relatienummers in één filter; deze lijst heeft er ${values.length}.`
    );
  }

  const relationRules = [];
  for (let start = 0; start < values.length; start += MAX_VALUES_PER_RULE) {
    relationRules.push({
      ...(start === 0 ? { startset: "empty" } : {}),
      operation: "add",
      selection: {
        selection_base: "contactfield",
        criterion: {
          field_name: RELATION_NUMBER_FIELD,
          operation: IN_LIST_OPERATION,
          value: values.slice(start, start + MAX_VALUES_PER_RULE),
        },
      },
    });
  }
  const ticketingRule = {
    operation: "intersection",
    selection: {
      selection_base: "contactpreference",
      criterion: { ...TICKETING_PREFERENCE, operation: "equals", value: true },
    },
  };
  return { name, rules: [...relationRules, ticketingRule] };
}

/** De doelgroep op een filter, als XML voor `POST /targetgroups`. */
export function targetGroupXml(name: string, contactFilterId: number): string {
  const escaped = name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<targetgroup><name>${escaped}</name><type>regular</type>` +
    `<contact_filter_id>${contactFilterId}</contact_filter_id></targetgroup>`
  );
}

export function contactFilterUrl(contactFilterId: number): string {
  return `${MAILEON_WEBAPP}/contacts/filters/cfilter.msa?contactFilterId=${contactFilterId}`;
}

/* ---------- API ---------- */

const MAILEON_XML = "application/vnd.maileon.api+xml";

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

export async function createContactFilter(name: string, relationNumbers: readonly string[]): Promise<number> {
  const res = await fetch(`${MAILEON_API}/contactfilters/v2`, {
    method: "POST",
    headers: {
      Authorization: authorization(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(contactFilterBody(name, relationNumbers)),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Maileon maakte het filter niet. ${await maileonError(res)}`);
  const data = (await res.json()) as { contact_filter_id?: unknown };
  const contactFilterId = Number(data.contact_filter_id);
  if (!Number.isInteger(contactFilterId) || contactFilterId <= 0) {
    throw new Error("Maileon gaf geen ID van het contactfilter terug.");
  }
  return contactFilterId;
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
  if (!res.ok) throw new Error(await maileonError(res));
  const id = xmlNumber(await res.text(), "id");
  if (!id) throw new Error("Maileon gaf geen ID van de doelgroep terug.");
  return id;
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
  if (!res.ok) throw new Error(await maileonError(res));
}

export interface TargetGroupStatus {
  id: number;
  name: string;
  /** `outofdate`, `updating` of `uptodate`. */
  state: string;
  countContacts: number | null;
  countActiveContacts: number | null;
  /** Wanneer Maileon de aantallen voor het laatst uitrekende. */
  evaluated: string | null;
}

function xmlTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  if (!match) return null;
  return match[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function xmlNumber(xml: string, tag: string): number | null {
  const value = xmlTag(xml, tag);
  return value !== null && /^\d+$/.test(value) ? Number(value) : null;
}

export function parseTargetGroup(xml: string): TargetGroupStatus {
  return {
    id: xmlNumber(xml, "id") ?? 0,
    name: xmlTag(xml, "name") ?? "",
    state: xmlTag(xml, "state") ?? "",
    countContacts: xmlNumber(xml, "count_contacts"),
    countActiveContacts: xmlNumber(xml, "count_active_contacts"),
    evaluated: xmlTag(xml, "evaluated") || null,
  };
}

export async function getTargetGroup(targetGroupId: number): Promise<TargetGroupStatus> {
  const res = await fetch(`${MAILEON_API}/targetgroups/targetgroup/${targetGroupId}`, {
    headers: { Authorization: authorization(), Accept: MAILEON_XML },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await maileonError(res));
  return parseTargetGroup(await res.text());
}
