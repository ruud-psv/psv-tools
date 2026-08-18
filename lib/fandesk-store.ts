import { put, get, list } from "@vercel/blob";
import {
  FANDESK_CATEGORIES,
  FandeskCategory,
  FandeskTicket,
  RawFandeskItem,
  emptyCategoryCounts,
  normalizeCategory,
} from "@/lib/fandesk";

/**
 * FANdesk-opslag op Vercel Blob: één ledger per maand op
 * `fandesk/months/{YYYY-MM}.json`. Een ingest is daarmee 1 read + 1 write, en
 * het dashboard leest voor 90 dagen maar drie blobs in plaats van ~2160 losse
 * batches. Postgres is uit dit project verwijderd (zie lib/db.ts).
 */

const PREFIX = "fandesk/months/";
const MONTH_RE = /^\d{4}-\d{2}$/;

interface MonthLedger {
  month: string;
  updatedAt: string;
  items: FandeskTicket[];
}

export interface AppendResult {
  added: number;
  duplicates: number;
  /** Categoriewaarden die niet te matchen waren; geteld als Overig. */
  unknownCategories: string[];
  byCategory: Record<FandeskCategory, number>;
}

function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

function pathFor(month: string): string {
  return `${PREFIX}${month}.json`;
}

/** Maand ervoor, bijv. "2026-01" → "2025-12". */
function previousMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 2, 1)).toISOString().slice(0, 7);
}

function isTicket(value: unknown): value is FandeskTicket {
  if (!value || typeof value !== "object") return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    typeof t.at === "string" &&
    typeof t.category === "string" &&
    (FANDESK_CATEGORIES as readonly string[]).includes(t.category) &&
    // `topic` is optioneel — alleen afkeuren als hij aanwezig is met de verkeerde vorm.
    (t.topic === undefined || typeof t.topic === "string")
  );
}

async function readMonth(month: string): Promise<MonthLedger | null> {
  if (!MONTH_RE.test(month)) return null;
  const result = await get(pathFor(month), { access: "private", useCache: false });
  if (!result || !result.stream) return null;
  try {
    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text) as MonthLedger;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) return null;
    return { ...parsed, month, items: parsed.items.filter(isTicket) };
  } catch {
    // Corrupte ledger: liever als leeg behandelen dan de hele pagina laten vallen.
    console.error(`[fandesk] ledger ${month} niet te lezen.`);
    return null;
  }
}

async function writeMonth(ledger: MonthLedger): Promise<void> {
  await put(pathFor(ledger.month), JSON.stringify(ledger), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/**
 * Voegt tickets toe aan de maandledgers. Items worden gegroepeerd op de maand
 * van hun eigen `created_at`, zodat een batch die een maandgrens overloopt — of
 * een backfill — in het juiste bestand landt. Deduplicatie gaat op ticket-id,
 * ook tegen de voorgaande maand, zodat een handmatige re-run niets dubbel telt.
 */
export async function appendTickets(
  items: RawFandeskItem[],
  batchAt: string
): Promise<AppendResult> {
  const byCategory = emptyCategoryCounts();
  const unknown = new Set<string>();

  const perMonth = new Map<string, FandeskTicket[]>();
  for (const item of items) {
    const { category, matched } = normalizeCategory(item.rawCategory);
    if (!matched && item.rawCategory.trim()) unknown.add(item.rawCategory.trim());
    const at = item.at ?? batchAt;
    const ticket: FandeskTicket = { id: item.id, category, at };
    if (item.topic) ticket.topic = item.topic;
    const bucket = perMonth.get(monthOf(at));
    if (bucket) bucket.push(ticket);
    else perMonth.set(monthOf(at), [ticket]);
  }

  let added = 0;
  let duplicates = 0;

  // Sequentieel per maand: twee maanden schrijven zelden tegelijk, en zo is de
  // dedup tegen de voorgaande maand altijd op de nieuwste stand gebaseerd.
  for (const [month, tickets] of [...perMonth.entries()].sort()) {
    const [current, prior] = await Promise.all([
      readMonth(month),
      readMonth(previousMonth(month)),
    ]);

    const ledger: MonthLedger = current ?? { month, updatedAt: batchAt, items: [] };
    const seen = new Set(ledger.items.map((t) => t.id));
    for (const t of prior?.items ?? []) seen.add(t.id);

    const fresh: FandeskTicket[] = [];
    for (const ticket of tickets) {
      if (seen.has(ticket.id)) {
        duplicates++;
        continue;
      }
      seen.add(ticket.id);
      fresh.push(ticket);
      byCategory[ticket.category]++;
    }

    if (!fresh.length) continue;

    ledger.items = [...ledger.items, ...fresh].sort((a, b) => a.at.localeCompare(b.at));
    ledger.updatedAt = batchAt;
    await writeMonth(ledger);
    added += fresh.length;
  }

  return { added, duplicates, unknownCategories: [...unknown].sort(), byCategory };
}

/** Alle maanden waarvoor een ledger bestaat, oplopend gesorteerd. */
export async function listMonths(): Promise<string[]> {
  const { blobs } = await list({ prefix: PREFIX });
  return blobs
    .map((b) => b.pathname.slice(PREFIX.length).replace(/\.json$/, ""))
    .filter((m) => MONTH_RE.test(m))
    .sort();
}

/** Maandsleutels die het instant-bereik overspannen, met een maand marge. */
function monthsBetween(fromInstant: number, toInstant: number): string[] {
  const start = new Date(fromInstant);
  const end = new Date(toInstant);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1);
  const months: string[] = [];
  while (cursor.getTime() <= last) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

/** Tickets binnen [fromInstant, toInstant), oplopend op tijdstip. */
export async function readRange(
  fromInstant: number,
  toInstant: number
): Promise<FandeskTicket[]> {
  const ledgers = await Promise.all(
    monthsBetween(fromInstant, toInstant).map((month) => readMonth(month))
  );
  const tickets: FandeskTicket[] = [];
  for (const ledger of ledgers) {
    if (!ledger) continue;
    for (const ticket of ledger.items) {
      const time = new Date(ticket.at).getTime();
      if (isNaN(time) || time < fromInstant || time >= toInstant) continue;
      tickets.push(ticket);
    }
  }
  return tickets.sort((a, b) => a.at.localeCompare(b.at));
}

/** Samenvatting over alle opgeslagen maanden — voor de health check. */
export async function readSummary(): Promise<{
  months: string[];
  totalItems: number;
  lastTicketAt: string | null;
  oldestTicketAt: string | null;
}> {
  const months = await listMonths();
  const ledgers = await Promise.all(months.map((month) => readMonth(month)));
  let totalItems = 0;
  let lastTicketAt: string | null = null;
  let oldestTicketAt: string | null = null;
  for (const ledger of ledgers) {
    if (!ledger) continue;
    totalItems += ledger.items.length;
    for (const ticket of ledger.items) {
      if (!lastTicketAt || ticket.at > lastTicketAt) lastTicketAt = ticket.at;
      if (!oldestTicketAt || ticket.at < oldestTicketAt) oldestTicketAt = ticket.at;
    }
  }
  return { months, totalItems, lastTicketAt, oldestTicketAt };
}
