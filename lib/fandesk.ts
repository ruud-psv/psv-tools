/**
 * FANdesk — types, categorie-normalisatie, payload-validatie en tijdzonelogica
 * voor de support ticket statistieken. Bewust vrij van server-only imports,
 * zodat zowel de API-routes als het client-dashboard hieruit kunnen lezen.
 * De blob-opslag zit in `lib/fandesk-store.ts`.
 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BATCH_ITEMS = 5000;
const MAX_ID_LENGTH = 200;
const MAX_TOPIC_LENGTH = 120;
const TIME_ZONE = "Europe/Amsterdam";

/** Ondergrens voor een plausibel ticket-tijdstip. */
const MIN_TICKET_TIME = Date.UTC(2020, 0, 1);
/** Bovengrens: één dag vooruit, tegen klok-fouten in de bron. */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export const MAX_ITEMS_PER_BATCH = MAX_BATCH_ITEMS;

export const FANDESK_CATEGORIES = [
  "Tickets",
  "FANstore",
  "Wedstrijdinformatie",
  "Overig",
] as const;

export type FandeskCategory = (typeof FANDESK_CATEGORIES)[number];

/** Eén support ticket. `at` is ISO-8601 in UTC. */
export interface FandeskTicket {
  id: string;
  category: FandeskCategory;
  at: string;
  /**
   * Korte geanonimiseerde onderwerpregel uit n8n, waar de samenvatting op werkt.
   * Optioneel: tickets van vóór deze functie hebben hem niet.
   */
  topic?: string;
}

/** Ruw item uit de n8n payload, na validatie. */
export interface RawFandeskItem {
  id: string;
  rawCategory: string;
  /** ISO-string uit `created_at`, of null wanneer die ontbrak of onbruikbaar was. */
  at: string | null;
  topic?: string;
}

export function emptyCategoryCounts(): Record<FandeskCategory, number> {
  return { Tickets: 0, FANstore: 0, Wedstrijdinformatie: 0, Overig: 0 };
}

// ---------------------------------------------------------------------------
// Categorie-normalisatie
// ---------------------------------------------------------------------------

/** Vergelijkingssleutel: kleine letters, geen spaties/streepjes, enkelvoud. */
function categoryKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/s$/, "");
}

const CATEGORY_LOOKUP: Record<string, FandeskCategory> = FANDESK_CATEGORIES.reduce(
  (acc, category) => {
    acc[categoryKey(category)] = category;
    return acc;
  },
  {} as Record<string, FandeskCategory>
);

/**
 * Matcht een aangeleverde categorie op de vier bekende waarden. Onbekende
 * waarden worden als Overig geteld, maar met `matched: false` zodat de
 * ingest-route een mapping-fout in n8n kan terugmelden.
 */
export function normalizeCategory(raw: unknown): {
  category: FandeskCategory;
  matched: boolean;
} {
  if (typeof raw !== "string" || !raw.trim()) return { category: "Overig", matched: false };
  const hit = CATEGORY_LOOKUP[categoryKey(raw.trim())];
  return hit ? { category: hit, matched: true } : { category: "Overig", matched: false };
}

// ---------------------------------------------------------------------------
// Tijdzone — de enige plek met Europe/Amsterdam logica
// ---------------------------------------------------------------------------

const AMSTERDAM_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export interface AmsterdamParts {
  /** Kalenderdag in Amsterdamse tijd, `YYYY-MM-DD`. */
  dayKey: string;
  /** Uur van de dag, 0–23, in Amsterdamse tijd. */
  hour: number;
  /** Weekdag, 0 = maandag t/m 6 = zondag. */
  weekday: number;
}

/**
 * Zet een UTC-instant om naar de Amsterdamse kalenderdag, het uur en de
 * weekdag. Tickets komen in UTC binnen (`created_at` eindigt op `Z`), maar dag-
 * en uurgrenzen moeten in Nederlandse tijd liggen: 23:10 UTC is hier 01:10 de
 * volgende dag.
 */
export function toAmsterdamParts(iso: string): AmsterdamParts | null {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;

  const parts = AMSTERDAM_FORMATTER.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  if (!year || !month || !day) return null;

  // Weekdag via de lokale kalenderdatum als UTC-instant, zodat de tijdzone van
  // de server geen rol speelt.
  const weekday = (new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay() + 6) % 7;

  return {
    dayKey: `${year}-${month}-${day}`,
    hour: parseInt(pick("hour"), 10) % 24,
    weekday: isNaN(weekday) ? 0 : weekday,
  };
}

/** Offset van Europe/Amsterdam ten opzichte van UTC, in minuten, op `instant`. */
function amsterdamOffsetMinutes(instant: number): number {
  const parts = AMSTERDAM_FORMATTER.formatToParts(new Date(instant));
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    pick("year"),
    pick("month") - 1,
    pick("day"),
    pick("hour") % 24,
    pick("minute")
  );
  return Math.round((asUtc - instant) / 60000);
}

