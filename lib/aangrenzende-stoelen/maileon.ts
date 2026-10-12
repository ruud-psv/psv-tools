/**
 * Doorzetten naar Maileon: de lijst wordt een contactfilter op relatienummer,
 * met een doelgroep erop, zodat kaartverkoop er direct een mailing naar kan
 * sturen. Er gaan alleen relatienummers naar Maileon; Maileon kent de
 * contacten zelf al.
 *
 * API: `POST /contactfilters/v2?createTargetGroup=true` maakt filter én
 * doelgroep in één keer (https://support.maileon.com/support/create-contact-filter/,
 * regels: https://support.maileon.com/support/contactfilter-schema/).
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
 * Operator voor "waarde staat in deze lijst". De documentatie van Maileon is
 * het met zichzelf oneens: de schema-pagina noemt `includedin`, de XQueue-wiki
 * `includein`. We proberen ze op volgorde; een afgewezen filter (400) maakt
 * niets aan. In de log staat welke werkte.
 */
export const IN_LIST_OPERATIONS = ["includein", "includedin"] as const;

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

/** Het contactfilter: begin leeg en voeg iedereen toe met een relatienummer uit de lijst. */
export function contactFilterBody(name: string, relationNumbers: readonly string[], operation: string) {
  const values = [...new Set(relationNumbers.map((value) => value.trim()).filter(Boolean))].sort();
  return {
    name,
    rules: [
      {
        startset: "empty",
        operation: "add",
        selection: {
          selection_base: "contactfield",
          criterion: { field_name: RELATION_NUMBER_FIELD, operation, value: values },
        },
      },
    ],
  };
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

/** De foutmelding van Maileon: JSON met `message`, of XML met `<message>`. */
async function maileonError(res: Response): Promise<string> {
  const text = (await res.text().catch(() => "")).trim();
  let message = text;
  try {
    const parsed = JSON.parse(text) as { message?: unknown };
    if (parsed && typeof parsed.message === "string") message = parsed.message;
  } catch {
    const match = text.match(/<message>([\s\S]*?)<\/message>/);
    if (match) message = match[1].trim();
  }
  return `Maileon ${res.status}: ${message.slice(0, 300) || res.statusText}`;
}

export interface CreatedTargetGroup {
  contactFilterId: number;
  /** `null` als Maileon wel het filter maakte, maar geen doelgroep. */
  targetGroupId: number | null;
  operation: string;
}

export async function createFilterWithTargetGroup(
  name: string,
  relationNumbers: readonly string[]
): Promise<CreatedTargetGroup> {
  const rejected: string[] = [];
  for (const operation of IN_LIST_OPERATIONS) {
    const res = await fetch(`${MAILEON_API}/contactfilters/v2?createTargetGroup=true`, {
      method: "POST",
      headers: {
        Authorization: authorization(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(contactFilterBody(name, relationNumbers, operation)),
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { contact_filter_id?: unknown; target_group_id?: unknown };
      const contactFilterId = Number(data.contact_filter_id);
      if (!Number.isInteger(contactFilterId) || contactFilterId <= 0) {
        throw new Error("Maileon gaf geen ID van het contactfilter terug.");
      }
      const targetGroupId = Number(data.target_group_id);
      return {
        contactFilterId,
        targetGroupId: Number.isInteger(targetGroupId) && targetGroupId > 0 ? targetGroupId : null,
        operation,
      };
    }
    const message = await maileonError(res);
    if (res.status !== 400) throw new Error(message);
    rejected.push(`${operation}: ${message}`);
  }
  throw new Error(`Maileon wees het filter af. ${rejected.join(" · ")}`);
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
