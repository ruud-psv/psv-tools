import type { DailySalesPoint } from "@/lib/ticket-daily-sales";

/**
 * Wedstrijden uit verschillende seizoenen naast elkaar in één grafiek.
 *
 * Kalenderdatums zijn hier onbruikbaar: een wedstrijd uit 2025 en een uit 2026
 * overlappen nooit. De gedeelde x-as is daarom **dagen tot de wedstrijd**,
 * dezelfde conventie als `daysUntilEvent` in `lib/ticket-daily-sales.ts`
 * (positief = ervoor, 0 = de wedstrijddag zelf, negatief = erna).
 *
 * Alle series komen in één array met per serie een eigen sleutel. Recharts leidt
 * het domein en de tooltip-payload af uit de chart-level `data`, dus een `data`
 * per serie zou de custom tick-renderers hieronder stukmaken.
 */

/** Kleuren voor de vergelijkingsseries, uit de PSV-tokens. */
export const COMPARISON_COLORS = ["#2e5aac", "#287d3c", "#09101d"];

/**
 * Streepjespatroon per serie. Het palet is al vol (rood/roze voor de live
 * staven, oranje voor retouren, grijs voor het verleden, goud voor de
 * eventdag), dus onderscheid op alleen tint is te mager.
 */
export const COMPARISON_DASHES = ["", "5 3", "2 3"];

/** Eén historische wedstrijd zoals de grafiek die nodig heeft. */
export interface ComparisonInput {
  id: string;
  name: string;
  season: string;
  /** Wedstrijddatum als `YYYY-MM-DD` (of ISO — alleen de datum wordt gebruikt). */
  eventDate: string;
  /** Verkochte tickets per dagen-tot-event, ná het tickettype-filter. */
  perOffset: Map<number, number>;
  /** Totaal over het volledige verkoopvenster, ook buiten het getoonde deel. */
  total: number;
  /**
   * Hetzelfde totaal zonder tickettype-filter. Hieraan ziet de grafiek of er
   * gefilterd wordt, want de live reeks kan dat filter niet volgen en moet dan
   * als "ongefilterd" gelabeld worden.
   */
  unfilteredTotal: number;
}

/** Serie zoals de grafiek die tekent. */
export interface ComparisonSeries {
  id: string;
  /** Sleutel in de rijen én de `dataKey` voor recharts. */
  dataKey: string;
  name: string;
  season: string;
  color: string;
  dash: string;
  eventDate: string;
  total: number;
  /** Verkocht binnen het getoonde venster. */
  windowTotal: number;
}

export type ComparisonMode = "perDag" | "tempo";
export type ComparisonWindow = "live" | "full";

