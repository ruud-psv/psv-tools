import type { SnapshotPoint } from "@/lib/blob-snapshots";

/**
 * Eén dag in het verkoopverloop van een event.
 *
 * Snapshots bevatten cumulatieve standen (`sold` = totaal verkocht op dat
 * moment), en de cron draait elke 2 uur. Het aantal verkochte tickets per dag
 * is dus een delta tussen de laatste meting van twee opeenvolgende meetdagen —
 * niet de som van de metingen op één dag.
 */
export interface DailySalesPoint {
  /** Kalenderdag als `YYYY-MM-DD`. */
  date: string;
  /** Aslabel, `dd/MM`. */
  label: string;
  /** Verkocht op deze dag. `null` als er geen delta te berekenen is. */
  sold: number | null;
  /** Totaal verkocht bij de laatste meting van deze dag. */
  cumulativeSold: number | null;
  /** Beschikbaar bij de laatste meting van deze dag. */
  available: number | null;
  /** Timestamp van de laatste meting van deze dag. */
  measuredAt: string | null;
  /** Of er die dag een meting is geweest. */
  hasData: boolean;
  /** Eerste meetdag: geen voorgaande meting om tegen af te zetten. */
  isBaseline: boolean;
  /**
   * Aantal dagen dat deze delta overspant. 1 bij een normale dag, meer wanneer
   * de cron een of meer dagen heeft gemist.
   */
  spanDays: number;
  /** Dagen tot de eventdatum op deze dag. Negatief na het event, `null` als de eventdatum onbekend is. */
  daysUntilEvent: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` van een ISO-string, of `null` als die niet te parsen is. */
function toDayKey(iso: string): string | null {
  if (!iso) return null;
  const direct = iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Middernacht lokale tijd, zodat dagverschillen hele dagen zijn. */
function dayStart(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

function addDays(dayKey: string, amount: number): string {
  const next = new Date(dayStart(dayKey) + amount * DAY_MS);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

function dayLabel(dayKey: string): string {
  const [, m, d] = dayKey.split("-");
  return `${d}/${m}`;
}

/**
 * Zet ruwe snapshots om naar één punt per kalenderdag met het aantal verkochte
 * tickets op die dag.
 *
 * - Per dag wordt de **laatste** meting gebruikt (stand aan het eind van de dag).
 * - Dagen zonder meting blijven als gat in de tijdlijn staan (`hasData: false`).
 * - Retouren leveren een negatieve `sold` op; die wordt niet weggepoetst.
 */
export function buildDailySales(
  history: SnapshotPoint[],
  eventDate?: string
): DailySalesPoint[] {
  // Per dag de laatste meting; bewust geen sommatie over intraday-metingen.
  const lastPerDay = new Map<string, SnapshotPoint>();
  for (const point of history) {
    const day = toDayKey(point.ts);
    if (!day) continue;
    const current = lastPerDay.get(day);
    if (!current || point.ts > current.ts) lastPerDay.set(day, point);
  }

  const measuredDays = [...lastPerDay.keys()].sort();
  if (measuredDays.length === 0) return [];

  const eventDay = eventDate ? toDayKey(eventDate) : null;
  const eventDayStart = eventDay ? dayStart(eventDay) : null;

  const firstDay = measuredDays[0];
  const lastDay = measuredDays[measuredDays.length - 1];

  const points: DailySalesPoint[] = [];
  let previous: { day: string; point: SnapshotPoint } | null = null;

  for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
    const measurement = lastPerDay.get(day);
    const daysUntilEvent =
      eventDayStart === null
        ? null
        : Math.round((eventDayStart - dayStart(day)) / DAY_MS);

    if (!measurement) {
      points.push({
        date: day,
        label: dayLabel(day),
        sold: null,
        cumulativeSold: null,
        available: null,
        measuredAt: null,
        hasData: false,
        isBaseline: false,
        spanDays: 0,
        daysUntilEvent,
      });
      continue;
    }

    const isBaseline = previous === null;
    const spanDays = previous
      ? Math.round((dayStart(day) - dayStart(previous.day)) / DAY_MS)
      : 0;

    points.push({
      date: day,
      label: dayLabel(day),
      sold: previous ? measurement.sold - previous.point.sold : null,
      cumulativeSold: measurement.sold,
      available: measurement.available,
      measuredAt: measurement.ts,
      hasData: true,
      isBaseline,
      spanDays,
      daysUntilEvent,
    });

    previous = { day, point: measurement };
  }

  return points;
}

/** Aantal dagen met een berekende verkoopdelta — de bruikbare staven. */
export function countSalesDays(points: DailySalesPoint[]): number {
  return points.filter((p) => p.sold !== null).length;
}