/** UTC-instant van middernacht Amsterdamse tijd op een `YYYY-MM-DD` dag. */
function amsterdamMidnight(dayKey: string): number {
  const [year, month, day] = dayKey.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day);
  // Twee passes: de eerste offset kan net aan de andere kant van een DST-grens vallen.
  const first = guess - amsterdamOffsetMinutes(guess) * 60000;
  return guess - amsterdamOffsetMinutes(first) * 60000;
}

/**
 * Zet een dagbereik (`YYYY-MM-DD`, inclusief) om naar UTC-instants: van
 * middernacht op `fromDay` tot en met het einde van `toDay`, Amsterdamse tijd.
 */
export function amsterdamDayBounds(
  fromDay: string,
  toDay: string
): { fromInstant: number; toInstant: number } {
  return {
    fromInstant: amsterdamMidnight(fromDay),
    toInstant: amsterdamMidnight(shiftDayKey(toDay, 1)),
  };
}

/** Verschuift een `YYYY-MM-DD` dag met een aantal dagen. */
export function shiftDayKey(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Aantal dagen tussen twee dagsleutels, inclusief begin- en einddag. */
export function dayCount(from: string, to: string): number {
  const parse = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.max(1, Math.round((parse(to) - parse(from)) / 86400000) + 1);
}

export function isValidDayKey(value: unknown): value is string {
  return typeof value === "string" && DAY_RE.test(value) && !isNaN(new Date(value).getTime());
}

// ---------------------------------------------------------------------------
// Payload-validatie
// ---------------------------------------------------------------------------

function parseTimestamp(item: Record<string, unknown>): string | null {
  // `created_at` is wat de n8n workflow stuurt; de rest zijn aliassen voor het
  // geval het veld ooit anders heet.
  for (const key of ["created_at", "createdAt", "created", "date", "at"]) {
    const raw = item[key];
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    const time = new Date(raw).getTime();
    if (isNaN(time)) continue;
    if (time < MIN_TICKET_TIME) continue;
    if (time > Date.now() + FUTURE_TOLERANCE_MS) continue;
    return new Date(time).toISOString();
  }
  return null;
}

/**
 * Maakt een onderwerpregel schoon voordat hij wordt opgeslagen. n8n is
 * geïnstrueerd om geen persoonsgegevens mee te sturen, maar dat is een instructie
 * aan een taalmodel en geen garantie — dit is de vangnetlaag. E-mailadressen,
 * telefoonnummers en lange cijferreeksen (order- en ticketnummers) zijn
 * identificerend en voegen voor het clusteren van onderwerpen niets toe.
 */
export function sanitizeTopic(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const cleaned = raw
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "…")
    // Telefoonnummers: +31 6 12345678, 06-12345678, (040) 123 45 67
    .replace(/(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\d[\d\s-]{7,}\d/g, "…")
    // Overgebleven cijferreeksen van 5 of meer: order-, ticket- en klantnummers
    .replace(/\d{5,}/g, "…")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length > MAX_TOPIC_LENGTH) {
    return `${cleaned.slice(0, MAX_TOPIC_LENGTH).trimEnd()}…`;
  }
  // Alleen leestekens of losse vervangingstekens overgebleven → geen inhoud.
  if (!/\p{L}{2,}/u.test(cleaned)) return undefined;
  return cleaned;
}

function parseItem(value: unknown): RawFandeskItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;

  const rawId = item.id ?? item.ticketId ?? item.ticket_id;
  if (typeof rawId !== "string" && typeof rawId !== "number") return null;
  const id = String(rawId).trim();
  if (!id || id.length > MAX_ID_LENGTH) return null;

  const rawCategory = item.category ?? item.categorie ?? "";
  const rawTopic = item.topic ?? item.subject ?? item.onderwerp ?? item.samenvatting;

  return {
    id,
    rawCategory: typeof rawCategory === "string" ? rawCategory : String(rawCategory),
    at: parseTimestamp(item),
    topic: sanitizeTopic(rawTopic),
  };
}

/**
 * Haalt de itemlijst uit een n8n payload. Accepteert bewust breed — een kale
 * array, `{ items: [...] }`, `{ data: [...] }`, `{ results: [...] }` of één los
 * object — zodat elke redelijke n8n-configuratie werkt. Retourneert null als er
 * geen lijst te vinden is, en een lege lijst als de batch simpelweg leeg was.
 */
export function parseIngestPayload(
  body: unknown
): { items: RawFandeskItem[]; skipped: number } | null {
  let raw: unknown[] | null = null;

  if (Array.isArray(body)) {
    raw = body;
  } else if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    for (const key of ["items", "data", "results", "tickets"]) {
      if (Array.isArray(obj[key])) {
        raw = obj[key] as unknown[];
        break;
      }
    }
    // Eén los ticket (n8n zonder Aggregate-node) is ook geldig.
    if (!raw && (obj.id !== undefined || obj.ticketId !== undefined)) raw = [obj];
  }

  if (!raw) return null;

  const items: RawFandeskItem[] = [];
  let skipped = 0;
  for (const entry of raw) {
    const parsed = parseItem(entry);
    if (parsed) items.push(parsed);
    else skipped++;
  }
  return { items, skipped };
}

export function isBatchTooLarge(count: number): boolean {
  return count > MAX_BATCH_ITEMS;
}