export interface ComparisonRow {
  offset: number;
  /** Categoriesleutel voor de x-as. */
  key: string;
  /** `D-14`, `EVENT` of `D+2`. */
  axisLabel: string;
  /** `dd/MM` van de live wedstrijd; `null` buiten haar meetvenster. */
  liveLabel: string | null;
  liveDate: string | null;
  /** Live waarde: verkocht die dag, of het percentage in tempo-modus. */
  live: number | null;
  /** Per serie de kalenderdatum op deze offset, voor de tooltip. */
  dates: Record<string, string>;
  /** Ruwe aantallen per serie, ook in tempo-modus (tooltip toont beide). */
  counts: Record<string, number | null>;
  /** De waarden die recharts tekent, onder `c0`, `c1`, … */
  [seriesKey: string]: unknown;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayStart(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

function toDayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Kalenderdag die bij een offset hoort, gegeven de wedstrijddatum. */
function dateForOffset(eventDate: string, offset: number): string {
  return toDayKey(dayStart(eventDate.slice(0, 10)) - offset * DAY_MS);
}

export function offsetLabel(offset: number): string {
  if (offset === 0) return "EVENT";
  return offset > 0 ? `D-${offset}` : `D+${-offset}`;
}

/** Voluit, voor de tooltip. */
export function offsetSentence(offset: number): string {
  if (offset === 0) return "Wedstrijddag";
  if (offset === 1) return "1 dag voor de wedstrijd";
  if (offset > 1) return `${offset} dagen voor de wedstrijd`;
  return offset === -1 ? "1 dag na de wedstrijd" : `${-offset} dagen na de wedstrijd`;
}

function dayLabel(dayKey: string): string {
  const [, m, d] = dayKey.split("-");
  return `${d}/${m}`;
}

export interface BuildComparisonOptions {
  mode?: ComparisonMode;
  window?: ComparisonWindow;
}

export interface ComparisonData {
  rows: ComparisonRow[];
  series: ComparisonSeries[];
  /** Het getoonde offsetbereik, hoog naar laag. */
  from: number;
  to: number;
}

/**
 * Zet de live meetreeks en de gekozen historische wedstrijden om in één rijenset
 * op dagen-tot-event.
 *
 * Het venster staat standaard op het bereik van de live wedstrijd. Die heeft
 * doorgaans veel minder dagen dan de historie, en zonder klemmen zouden de
 * staven van de live wedstrijd in een berg lege kolommen verdwijnen. `full`
 * toont de volledige verkoopperiode; dat zijn zoveel kolommen dat de grafiek
 * daar naar lijnen overschakelt.
 */
export function buildComparisonRows(
  livePoints: DailySalesPoint[],
  allInputs: ComparisonInput[],
  { mode = "perDag", window = "live" }: BuildComparisonOptions = {}
): ComparisonData {
  // Een serie zonder dagen levert niets op en zou `Math.max()` op -Infinity
  // laten uitkomen.
  const inputs = allInputs.filter((i) => i.perOffset.size > 0);

  const liveByOffset = new Map<number, DailySalesPoint>();
  for (const point of livePoints) {
    if (point.daysUntilEvent !== null) liveByOffset.set(point.daysUntilEvent, point);
  }
  const liveOffsets = [...liveByOffset.keys()];

  // Zonder eventdatum bestaat er geen dagen-tot-event en dus geen gedeelde as.
  if (liveOffsets.length === 0 && inputs.length === 0) {
    return { rows: [], series: [], from: 0, to: 0 };
  }

  const liveFrom = liveOffsets.length ? Math.max(...liveOffsets) : null;
  const liveTo = liveOffsets.length ? Math.min(...liveOffsets) : null;

  let from: number;
  let to: number;
  if (window === "live" && liveFrom !== null && liveTo !== null) {
    from = liveFrom;
    to = liveTo;
  } else {
    const firsts = inputs.map((i) => Math.max(...i.perOffset.keys()));
    const lasts = inputs.map((i) => Math.min(...i.perOffset.keys()));
    if (liveFrom !== null) firsts.push(liveFrom);
    if (liveTo !== null) lasts.push(liveTo);
    from = firsts.length ? Math.max(...firsts) : 0;
    to = lasts.length ? Math.min(...lasts) : 0;
  }

  const series: ComparisonSeries[] = inputs.map((input, index) => {
    let windowTotal = 0;
    for (const [offset, count] of input.perOffset) {
      if (offset <= from && offset >= to) windowTotal += count;
    }
    return {
      id: input.id,
      dataKey: `c${index}`,
      name: input.name,
      season: input.season,
      color: COMPARISON_COLORS[index % COMPARISON_COLORS.length],
      dash: COMPARISON_DASHES[index % COMPARISON_DASHES.length],
      eventDate: input.eventDate.slice(0, 10),
      total: input.total,
      windowTotal,
    };
  });

  // Cumulatief meelopen vanaf de vroegste verkoopdag van elke serie, ook als
  // die vóór het venster ligt: het tempo-percentage moet het echte aandeel van
  // de totale verkoop zijn, niet het aandeel binnen het venster.
  const runningPerSeries = new Map<string, number>();
  for (const input of inputs) {
    let running = 0;
    const firstOffset = Math.max(...input.perOffset.keys());
    for (let offset = firstOffset; offset > from; offset--) {
      running += input.perOffset.get(offset) ?? 0;
    }
    runningPerSeries.set(input.id, running);
  }

  const rows: ComparisonRow[] = [];
  for (let offset = from; offset >= to; offset--) {
    const livePoint = liveByOffset.get(offset) ?? null;

    const liveValue = (() => {
      if (!livePoint) return null;
      if (mode === "perDag") return livePoint.sold;
      if (livePoint.cumulativeSold === null) return null;
      // Bezetting als aandeel van de capaciteit die op dat moment bekend was.
      const capacity = livePoint.cumulativeSold + (livePoint.available ?? 0);
      if (capacity <= 0) return null;
      return Math.round((livePoint.cumulativeSold / capacity) * 1000) / 10;
    })();

    const row: ComparisonRow = {
      offset,
      key: String(offset),
      axisLabel: offsetLabel(offset),
      liveLabel: livePoint ? dayLabel(livePoint.date) : null,
      liveDate: livePoint ? livePoint.date : null,
      live: liveValue,
      dates: {},
      counts: {},
    };

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      // `series` is per index uit `inputs` opgebouwd, dus die lopen gelijk.
      const descriptor = series[i];
      const count = input.perOffset.has(offset)
        ? (input.perOffset.get(offset) ?? 0)
        : null;

      row.dates[descriptor.dataKey] = dateForOffset(input.eventDate, offset);
      row.counts[descriptor.dataKey] = count;

      if (mode === "perDag") {
        // Buiten het verkoopvenster expliciet `null` in plaats van 0: anders
        // suggereert een vlakke nulstaart dat er te koop was maar niets verkocht.
        row[descriptor.dataKey] = count;
      } else {
        const running = (runningPerSeries.get(input.id) ?? 0) + (count ?? 0);
        runningPerSeries.set(input.id, running);
        row[descriptor.dataKey] =
          input.total > 0 && count !== null
            ? Math.round((running / input.total) * 1000) / 10
            : null;
      }
    }

    rows.push(row);
  }

  return { rows, series, from, to };
}

/**
 * Welke kolommen een aslabel krijgen. Het aantal volgt de werkelijke breedte,
 * en de wedstrijddag is het anker zodat dat label altijd blijft staan. De
 * eerste en laatste kolom krijgen er altijd een, anders blijft de rand kaal.
 */
export function visibleOffsetTicks(
  rows: ComparisonRow[],
  chartWidth: number,
  pitchPx = 46,
  gutterPx = 96
): Set<number> {
  if (rows.length === 0) return new Set();
  const maxLabels = Math.max(2, Math.floor(Math.max(0, chartWidth - gutterPx) / pitchPx));
  const step = Math.max(1, Math.ceil(rows.length / maxLabels));
  const eventIndex = rows.findIndex((r) => r.offset === 0);
  const anchor = eventIndex >= 0 ? eventIndex : rows.length - 1;

  const visible = new Set<number>();
  for (let i = anchor; i >= 0; i -= step) visible.add(i);
  for (let i = anchor; i < rows.length; i += step) visible.add(i);
  visible.add(0);
  visible.add(rows.length - 1);
  return visible;
}
