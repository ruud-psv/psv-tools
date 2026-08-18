"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SnapshotPoint } from "@/lib/blob-snapshots";
import { buildDailySales, countSalesDays, type DailySalesPoint } from "@/lib/ticket-daily-sales";
import {
  buildComparisonRows,
  offsetSentence,
  visibleOffsetTicks,
  type ComparisonInput,
  type ComparisonMode,
  type ComparisonRow,
  type ComparisonSeries,
  type ComparisonWindow,
} from "@/lib/ticket-sales-comparison";

/**
 * Staafkleuren uit de PSV-tokens (`@psv/branding/tokens/tokens.json`). Recharts
 * heeft letterlijke kleuren nodig, geen Tailwind-classes — zelfde aanpak als
 * `CHART_COLORS` in `app/share/rapportage/page.tsx`.
 */
const BAR_COLORS = {
  far: "#f79da1", // color.red.light — meer dan 14 dagen tot het event
  near: "#e82026", // color.red.primary — 8 t/m 14 dagen
  urgent: "#c00d0d", // color.red.secondary — laatste week
  past: "#cccccc", // color.gray.08 — na de eventdag
  refund: "#b95000", // color.warning — netto retouren op die dag
  event: "#bb9753", // color.gold — markering van de eventdag
};

function barColor(point: DailySalesPoint): string {
  if ((point.sold ?? 0) < 0) return BAR_COLORS.refund;
  const days = point.daysUntilEvent;
  if (days === null) return BAR_COLORS.near;
  if (days < 0) return BAR_COLORS.past;
  if (days <= 7) return BAR_COLORS.urgent;
  if (days <= 14) return BAR_COLORS.near;
  return BAR_COLORS.far;
}

/** Korte aanduiding onder de staaf: hoeveel dagen was het die dag nog tot het event. */
function countdownLabel(days: number | null): string {
  if (days === null) return "";
  if (days === 0) return "EVENT";
  return days > 0 ? `D-${days}` : `D+${-days}`;
}

function countdownColor(days: number | null): string {
  if (days === null) return "hsl(var(--muted-foreground))";
  if (days === 0) return BAR_COLORS.event;
  if (days < 0) return "hsl(var(--muted-foreground))";
  if (days <= 7) return BAR_COLORS.urgent;
  return "hsl(var(--muted-foreground))";
}

/** Voluit in de tooltip. */
function countdownSentence(days: number | null): string | null {
  if (days === null) return null;
  if (days === 0) return "Eventdag";
  if (days === 1) return "Nog 1 dag tot het event";
  if (days > 1) return `Nog ${days} dagen tot het event`;
  return days === -1 ? "1 dag na het event" : `${-days} dagen na het event`;
}

function formatCompactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10_000) return `${Math.round(value / 1000)}k`;
  if (abs >= 1_000) {
    const k = value / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1).replace(".", ",")}k`;
  }
  return value.toLocaleString("nl-NL");
}

function formatFullDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "2-digit",
    month: "long",
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

/** Ruimte die een aslabel ("30/07" boven "D-14") minimaal nodig heeft. */
const LABEL_PITCH_PX = 46;
/** Ruwe schatting van de breedte die de twee Y-assen opsnoepen. */
const AXIS_GUTTER_PX = 96;

/**
 * Bepaalt welke staven een aslabel krijgen. De datum- en de dagen-tot-event-regel
 * gebruiken dezelfde indexen, zodat de twee regels netjes onder elkaar uitlijnen.
 * Het aantal labels volgt de werkelijke breedte, zodat ze op een smal scherm niet
 * over elkaar heen vallen.
 */
function visibleTickIndexes(points: DailySalesPoint[], chartWidth: number): Set<number> {
  const maxLabels = Math.max(
    2,
    Math.floor(Math.max(0, chartWidth - AXIS_GUTTER_PX) / LABEL_PITCH_PX)
  );
  const step = Math.max(1, Math.ceil(points.length / maxLabels));
  // Anker op de eventdag als die in het venster valt, anders op de laatste dag:
  // zo blijft het belangrijkste label altijd staan én blijft de spatiëring gelijk.
  const eventIndex = points.findIndex((p) => p.daysUntilEvent === 0);
  const anchor = eventIndex >= 0 ? eventIndex : points.length - 1;
  const visible = new Set<number>();
  for (let i = anchor; i >= 0; i -= step) visible.add(i);
  for (let i = anchor; i < points.length; i += step) visible.add(i);
  return visible;
}

function DayTick({
  x,
  y,
  index,
  points,
  visible,
}: {
  x?: number;
  y?: number;
  index?: number;
  points: DailySalesPoint[];
  visible: Set<number>;
}) {
  if (typeof x !== "number" || typeof y !== "number" || typeof index !== "number") return null;
  if (!visible.has(index)) return null;
  const point = points[index];
  if (!point) return null;
  const countdown = countdownLabel(point.daysUntilEvent);
  const isEventDay = point.daysUntilEvent === 0;

  return (
    <g>
      <text
        x={x}
        y={y + 11}
        textAnchor="middle"
        fontSize={10}
        fill="hsl(var(--muted-foreground))"
      >
        {point.label}
      </text>
      {countdown && (
        <text
          x={x}
          y={y + 24}
          textAnchor="middle"
          fontSize={isEventDay ? 8 : 9}
          fontWeight={isEventDay || (point.daysUntilEvent ?? 99) <= 7 ? 700 : 400}
          fill={countdownColor(point.daysUntilEvent)}
        >
          {countdown}
        </text>
      )}
    </g>
  );
}

function ChartTooltip({
  active,
  label,
  points,
}: {
  active?: boolean;
  label?: string | number;
  points: DailySalesPoint[];
}) {
  if (!active) return null;
  const point = points.find((p) => p.label === label);
  if (!point) return null;

  const countdown = countdownSentence(point.daysUntilEvent);

  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-2 text-[11px] text-popover-foreground shadow-sm">
      <p className="font-heading uppercase tracking-wide">{formatFullDate(point.date)}</p>
      {!point.hasData ? (
        <p className="mt-1 text-muted-foreground">Geen meting op deze dag</p>
      ) : point.sold === null ? (
        <p className="mt-1 text-muted-foreground">
          Eerste meting — dagverkoop nog niet te berekenen
        </p>
      ) : (
        <p className="mt-1">
          <span className="font-heading">{point.sold.toLocaleString("nl-NL")}</span>{" "}
          {point.sold < 0 ? "netto retour" : "verkocht"}
          {point.spanDays > 1 && (
            <span className="text-muted-foreground"> over {point.spanDays} dagen</span>
          )}
        </p>
      )}
      {point.cumulativeSold !== null && (
        <p className="text-muted-foreground">
          Totaal {point.cumulativeSold.toLocaleString("nl-NL")} verkocht
          {point.available !== null && ` · ${point.available.toLocaleString("nl-NL")} beschikbaar`}
        </p>
      )}
      {countdown && <p className="mt-1">{countdown}</p>}
      {point.measuredAt && (
        <p className="text-muted-foreground">Meting van {formatTime(point.measuredAt)}</p>
      )}
    </div>
  );
}

function LegendStrip({
  hasEventDate,
  hasRefunds,
}: {
  hasEventDate: boolean;
  hasRefunds: boolean;
}) {
  const items = hasEventDate
    ? [
        { color: BAR_COLORS.far, label: "> 14 dagen" },
        { color: BAR_COLORS.near, label: "8-14 dagen" },
        { color: BAR_COLORS.urgent, label: "≤ 7 dagen" },
      ]
    : [{ color: BAR_COLORS.near, label: "Verkocht per dag" }];
  if (hasRefunds) items.push({ color: BAR_COLORS.refund, label: "Netto retour" });

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
      <span className="flex items-center gap-1">
        <span className="h-px w-3 bg-foreground/50" />
        Totaal verkocht
      </span>
    </div>
  );
}

/* ---------- Vergelijkmodus ---------- */

/**
 * Aslabel in vergelijkmodus. Regel 1 is de kolomidentiteit (`D-14`), regel 2 de
 * kalenderdatum van de live wedstrijd — omgekeerd aan de enkelvoudige weergave,
 * want die datum hoort nu bij één van de series in plaats van bij de hele as.
 */
function OffsetTick({
  x,
  y,
  index,
  rows,
  visible,
}: {
  x?: number;
  y?: number;
  index?: number;
  rows: ComparisonRow[];
  visible: Set<number>;
}) {
  if (typeof x !== "number" || typeof y !== "number" || typeof index !== "number") return null;
  if (!visible.has(index)) return null;
  const row = rows[index];
  if (!row) return null;
  const isEventDay = row.offset === 0;

  // De buitenste labels staan pal op de rand van het tekengebied; gecentreerd
  // zou de helft ("EVENT" op de eventdag) buiten de svg vallen.
  const anchor =
    index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle";

  return (
    <g>
      <text
        x={x}
        y={y + 11}
        textAnchor={anchor}
        fontSize={isEventDay ? 8 : 9}
        fontWeight={isEventDay || row.offset <= 7 ? 700 : 400}
        fill={countdownColor(row.offset)}
      >
        {row.axisLabel}
      </text>
      {row.liveLabel && (
        <text
          x={x}
          y={y + 23}
          textAnchor={anchor}
          fontSize={9}
          fill="hsl(var(--muted-foreground))"
        >
          {row.liveLabel}
        </text>
      )}
    </g>
  );
}

interface TooltipPayloadItem {
  payload?: ComparisonRow;
}

function ComparisonTooltip({
  active,
  payload,
  series,
  liveName,
  mode,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  series: ComparisonSeries[];
  liveName: string;
  mode: ComparisonMode;
}) {
  // Bewust via de payload en niet via een lookup op het aslabel: in
  // vergelijkmodus staat er per kolom meer dan één wedstrijd, dus een label
  // wijst niet meer naar één punt.
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;

  const unit = mode === "tempo" ? "%" : "";
  const value = (v: unknown): string | null => {
    if (typeof v !== "number") return null;
    return mode === "tempo"
      ? `${v.toLocaleString("nl-NL")}%`
      : v.toLocaleString("nl-NL");
  };

  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-2 text-[11px] text-popover-foreground shadow-sm">
      <p className="font-heading uppercase tracking-wide">{row.axisLabel}</p>
      <p className="text-muted-foreground">{offsetSentence(row.offset)}</p>

      <div className="mt-1.5 space-y-1">
        <div className="flex items-baseline gap-1.5">
          <span
            className="mt-0.5 h-2 w-2 shrink-0 rounded-sm"
            style={{ background: BAR_COLORS.near }}
          />
          <span className="min-w-0">
            <span className="font-heading">{value(row.live) ?? "geen meting"}</span>{" "}
            <span className="text-muted-foreground">
              {liveName}
              {row.liveDate && ` · ${formatFullDate(row.liveDate)}`}
            </span>
          </span>
        </div>

        {series.map((s) => {
          const shown = value(row[s.dataKey]);
          const count = row.counts[s.dataKey];
          return (
            <div key={s.id} className="flex items-baseline gap-1.5">
              <span
                className="mt-0.5 h-2 w-2 shrink-0 rounded-sm"
                style={{ background: s.color }}
              />
              <span className="min-w-0">
                <span className="font-heading">{shown ?? "niet in verkoop"}</span>{" "}
                {mode === "tempo" && typeof count === "number" && (
                  <span className="text-muted-foreground">
                    ({count.toLocaleString("nl-NL")} die dag){" "}
                  </span>
                )}
                <span className="text-muted-foreground">
                  {s.name} · {formatFullDate(row.dates[s.dataKey])}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      {unit === "%" && (
        <p className="mt-1 text-muted-foreground">Aandeel van de totale verkoop</p>
      )}
    </div>
  );
}

function ComparisonLegend({
  series,
  liveName,
  mode,
  filtered,
}: {
  series: ComparisonSeries[];
  liveName: string;
  mode: ComparisonMode;
  filtered: boolean;
}) {
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm" style={{ background: BAR_COLORS.near }} />
          {liveName}
        </span>
        {series.map((s) => (
          <span key={s.id} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      {/* De twee reeksen zijn niet dezelfde meting; dat hoort erbij te staan. */}
      <p className="text-[10px] leading-snug text-muted-foreground">
        {mode === "tempo"
          ? "Tempo: aandeel van de eigen totale verkoop, dus onderling vergelijkbaar. "
          : ""}
        Live cijfers komen uit de ticketfeed (netto stand, retouren eraf); historische cijfers
        zijn transacties per aankoopdag (bruto).
        {filtered && (
          <>
            {" "}
            Het tickettype-filter geldt alleen voor de historische wedstrijden: de feed geeft
            één totaal per wedstrijd en kan niet uitgesplitst worden.
          </>
        )}
      </p>
    </div>
  );
}

function ComparisonChart({
  livePoints,
  comparisons,
  liveName,
  mode,
  window: windowMode,
  compact,
  chartWidth,
}: {
  livePoints: DailySalesPoint[];
  comparisons: ComparisonInput[];
  liveName: string;
  mode: ComparisonMode;
  window: ComparisonWindow;
  compact: boolean;
  chartWidth: number;
}) {
  const { rows, series } = useMemo(
    () => buildComparisonRows(livePoints, comparisons, { mode, window: windowMode }),
    [livePoints, comparisons, mode, windowMode]
  );

  if (rows.length === 0) {
    return (
      <div className="flex h-28 items-center justify-center px-4 text-center text-xs text-muted-foreground">
        Geen overlappende dagen om te vergelijken.
      </div>
    );
  }

  // Wel wedstrijden gekozen, maar geen enkele reeks over: alle tickettypes staan
  // uit. Dat is iets anders dan "geen data" en verdient een eigen boodschap.
  if (comparisons.length > 0 && series.length === 0) {
    return (
      <div className="flex h-28 items-center justify-center px-4 text-center text-xs text-muted-foreground">
        Alle tickettypes staan uit — vink er minstens één aan om te vergelijken.
      </div>
    );
  }

  const visible = visibleOffsetTicks(rows, chartWidth || (compact ? 460 : 620));
  const hasEventDay = rows.some((r) => r.offset === 0);

  // De ticketfeed geeft één totaal per wedstrijd, dus de live reeks kan een
  // tickettype-filter niet volgen. Als er gefilterd wordt, moet dat te zien zijn
  // in plaats van dat de twee reeksen zogenaamd hetzelfde meten.
  const filtered = comparisons.some((c) => c.total < c.unfilteredTotal);
  const liveLabel = filtered ? `${liveName} (ongefilterd)` : liveName;

  // Gegroepeerde staven worden onleesbaar zodra het venster de volledige
  // verkoopperiode beslaat (~130 kolommen × meerdere series), en tempo is per
  // definitie een doorlopende curve. In beide gevallen lijnen.
  const useLines = mode === "tempo" || windowMode === "full";
  const barSize = Math.max(3, Math.floor((compact ? 42 : 64) / (series.length + 1)));

  return (
    <div>
      <ResponsiveContainer width="100%" height={compact ? 200 : 260}>
        <ComposedChart data={rows} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="key"
            type="category"
            interval={0}
            height={34}
            tickLine={false}
            axisLine={false}
            tick={<OffsetTick rows={rows} visible={visible} />}
          />
          <YAxis
            yAxisId="daily"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            domain={mode === "tempo" ? [0, 100] : undefined}
            tickFormatter={
              mode === "tempo" ? (v: number) => `${v}%` : formatCompactNumber
            }
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.4 }}
            content={
              <ComparisonTooltip series={series} liveName={liveLabel} mode={mode} />
            }
          />
          {hasEventDay && (
            <ReferenceLine
              yAxisId="daily"
              x="0"
              stroke={BAR_COLORS.event}
              strokeDasharray="4 2"
            />
          )}

          {useLines ? (
            <>
              <Line
                yAxisId="daily"
                type="monotone"
                dataKey="live"
                name={liveLabel}
                stroke={BAR_COLORS.near}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
              {series.map((s) => (
                <Line
                  key={s.id}
                  yAxisId="daily"
                  type="monotone"
                  dataKey={s.dataKey}
                  name={s.name}
                  stroke={s.color}
                  strokeDasharray={s.dash || undefined}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={false}
                />
              ))}
            </>
          ) : (
            <>
              <Bar
                yAxisId="daily"
                dataKey="live"
                name={liveLabel}
                fill={BAR_COLORS.near}
                radius={[2, 2, 0, 0]}
                maxBarSize={barSize}
              />
              {series.map((s) => (
                <Bar
                  key={s.id}
                  yAxisId="daily"
                  dataKey={s.dataKey}
                  name={s.name}
                  fill={s.color}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={barSize}
                />
              ))}
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {!compact && (
        <ComparisonLegend series={series} liveName={liveLabel} mode={mode} filtered={filtered} />
      )}

      {/* Eén getal per wedstrijd zegt meer dan honderd extra kolommen. */}
      {windowMode === "live" && mode === "perDag" && (
        <div className="mt-2 space-y-0.5">
          {series
            .filter((s) => s.total > 0)
            .map((s) => (
              <p key={s.id} className="text-[10px] text-muted-foreground">
                <span style={{ color: s.color }}>■</span> In dit venster:{" "}
                {Math.round((s.windowTotal / s.total) * 100)}% van de totale verkoop van {s.name}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}

interface TicketSalesChartProps {
  eventId: string;
  /** Eventdatum uit de feed. Zonder datum vervallen de dagen-tot-event-labels. */
  eventDate?: string;
  /** Al opgehaalde snapshots; laat weg om de component zelf te laten fetchen. */
  history?: SnapshotPoint[];
  variant?: "compact" | "full";
  /**
   * Historische wedstrijden om tegen af te zetten. Leeg of weggelaten laat de
   * grafiek precies renderen zoals zonder deze functionaliteit.
   */
  comparisons?: ComparisonInput[];
  /** Naam van de live wedstrijd, voor legenda en tooltip. */
  liveName?: string;
  comparisonMode?: ComparisonMode;
  comparisonWindow?: ComparisonWindow;
}

/**
 * Verkochte tickets per dag: één staaf per kalenderdag, met de cumulatieve
 * verkoop als lijn en per staaf het aantal dagen tot de eventdatum.
 */
export function TicketSalesChart({
  eventId,
  eventDate,
  history: providedHistory,
  variant = "full",
  comparisons,
  liveName = "Deze wedstrijd",
  comparisonMode = "perDag",
  comparisonWindow = "live",
}: TicketSalesChartProps) {
  const isControlled = providedHistory !== undefined;
  const [fetched, setFetched] = useState<SnapshotPoint[]>([]);
  const [loading, setLoading] = useState(!isControlled);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);

  // Het aantal aslabels hangt af van de werkelijke breedte, dus die meten we.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    setChartWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setChartWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isControlled) return;
    setLoading(true);
    let cancelled = false;
    fetch(`/api/ticket-history?eventId=${encodeURIComponent(eventId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setFetched(data.history ?? []);
      })
      .catch(() => {
        if (!cancelled) setFetched([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, isControlled]);

  const history = providedHistory ?? fetched;
  const points = useMemo(() => buildDailySales(history, eventDate), [history, eventDate]);

  const compact = variant === "compact";
  const stateHeight = compact ? "h-24" : "h-28";
  const hasComparisons = Boolean(comparisons && comparisons.length > 0);

  // Met vergelijkingen erbij is de grafiek ook zinvol als de live reeks nog
  // te kort is voor een eigen dagverkoop — dan zie je in ieder geval de
  // historie. Zonder vergelijkingen blijft de oorspronkelijke lege staat staan.
  if (loading || (countSalesDays(points) < 1 && !hasComparisons)) {
    return (
      <div ref={wrapperRef}>
        <div
          className={`flex items-center justify-center ${stateHeight} px-4 text-center text-xs text-muted-foreground`}
        >
          {loading
            ? "Verloop laden…"
            : "Nog geen dagelijkse verkoopdata — er zijn minimaal twee meetdagen nodig. Metingen worden elke 2 uur opgeslagen."}
        </div>
      </div>
    );
  }

  if (hasComparisons) {
    return (
      <div ref={wrapperRef}>
        <ComparisonChart
          livePoints={points}
          comparisons={comparisons!}
          liveName={liveName}
          mode={comparisonMode}
          window={comparisonWindow}
          compact={compact}
          chartWidth={chartWidth}
        />
      </div>
    );
  }

  // Vóór de eerste meting een realistische aanname, zodat de eerste paint al klopt.
  const visible = visibleTickIndexes(points, chartWidth || (compact ? 460 : 620));
  const eventDayPoint = points.find((p) => p.daysUntilEvent === 0);
  const hasRefunds = points.some((p) => (p.sold ?? 0) < 0);

  return (
    <div ref={wrapperRef}>
      <ResponsiveContainer width="100%" height={compact ? 200 : 260}>
        <ComposedChart data={points} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            interval={0}
            height={34}
            tickLine={false}
            axisLine={false}
            tick={<DayTick points={points} visible={visible} />}
          />
          <YAxis
            yAxisId="daily"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tickFormatter={formatCompactNumber}
          />
          <YAxis
            yAxisId="cum"
            orientation="right"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tickFormatter={formatCompactNumber}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.4 }}
            content={<ChartTooltip points={points} />}
          />
          {eventDayPoint && (
            <ReferenceLine
              yAxisId="daily"
              x={eventDayPoint.label}
              stroke={BAR_COLORS.event}
              strokeDasharray="4 2"
            />
          )}
          <Bar
            yAxisId="daily"
            dataKey="sold"
            name="Verkocht die dag"
            radius={[2, 2, 0, 0]}
            maxBarSize={compact ? 14 : 22}
          >
            {points.map((point) => (
              <Cell key={point.date} fill={barColor(point)} />
            ))}
          </Bar>
          <Line
            yAxisId="cum"
            type="monotone"
            dataKey="cumulativeSold"
            name="Totaal verkocht"
            stroke="hsl(var(--foreground))"
            strokeOpacity={0.5}
            strokeWidth={1.5}
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
      {!compact && <LegendStrip hasEventDate={Boolean(eventDate)} hasRefunds={hasRefunds} />}
    </div>
  );
}
