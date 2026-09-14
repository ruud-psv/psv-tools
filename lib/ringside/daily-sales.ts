/**
 * Verkoop per dag, rechtstreeks uit de verkoopregels.
 *
 * De huidige pagina leidt dit af uit snapshots: elke twee uur een meting van de
 * stand, en het aantal per dag is het verschil tussen twee opeenvolgende
 * metingen. Dat brengt drie beperkingen mee die hier vervallen:
 *
 * - **Geen historie vóór de eerste meting.** Een event dat al liep toen de cron
 *   begon, mist zijn beginperiode voorgoed.
 * - **Gaten wanneer de cron niet draaide.** Een gemiste dag wordt opgeteld bij
 *   de volgende, of blijft leeg.
 * - **Niets meer na afloop.** Verdween een event uit de feed, dan verdween ook
 *   het verloop.
 *
 * `sales.transaction_date` staat per verkocht ticket vast. Daarmee is het
 * verloop exact, met terugwerkende kracht, en ook voor wedstrijden die al
 * gespeeld zijn. Het is dus geen benadering meer maar de werkelijke telling.
 *
 * De uitvoer heeft dezelfde vorm als `lib/ticket-daily-sales.ts`, zodat de
 * bestaande grafiek hem zonder aanpassing kan tekenen.
 */

import type { DailySalesPoint } from "@/lib/ticket-daily-sales";
import { isSoldTicket, type SalesRow } from "./sales";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DatedSalesRow extends SalesRow {
  transaction_date?: unknown;
}

function toDayKey(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const direct = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
    parsed.getDate()
  ).padStart(2, "0")}`;
}

function dayStart(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

function addDays(dayKey: string, amount: number): string {
  const next = new Date(dayStart(dayKey) + amount * DAY_MS);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(
    next.getDate()
  ).padStart(2, "0")}`;
}

function dayLabel(dayKey: string): string {
  const [, m, d] = dayKey.split("-");
  return `${d}/${m}`;
}

export interface DailySalesOptions {
  /** Voor `daysUntilEvent` op de as. */
  eventDate?: string | null;
  /** Voor `available`; zonder capaciteit blijft dat veld leeg. */
  totalCapacity?: number | null;
}

/**
 * Telt verkochte tickets per kalenderdag.
 *
 * Alleen regels die volgens `isSoldTicket` meetellen. Ontdubbeld op
 * `product_item_id`, zodat een ticket met meerdere regels op één dag niet
 * dubbel telt — maar wél per dag, want hetzelfde ticket kan op een latere dag
 * opnieuw voorkomen na een wijziging.
 *
 * Dagen zonder verkoop komen als `sold: 0` in de reeks en niet als gat: bij
 * snapshots betekende een ontbrekende dag "niet gemeten", hier betekent het
 * "die dag is niets verkocht". Dat is een wezenlijk verschil, en de eerste dag
 * is hier dan ook geen baseline.
 */
export function buildDailySalesFromTransactions(
  rows: DatedSalesRow[],
  options: DailySalesOptions = {}
): DailySalesPoint[] {
  const itemsPerDay = new Map<string, Set<string>>();
  const extraPerDay = new Map<string, number>();

  for (const row of rows) {
    if (!isSoldTicket(row)) continue;
    const day = toDayKey(row.transaction_date);
    if (!day) continue;

    const itemId = typeof row.product_item_id === "string" ? row.product_item_id : null;
    if (itemId) {
      let items = itemsPerDay.get(day);
      if (!items) {
        items = new Set();
        itemsPerDay.set(day, items);
      }
      items.add(itemId);
    } else {
      extraPerDay.set(day, (extraPerDay.get(day) ?? 0) + 1);
    }
  }

  const days = [...new Set([...itemsPerDay.keys(), ...extraPerDay.keys()])].sort();
  if (days.length === 0) return [];

  const eventDay = options.eventDate ? toDayKey(options.eventDate) : null;
  const eventDayStart = eventDay ? dayStart(eventDay) : null;
  const capacity =
    typeof options.totalCapacity === "number" && options.totalCapacity > 0
      ? options.totalCapacity
      : null;

  const points: DailySalesPoint[] = [];
  let cumulative = 0;

  // Doorlopende reeks van eerste tot laatste verkoopdag, zodat stille dagen
  // zichtbaar zijn als nul en niet als onderbreking van de lijn.
  for (let day = days[0]; day <= days[days.length - 1]; day = addDays(day, 1)) {
    const sold = (itemsPerDay.get(day)?.size ?? 0) + (extraPerDay.get(day) ?? 0);
    cumulative += sold;

    points.push({
      date: day,
      label: dayLabel(day),
      sold,
      cumulativeSold: cumulative,
      available: capacity === null ? null : Math.max(capacity - cumulative, 0),
      // Er is geen meetmoment: de dag zelf is het gegeven.
      measuredAt: null,
      hasData: true,
      isBaseline: false,
      spanDays: 1,
      daysUntilEvent:
        eventDayStart === null ? null : Math.round((eventDayStart - dayStart(day)) / DAY_MS),
    });
  }

  return points;
}
