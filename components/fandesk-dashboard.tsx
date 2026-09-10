"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Headset,
  Layers,
  Lightbulb,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KpiCard, formatNumber } from "@/lib/dm-share";
import {
  dayCount,
  shiftDayKey,
  toAmsterdamParts,
  UNSET_LABEL,
  type SoortNode,
} from "@/lib/fandesk";
import type { FandeskData, FandeskDaySummary } from "@/app/api/fandesk/route";
import type { FandeskAlert } from "@/lib/insights/fandesk";

/** Prozatekst over de periode, zoals /api/fandesk/summary hem teruggeeft. */
interface PeriodSummary {
  summary: string;
  highlights: { type: string; text: string }[];
  recommendations: string[];
  generatedAt: string;
}

/**
 * Kleuren per soort. Recharts heeft letterlijke waarden nodig, dus dit zijn de
 * PSV-tokens.
 *
 * Waarom maar drie hues: in een treemap kan elk vlak aan elk ander grenzen, dus
 * geldt de strengere all-pairs kleurenblindheidstoets. Rood naast oranje zakt
 * daar naar ΔE 10,7 — onder de harde ondergrens van 15 — terwijl rood/blauw/groen
 * de toets wél haalt. Soorten daarbuiten krijgen grijs; in een treemap draagt het
 * label de identiteit, en de tabel eronder geeft de exacte aantallen.
 */
const SOORT_HUES = [
  "#e82026", // color.red.primary
  "#2e5aac", // color.info
  "#287d3c", // color.success
] as const;

/**
 * Soorten buiten de eerste drie. Twee grijstinten in plaats van één, zodat twee
 * naast elkaar liggende restsoorten in de legenda niet hetzelfde vakje krijgen.
 */
const OTHER_SOORT_COLORS = ["#595959", "#8c8c8c"];
const OTHER_SOORT_COLOR = OTHER_SOORT_COLORS[0];
/** Tickets waar Freshdesk niets invulde. */
const UNSET_COLOR = "#cccccc"; // color.gray.08

/**
 * Kleur per soort. De volgorde komt van de server, bepaald over een vast venster
 * van 180 dagen — niet over de gekozen periode. Zo krijgen de grootste soorten de
 * onderscheidende kleuren, terwijl een wissel van 30 naar 7 dagen ze niet omgooit:
 * kleur hoort bij de categorie, niet bij zijn positie in de ranglijst van nu.
 */
function buildSoortColors(colorOrder: string[], present: string[]): Record<string, string> {
  const colors: Record<string, string> = { [UNSET_LABEL]: UNSET_COLOR };
  // Soorten die alleen in deze periode voorkomen achteraan toevoegen, zodat ze
  // ook een kleur hebben.
  const ordered = [...colorOrder, ...present.filter((s) => !colorOrder.includes(s))].filter(
    (soort) => soort !== UNSET_LABEL
  );
  ordered.forEach((soort, index) => {
    colors[soort] =
      index < SOORT_HUES.length
        ? SOORT_HUES[index]
        : OTHER_SOORT_COLORS[(index - SOORT_HUES.length) % OTHER_SOORT_COLORS.length];
  });
  return colors;
}

/** Lichtere tint van dezelfde kleur, voor de diepere niveaus in de treemap. */
function lighten(hex: string, amount: number): string {
  const value = hex.replace("#", "");
  const to = (offset: number) => {
    const channel = parseInt(value.slice(offset, offset + 2), 16);
    return Math.round(channel + (255 - channel) * amount);
  };
  return `rgb(${to(0)}, ${to(2)}, ${to(4)})`;
}

/** Surface-kleur voor de 2px tussenruimte in gestapelde staven. */
const SURFACE = "hsl(var(--card))";
const AXIS_INK = "hsl(var(--muted-foreground))";
const GRID_INK = "hsl(var(--border))";

type Period = "7d" | "30d" | "90d" | "custom";
type Granularity = "hour" | "day" | "week";

const PERIOD_LABELS: Record<Exclude<Period, "custom">, string> = {
  "7d": "7 dagen",
  "30d": "30 dagen",
  "90d": "90 dagen",
};

const PERIOD_DAYS: Record<Exclude<Period, "custom">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const GRANULARITY_LABELS: Record<Granularity, string> = {
  hour: "Per uur",
  day: "Per dag",
  week: "Per week",
};

const BUSIEST_LABELS: Record<Granularity, string> = {
  hour: "Drukste uur",
  day: "Drukste dag",
  week: "Drukste week",
};

const WEEKDAY_LABELS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

function todayKey(): string {
  return toAmsterdamParts(new Date().toISOString())?.dayKey ?? new Date().toISOString().slice(0, 10);
}

function formatPercent(value: number): string {
  return `${value.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`;
}

/**
 * Compact datumbereik in Nederlandse notatie: "1 – 30 jun" binnen één maand,
 * "25 jun – 24 jul" daarbuiten. Middaguur om tijdzone-schuif te vermijden.
 */
function formatDayRange(from: string, to: string): string {
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "";
  const day = (d: Date) => d.toLocaleDateString("nl-NL", { day: "numeric", timeZone: "UTC" });
  const dayMonth = (d: Date) =>
    d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", timeZone: "UTC" });
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();
  return `${sameMonth ? day(start) : dayMonth(start)} – ${dayMonth(end)}`;
}

function formatDelta(current: number, previous: number): { text: string; up: boolean | null } {
  if (previous === 0) {
    if (current === 0) return { text: "gelijk aan vorige periode", up: null };
    return { text: "geen data in vorige periode", up: null };
  }
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 0.05) return { text: "gelijk aan vorige periode", up: null };
  const sign = change > 0 ? "+" : "−";
  return {
    text: `${sign}${formatPercent(Math.abs(change))} t.o.v. vorige periode`,
    up: change > 0,
  };
}

/** ISO-weeknummer, voor de week-granulariteit. */
function isoWeekKey(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayOfWeek + 3); // donderdag van deze week
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayOfWeek = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayOfWeek + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Maandag van de ISO-week waarin `dayKey` valt. */
function weekStart(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayOfWeek);
  return date.toISOString().slice(0, 10);
}

/**
 * Eén rij in de tijdgrafiek. De aantallen per soort staan als losse sleutels op
 * het object omdat recharts op `dataKey` stapelt, en de soorten pas op
 * runtime bekend zijn — ze komen uit Freshdesk, niet uit een vaste lijst.
 */
interface SeriesRow {
  key: string;
  label: string;
  fullLabel: string;
  total: number;
  [soort: string]: number | string;
}

export function FANdeskDashboard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [granularity, setGranularity] = useState<Granularity | "auto">("auto");
  const [stacked, setStacked] = useState(true);
  const [data, setData] = useState<FandeskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodSummary, setPeriodSummary] = useState<PeriodSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const range = useMemo(() => {
    if (period === "custom" && customFrom && customTo) {
      return { from: customFrom, to: customTo };
    }
    const to = todayKey();
    const days = PERIOD_DAYS[(period === "custom" ? "30d" : period) as Exclude<Period, "custom">];
    return { from: shiftDayKey(to, -(days - 1)), to };
  }, [period, customFrom, customTo]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fandesk?from=${range.from}&to=${range.to}`, {
        cache: "no-store",
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? "Ophalen mislukt.");
      const next = payload as FandeskData;
      setData(next);
      // De opgeslagen periodetekst overnemen; is die verlopen, dan komt hier null
      // en biedt de kaart de knop om hem bij te werken.
      setPeriodSummary(next.periodSummary ?? null);
      setSummaryError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ophalen mislukt.");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /** De enige plek waar een klik een AI-call kost. */
  const refreshPeriodSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await fetch("/api/fandesk/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: range.from, to: range.to }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? "Analyse mislukt.");
      setPeriodSummary(payload as PeriodSummary);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Analyse mislukt.");
    } finally {
      setSummaryLoading(false);
    }
  }, [range.from, range.to]);

  const spanDays = dayCount(range.from, range.to);

  const activeGranularity: Granularity =
    granularity !== "auto" ? granularity : spanDays <= 2 ? "hour" : spanDays <= 62 ? "day" : "week";

  /** Soorten in de volgorde die de server bepaalde: op aantal, hoogste eerst. */
  const soorten = useMemo(() => data?.soorten ?? [], [data]);
  const soortColors = useMemo(
    () => buildSoortColors(data?.soortColorOrder ?? [], soorten),
    [data, soorten]
  );
  const taxonomy = useMemo<SoortNode[]>(() => data?.taxonomy ?? [], [data]);

  /**
   * De boom in de vorm die recharts verwacht. `soort` en `typeName` reizen mee op
   * elk knooppunt, zodat de renderer de kleur kan bepalen en de tooltip het hele
   * pad kan tonen. `tint` maakt opeenvolgende subtypes binnen één soort iets
   * lichter, zodat aangrenzende vlakken van elkaar te onderscheiden zijn.
   */
  const treemapData = useMemo(
    () =>
      taxonomy.map((soortNode) => ({
        name: soortNode.soort,
        soort: soortNode.soort,
        children: soortNode.types.map((typeNode) => ({
          name: typeNode.type,
          soort: soortNode.soort,
          typeName: typeNode.type,
          children: typeNode.subtypes.map((sub, index) => ({
            name: sub.subtype,
            soort: soortNode.soort,
            typeName: typeNode.type,
            tint: index % 4,
            size: sub.count,
          })),
        })),
      })),
    [taxonomy]
  );

  /** Buckets herrekenen naar de gekozen granulariteit, in Amsterdamse tijd. */
  const series = useMemo<SeriesRow[]>(() => {
    if (!data) return [];
    const rows = new Map<string, SeriesRow>();

    for (const bucket of data.buckets) {
      const parts = toAmsterdamParts(bucket.ts);
      if (!parts) continue;

      let key: string;
      let label: string;
      let fullLabel: string;
      const dayDate = new Date(`${parts.dayKey}T12:00:00Z`);
      const dayShort = dayDate.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
      const dayLong = dayDate.toLocaleDateString("nl-NL", {
        weekday: "short",
        day: "numeric",
        month: "long",
      });

      if (activeGranularity === "hour") {
        key = `${parts.dayKey}T${String(parts.hour).padStart(2, "0")}`;
        label = `${String(parts.hour).padStart(2, "0")}:00`;
        fullLabel = `${dayLong} ${label}`;
      } else if (activeGranularity === "day") {
        key = parts.dayKey;
        label = dayShort;
        fullLabel = dayLong;
      } else {
        key = isoWeekKey(parts.dayKey);
        const start = new Date(`${weekStart(parts.dayKey)}T12:00:00Z`);
        label = `wk ${key.slice(6)}`;
        fullLabel = `Week ${Number(key.slice(6))} — vanaf ${start.toLocaleDateString("nl-NL", {
          day: "numeric",
          month: "long",
        })}`;
      }

      let row = rows.get(key);
      if (!row) {
        row = { key, label, fullLabel, total: 0 };
        // Elke soort krijgt een sleutel, ook als hij in dit bucket niet voorkomt:
        // recharts stapelt anders een gat in plaats van een nul.
        for (const soort of soorten) row[soort] = 0;
        rows.set(key, row);
      }
      for (const [soort, count] of Object.entries(bucket.counts)) {
        row[soort] = ((row[soort] as number) ?? 0) + count;
        row.total += count;
      }
    }

    return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [data, activeGranularity, soorten]);

  /** Verdeling per weekdag en per uur van de dag, beide in Amsterdamse tijd. */
  const rhythm = useMemo(() => {
    const weekdays = WEEKDAY_LABELS.map((label) => ({ label, total: 0 }));
    const hours = Array.from({ length: 24 }, (_, hour) => ({
      label: String(hour).padStart(2, "0"),
      total: 0,
    }));
    if (!data) return { weekdays, hours };
    for (const bucket of data.buckets) {
      const parts = toAmsterdamParts(bucket.ts);
      if (!parts) continue;
      const count = Object.values(bucket.counts).reduce((sum, n) => sum + n, 0);
      weekdays[parts.weekday].total += count;
      hours[parts.hour].total += count;
    }
    return { weekdays, hours };
  }, [data]);

  /**
   * De heads-up hoort bij de meest recente dag met een samenvatting. Oudere
   * alerts blijven in de "Per dag"-lijst staan maar horen niet als banner boven
   * het dashboard — dan zou een piek van drie weken terug nog om aandacht vragen.
   */
  const activeAlerts = useMemo(() => {
    const days = data?.daySummaries ?? [];
    if (!days.length) return [];
    // daySummaries komt nieuwste eerst uit de API.
    const latest = days[0];
    // Alleen als die dag ook echt actueel is. Bij een periode uit het verleden
    // hoort een heads-up niet bovenaan de pagina — de tekst zegt "vandaag" en het
    // is geen actie meer. Hij blijft wel staan in de "Per dag"-lijst.
    const yesterday = shiftDayKey(todayKey(), -1);
    if (latest.day < yesterday) return [];
    return (latest.alerts ?? []).map((alert) => ({ ...alert, day: latest.day }));
  }, [data]);

  const totals = data?.totals ?? null;
  const total = totals?.total ?? 0;
  const busiest = useMemo(() => {
    if (!series.length) return null;
    return series.reduce((best, row) => (row.total > best.total ? row : best), series[0]);
  }, [series]);

  const soortRows = useMemo(() => {
    if (!data) return [];
    return soorten.map((soort) => {
      const count = data.totals.bySoort[soort] ?? 0;
      const before = data.previous.bySoort[soort] ?? 0;
      return {
        soort,
        count,
        before,
        share: total > 0 ? (count / total) * 100 : 0,
        delta: count - before,
      };
    });
  }, [data, soorten, total]);

  const largest = soortRows[0] ?? null;
  const totalDelta = data ? formatDelta(total, data.previous.total) : { text: "", up: null };
  const perDay = total / Math.max(1, spanDays);

  function applyPeriod(next: Exclude<Period, "custom">) {
    setPeriod(next);
    setCustomFrom("");
    setCustomTo("");
    setGranularity("auto");
  }

  const showEmpty = !loading && !error && data !== null && total === 0;

  return (
    <div className="space-y-8">
      {/* Eén filterrij boven alles wat hij bepaalt */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          {(Object.keys(PERIOD_LABELS) as Exclude<Period, "custom">[]).map((p) => (
            <button
              key={p}
              onClick={() => applyPeriod(p)}
              className={cn(
                "px-3 py-1.5 text-sm font-heading uppercase tracking-wide transition-colors",
                period === p
                  ? "bg-psv-red-primary text-white"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              aria-label="Startdatum"
              value={customFrom}
              max={customTo || todayKey()}
              onChange={(e) => setCustomFrom(e.target.value)}
              className={cn(
                "bg-card border border-border px-2 py-1.5 text-sm text-foreground",
                period === "custom" && "border-psv-red-primary"
              )}
            />
            <span className="text-muted-foreground text-sm">–</span>
            <input
              type="date"
              aria-label="Einddatum"
              value={customTo}
              max={todayKey()}
              onChange={(e) => setCustomTo(e.target.value)}
              className={cn(
                "bg-card border border-border px-2 py-1.5 text-sm text-foreground",
                period === "custom" && "border-psv-red-primary"
              )}
            />
            <button
              onClick={() => {
                if (customFrom && customTo) {
                  setPeriod("custom");
                  setGranularity("auto");
                }
              }}
              disabled={!customFrom || !customTo}
              className="px-3 py-1.5 text-sm font-heading uppercase tracking-wide bg-card border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              Toepassen
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex">
            {(Object.keys(GRANULARITY_LABELS) as Granularity[]).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={cn(
                  "px-3 py-1.5 text-sm font-heading uppercase tracking-wide border border-border transition-colors",
                  activeGranularity === g
                    ? "bg-psv-gray-11 text-white border-psv-gray-11"
                    : "bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {GRANULARITY_LABELS[g]}
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-heading uppercase tracking-wide bg-card border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Verversen
          </button>
        </div>
      </div>

      {error && (
        <Card>
          <CardContent className="flex items-start gap-3 py-6">
            <AlertCircle className="h-5 w-5 shrink-0 text-error" />
            <div>
              <p className="text-sm text-foreground">{error}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Probeer het opnieuw te verversen. Blijft het misgaan? Dan is de opslag nog niet
                geconfigureerd.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-psv-red-primary" />
        </div>
      )}

      {data && (
        // Bij verversen de vorige render vasthouden op halve dekking — geen layout-sprong.
        <div className={cn("space-y-8 transition-opacity", loading && "opacity-50")}>
          <HeadsUpBanner alerts={activeAlerts} />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Tickets totaal"
              value={formatNumber(total)}
              sub={totalDelta.text}
              icon={Headset}
            />
            <KpiCard
              label="Gemiddeld per dag"
              value={perDay.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}
              sub={`over ${spanDays} ${spanDays === 1 ? "dag" : "dagen"}`}
              icon={CalendarClock}
            />
            <KpiCard
              label={BUSIEST_LABELS[activeGranularity]}
              value={busiest && busiest.total > 0 ? formatNumber(busiest.total) : "—"}
              sub={busiest && busiest.total > 0 ? busiest.fullLabel : "geen tickets"}
              icon={TrendingUp}
            />
            <KpiCard
              label="Grootste soort"
              value={largest && largest.count > 0 ? largest.soort : "—"}
              sub={
                largest && largest.count > 0
                  ? `${formatNumber(largest.count)} tickets · ${formatPercent(largest.share)}`
                  : "geen tickets"
              }
              icon={Layers}
            />
          </div>

          {showEmpty ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  Nog geen tickets ontvangen in deze periode.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Zodra de n8n workflow zijn eerste batch stuurt, verschijnen de cijfers hier.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <ContentCard
                data={data}
                onRefreshSummary={refreshPeriodSummary}
                summaryLoading={summaryLoading}
                summaryError={summaryError}
                periodSummary={periodSummary}
              />

              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg font-heading uppercase tracking-wide">
                      Tickets over tijd
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {GRANULARITY_LABELS[activeGranularity].toLowerCase()}, Nederlandse tijd
                    </p>
                  </div>
                  <button
                    onClick={() => setStacked((s) => !s)}
                    className="shrink-0 px-3 py-1.5 text-xs font-heading uppercase tracking-wide bg-card border border-border text-muted-foreground hover:text-foreground"
                  >
                    {stacked ? "Alleen totaal" : "Per soort"}
                  </button>
                </CardHeader>
                <CardContent>
                  {stacked && <SoortLegend soorten={soorten} colors={soortColors} />}
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      {stacked ? (
                        <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid vertical={false} stroke={GRID_INK} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 10, fill: AXIS_INK }}
                            tickLine={false}
                            axisLine={{ stroke: GRID_INK }}
                            interval="preserveStartEnd"
                            minTickGap={16}
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: AXIS_INK }}
                            tickLine={false}
                            axisLine={false}
                            allowDecimals={false}
                            width={36}
                          />
                          <Tooltip
                            cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.4 }}
                            content={<SeriesTooltip soorten={soorten} colors={soortColors} />}
                          />
                          {soorten.map((soort, index) => (
                            <Bar
                              key={soort}
                              dataKey={soort}
                              stackId="tickets"
                              fill={soortColors[soort]}
                              maxBarSize={24}
                              // 2px in surface-kleur = de tussenruimte tussen segmenten
                              stroke={SURFACE}
                              strokeWidth={2}
                              radius={
                                index === soorten.length - 1
                                  ? ([4, 4, 0, 0] as [number, number, number, number])
                                  : undefined
                              }
                            />
                          ))}
                        </BarChart>
                      ) : (
                        <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid vertical={false} stroke={GRID_INK} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 10, fill: AXIS_INK }}
                            tickLine={false}
                            axisLine={{ stroke: GRID_INK }}
                            interval="preserveStartEnd"
                            minTickGap={16}
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: AXIS_INK }}
                            tickLine={false}
                            axisLine={false}
                            allowDecimals={false}
                            width={36}
                          />
                          <Tooltip
                            cursor={{ stroke: GRID_INK }}
                            content={<SeriesTooltip totalOnly />}
                          />
                          <Line
                            type="monotone"
                            dataKey="total"
                            name="Totaal"
                            stroke={SOORT_HUES[0]}
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 2, stroke: SURFACE }}
                          />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  </div>

                  <details className="accordion mt-4">
                    <summary>Tabelweergave</summary>
                    <div className="accordion__content">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-left">
                              <th className="py-2 pr-4 font-heading text-xs uppercase tracking-wide text-muted-foreground">
                                Periode
                              </th>
                              {soorten.map((soort) => (
                                <th
                                  key={soort}
                                  className="py-2 pr-4 text-right font-heading text-xs uppercase tracking-wide text-muted-foreground"
                                >
                                  {soort}
                                </th>
                              ))}
                              <th className="py-2 text-right font-heading text-xs uppercase tracking-wide text-muted-foreground">
                                Totaal
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {series.map((row) => (
                              <tr key={row.key} className="border-b border-border/50">
                                <td className="py-1.5 pr-4 text-muted-foreground">
                                  {row.fullLabel}
                                </td>
                                {soorten.map((soort) => (
                                  <td
                                    key={soort}
                                    className="py-1.5 pr-4 text-right tabular-nums"
                                  >
                                    {formatNumber((row[soort] as number) ?? 0)}
                                  </td>
                                ))}
                                <td className="py-1.5 text-right tabular-nums font-bold">
                                  {formatNumber(row.total)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </details>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg font-heading uppercase tracking-wide">
                        Waar gaan ze over?
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        Soort, type en subtype zoals Freshdesk de tickets indeelt. De grootte van
                        een vlak is het aantal tickets.
                      </p>
                    </div>
                    {(data.inferredCount ?? 0) > 0 && (
                      <span className="shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5 text-psv-gold" />
                        {formatNumber(data.inferredCount ?? 0)} door AI ingedeeld
                      </span>
                    )}
                  </CardHeader>
                  <CardContent>
                    <SoortLegend soorten={soorten} colors={soortColors} />
                    <div className="h-96 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <Treemap
                          data={treemapData}
                          dataKey="size"
                          isAnimationActive={false}
                          stroke={SURFACE}
                          content={<TreemapCell colors={soortColors} />}
                        >
                          <Tooltip content={<TreemapTooltip total={total} />} />
                        </Treemap>
                      </ResponsiveContainer>
                    </div>

                    <details className="accordion mt-4">
                      <summary>Tabelweergave</summary>
                      <div className="accordion__content">
                        <TaxonomyTable
                          taxonomy={taxonomy}
                          colors={soortColors}
                          total={total}
                          soortRows={soortRows}
                          previousLabel={formatDayRange(data.previous.from, data.previous.to)}
                        />
                      </div>
                    </details>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg font-heading uppercase tracking-wide">
                      Wanneer komen ze binnen?
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Alle tickets in de periode, opgeteld per weekdag en per uur van de dag
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <RhythmChart
                      title="Per weekdag"
                      data={rhythm.weekdays}
                      unitLabel="tickets"
                      height={128}
                    />
                    <RhythmChart
                      title="Per uur van de dag"
                      data={rhythm.hours}
                      unitLabel="tickets"
                      height={128}
                      suffix=":00"
                    />
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          <p className="text-xs text-muted-foreground">
            {data.lastTicketAt
              ? `Laatste ticket in deze periode: ${new Date(data.lastTicketAt).toLocaleString(
                  "nl-NL",
                  { timeZone: "Europe/Amsterdam", dateStyle: "medium", timeStyle: "short" }
                )}`
              : "Nog geen tickets in deze periode."}{" "}
            · Bijgewerkt{" "}
            {new Date(data.generatedAt).toLocaleTimeString("nl-NL", {
              timeZone: "Europe/Amsterdam",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      )}
    </div>
  );
}

/** Legenda — de betrouwbare identiteitslaag; kleur alleen is nooit genoeg. */
function SoortLegend({
  soorten,
  colors,
}: {
  soorten: string[];
  colors: Record<string, string>;
}) {
  if (soorten.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-4 mb-4">
      {soorten.map((soort) => (
        <span key={soort} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5"
            style={{ backgroundColor: colors[soort] ?? OTHER_SOORT_COLOR }}
          />
          {soort}
        </span>
      ))}
    </div>
  );
}

interface TooltipPayloadEntry {
  payload?: SeriesRow;
}

function SeriesTooltip({
  active,
  payload,
  totalOnly = false,
  soorten = [],
  colors = {},
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  totalOnly?: boolean;
  soorten?: string[];
  colors?: Record<string, string>;
}) {
  const row = active && payload?.length ? payload[0].payload : null;
  if (!row) return null;
  return (
    <div className="border border-border bg-card px-3 py-2 shadow-card">
      <p className="text-xs text-muted-foreground mb-1.5">{row.fullLabel}</p>
      {!totalOnly &&
        soorten
          .filter((soort) => ((row[soort] as number) ?? 0) > 0)
          .map((soort) => (
          <p key={soort} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="inline-block h-0.5 w-3 shrink-0"
              style={{ backgroundColor: colors[soort] ?? OTHER_SOORT_COLOR }}
            />
            <span className="font-bold tabular-nums">
              {formatNumber((row[soort] as number) ?? 0)}
            </span>
            <span className="text-xs text-muted-foreground">{soort}</span>
          </p>
        ))}
      <p className="mt-1.5 pt-1.5 border-t border-border text-sm">
        <span className="font-bold tabular-nums">{formatNumber(row.total)}</span>{" "}
        <span className="text-xs text-muted-foreground">totaal</span>
      </p>
    </div>
  );
}

/** Eén knooppunt zoals recharts het aan de renderer geeft. */
interface TreemapNodeProps {
  depth?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  value?: number;
  soort?: string;
  tint?: number;
  colors?: Record<string, string>;
}

/**
 * Eigen renderer voor de treemap. De diepte bepaalt de rol: een soort krijgt
 * alleen een omlijsting en zijn naam, een subtype is het gevulde vlak. Zo zie je
 * de drie lagen zonder dat de kleuren gaan schreeuwen.
 */
function TreemapCell(props: TreemapNodeProps) {
  const {
    depth = 0,
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    name = "",
    value = 0,
    soort,
    tint = 0,
    colors = {},
  } = props;

  if (width <= 0 || height <= 0) return null;

  const base = colors[soort ?? name] ?? OTHER_SOORT_COLOR;

  // Diepte 1 is de soort. Alleen een kader: de kinderen vullen de ouder volledig,
  // dus een label hier zou er altijd achter verdwijnen. De groepering leest af aan
  // de kleurfamilie van de vlakken, met de legenda als naamgeving.
  if (depth === 1) {
    return (
      <rect x={x} y={y} width={width} height={height} fill="none" stroke={base} strokeWidth={2} />
    );
  }

  // Diepte 2 is het type: geen vulling, alleen een fijne scheiding.
  if (depth === 2) {
    return (
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="none"
        stroke={SURFACE}
        strokeWidth={2}
      />
    );
  }

  // Diepte 3 is het subtype: het gevulde vlak dat het aantal draagt.
  const fill = lighten(base, 0.25 + Math.min(tint, 3) * 0.15);
  // Alleen labelen als het past. Een afgekapt label is slechter dan geen label;
  // de waarde blijft bereikbaar via de tooltip en de tabel.
  const fits = width > name.length * 6.2 + 12 && height > 30;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke={SURFACE} strokeWidth={2} />
      {fits && (
        <>
          <text x={x + 6} y={y + 16} fill="#09101d" fontSize={11}>
            {name}
          </text>
          <text x={x + 6} y={y + 29} fill="#333333" fontSize={10} className="tabular-nums">
            {formatNumber(value)}
          </text>
        </>
      )}
    </g>
  );
}

function TreemapTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: Array<{ payload?: Record<string, unknown> }>;
  total?: number;
}) {
  const node = active && payload?.length ? payload[0].payload : null;
  if (!node) return null;
  const count = Number(node.value) || 0;
  const path = [node.soort, node.typeName, node.name]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .filter((part, index, all) => all.indexOf(part) === index);
  return (
    <div className="border border-border bg-card px-3 py-2 shadow-card">
      <p className="text-sm">
        <span className="font-bold tabular-nums">{formatNumber(count)}</span>{" "}
        <span className="text-xs text-muted-foreground">tickets</span>
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">{path.join(" › ")}</p>
      {total && total > 0 && (
        <p className="text-xs text-muted-foreground">
          {formatPercent((count / total) * 100)} van het totaal
        </p>
      )}
    </div>
  );
}

/**
 * De tabel naast de treemap. Oppervlaktes zijn slecht te vergelijken, dus dit is
 * waar de exacte aantallen staan — en waar de hele boom leesbaar blijft, ook de
 * vlakjes die te klein waren voor een label.
 */
function TaxonomyTable({
  taxonomy,
  colors,
  total,
  soortRows,
  previousLabel,
}: {
  taxonomy: SoortNode[];
  colors: Record<string, string>;
  total: number;
  soortRows: Array<{ soort: string; count: number; before: number; delta: number }>;
  previousLabel: string;
}) {
  const deltaFor = (soort: string) => soortRows.find((row) => row.soort === soort);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 pr-4 font-heading text-xs uppercase tracking-wide text-muted-foreground">
              Soort · type · subtype
            </th>
            <th className="py-2 pr-4 text-right font-heading text-xs uppercase tracking-wide text-muted-foreground">
              Aantal
            </th>
            <th className="py-2 pr-4 text-right font-heading text-xs uppercase tracking-wide text-muted-foreground">
              Aandeel
            </th>
            <th className="py-2 text-right font-heading text-xs uppercase tracking-wide text-muted-foreground">
              Vorige periode
              <span className="block font-sans normal-case tracking-normal">{previousLabel}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {taxonomy.map((soortNode) => {
            const row = deltaFor(soortNode.soort);
            return (
              <Fragment key={soortNode.soort}>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4">
                    <span className="flex items-center gap-2 font-bold">
                      <span
                        aria-hidden
                        className="inline-block h-2.5 w-2.5 shrink-0"
                        style={{ backgroundColor: colors[soortNode.soort] ?? OTHER_SOORT_COLOR }}
                      />
                      {soortNode.soort}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums font-bold">
                    {formatNumber(soortNode.count)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {formatPercent(total > 0 ? (soortNode.count / total) * 100 : 0)}
                  </td>
                  <td className="py-2 text-right">
                    {row && (
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        {formatNumber(row.before)}
                        {row.delta !== 0 && (
                          <Badge variant={row.delta > 0 ? "warning" : "success"} className="gap-1">
                            {row.delta > 0 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            {row.delta > 0 ? "+" : "−"}
                            {formatNumber(Math.abs(row.delta))}
                          </Badge>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
                {soortNode.types.map((typeNode) => (
                  <Fragment key={`${soortNode.soort}/${typeNode.type}`}>
                    <tr className="border-b border-border/30">
                      <td className="py-1.5 pr-4 pl-6 text-muted-foreground">{typeNode.type}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums">
                        {formatNumber(typeNode.count)}
                      </td>
                      <td className="py-1.5 pr-4 text-right tabular-nums text-muted-foreground">
                        {formatPercent(total > 0 ? (typeNode.count / total) * 100 : 0)}
                      </td>
                      <td />
                    </tr>
                    {typeNode.subtypes.map((sub) => (
                      <tr
                        key={`${soortNode.soort}/${typeNode.type}/${sub.subtype}`}
                        className="border-b border-border/20"
                      >
                        <td className="py-1 pr-4 pl-12 text-xs text-muted-foreground">
                          {sub.subtype}
                        </td>
                        <td className="py-1 pr-4 text-right text-xs tabular-nums text-muted-foreground">
                          {formatNumber(sub.count)}
                        </td>
                        <td className="py-1 pr-4 text-right text-xs tabular-nums text-muted-foreground">
                          {formatPercent(total > 0 ? (sub.count / total) * 100 : 0)}
                        </td>
                        <td />
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Klein staafdiagram voor één reeks — geen legenda nodig, de titel benoemt hem. */
function RhythmChart({
  title,
  data,
  unitLabel,
  height,
  suffix = "",
}: {
  title: string;
  data: Array<{ label: string; total: number }>;
  unitLabel: string;
  height: number;
  suffix?: string;
}) {
  return (
    <div>
      <p className="font-heading text-xs uppercase tracking-wide text-muted-foreground mb-2">
        {title}
      </p>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_INK} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: AXIS_INK }}
              tickLine={false}
              axisLine={{ stroke: GRID_INK }}
              interval="preserveStartEnd"
              minTickGap={4}
            />
            <YAxis
              tick={{ fontSize: 10, fill: AXIS_INK }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={32}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.4 }}
              content={({ active, payload }) => {
                const row = active && payload?.length ? payload[0].payload : null;
                if (!row) return null;
                return (
                  <div className="border border-border bg-card px-3 py-2 shadow-card">
                    <p className="text-sm">
                      <span className="font-bold tabular-nums">{formatNumber(row.total)}</span>{" "}
                      <span className="text-xs text-muted-foreground">{unitLabel}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {row.label}
                      {suffix}
                    </p>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="total"
              fill={SOORT_HUES[0]}
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Heads-up voor de support desk. Alleen zichtbaar als er echt iets uitspringt —
 * het model geeft standaard een lege lijst terug. De onderbouwing staat er bewust
 * bij: het model beoordeelt zelf wat opvalt, dus de lezer moet kunnen zien waarop
 * dat gebaseerd is.
 */
function HeadsUpBanner({ alerts }: { alerts: Array<FandeskAlert & { day: string }> }) {
  if (!alerts.length) return null;
  // Alerts ouder dan gisteren worden niet als banner getoond, dus de dag is altijd
  // vandaag of gisteren. Alleen dat laatste is het benoemen waard.
  const today = todayKey();
  return (
    <div className="space-y-3">
      {alerts.map((alert, index) => (
        <div key={index} className="alert alert--warning">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm">
                <span className="font-heading uppercase tracking-wide">
                  Let op{alert.day !== today ? ", gisteren" : ""}
                </span>
                {" — "}
                {String(alert.label ?? "")}
              </p>
              {alert.evidence && (
                <p className="text-xs tabular-nums">{String(alert.evidence)}</p>
              )}
              {alert.advice && (
                <p className="text-xs italic">Advies: {String(alert.advice)}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function highlightIcon(type: string) {
  const base = "h-4 w-4 shrink-0 mt-0.5";
  switch (type) {
    case "achievement":
      return <CheckCircle2 className={cn(base, "text-success")} />;
    case "warning":
      return <AlertTriangle className={cn(base, "text-error")} />;
    case "anomaly":
      return <AlertTriangle className={cn(base, "text-warning")} />;
    default:
      return <TrendingUp className={cn(base, "text-info")} />;
  }
}

/** "Wat wordt er gevraagd?" — de inhoudelijke kaart naast de cijfers. */
function ContentCard({
  data,
  periodSummary,
  summaryLoading,
  summaryError,
  onRefreshSummary,
}: {
  data: FandeskData;
  periodSummary: PeriodSummary | null;
  summaryLoading: boolean;
  summaryError: string | null;
  onRefreshSummary: () => void;
}) {
  const daySummaries = data.daySummaries ?? [];
  const themes = data.topThemes ?? [];
  const themeTotal = themes.reduce((sum, t) => sum + (Number(t.count) || 0), 0);
  const singleDay = data.from === data.to;

  // Bij één dag in het bereik is de dagsamenvatting de periodesamenvatting.
  const prose = singleDay ? daySummaries[0]?.summary ?? null : periodSummary?.summary ?? null;
  const highlights = singleDay ? [] : periodSummary?.highlights ?? [];
  const recommendations = singleDay ? [] : periodSummary?.recommendations ?? [];

  // Nog geen enkele onderwerpregel aangeleverd: dit is de normale staat vlak na
  // het uitrollen, en voor alle tickets van vóór deze functie.
  if (!daySummaries.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 py-8">
          <MessageSquareText className="h-5 w-5 shrink-0 text-psv-gold" />
          <div>
            <p className="text-sm">Nog geen inhoud over deze periode.</p>
            <p className="text-xs text-muted-foreground mt-1">
              {data.hasTopics
                ? "De samenvatting wordt gemaakt zodra de volgende n8n-batch binnenkomt."
                : "Zodra n8n onderwerpregels meestuurt, staat hier wat er gevraagd wordt en waar de desk op moet letten."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-t-2 border-t-psv-gold">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-lg font-heading uppercase tracking-wide">
            Wat wordt er gevraagd?
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {singleDay
              ? "Samenvatting van deze dag"
              : `Samenvatting over ${daySummaries.length} ${
                  daySummaries.length === 1 ? "dag" : "dagen"
                } met inhoud`}
          </p>
        </div>
        {!singleDay && (
          <button
            onClick={onRefreshSummary}
            disabled={summaryLoading}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-heading uppercase tracking-wide bg-card border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", summaryLoading && "animate-spin")} />
            {periodSummary ? "Bijwerken" : "Samenvatten"}
          </button>
        )}
      </CardHeader>

      <CardContent className="space-y-5">
        {summaryLoading && !prose ? (
          <div className="flex items-center gap-3 py-2">
            <Loader2 className="h-5 w-5 animate-spin text-psv-gold" />
            <span className="text-sm text-muted-foreground">Samenvatting wordt gemaakt…</span>
          </div>
        ) : prose ? (
          <p className="text-sm leading-relaxed">{String(prose)}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {data.periodSummaryStale
              ? "Er is nieuwe data sinds de laatste samenvatting. Klik op Bijwerken voor een tekst over deze periode."
              : "Klik op Samenvatten voor een tekst over deze periode."}
          </p>
        )}

        {summaryError && <p className="text-xs text-error">{summaryError}</p>}

        {themes.length > 0 && (
          <div>
            <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground mb-2">
              Meest voorkomende vragen
              {themeTotal > 0 && (
                <span className="font-sans normal-case tracking-normal">
                  {" "}
                  — aandeel van {formatNumber(themeTotal)} vragen met onderwerp
                </span>
              )}
            </p>
            <ul className="space-y-1.5">
              {themes.slice(0, 8).map((theme) => (
                <li key={theme.label} className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="flex items-baseline gap-2 min-w-0">
                    <span
                      aria-hidden
                      className="inline-block h-1.5 w-1.5 shrink-0 translate-y-[-2px] bg-psv-red-primary"
                    />
                    <span className="truncate">{String(theme.label)}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatNumber(Number(theme.count) || 0)}
                    {themeTotal > 0 && (
                      <span className="ml-2">
                        {formatPercent(((Number(theme.count) || 0) / themeTotal) * 100)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {highlights.length > 0 && (
          <div className="space-y-2">
            {highlights.map((h, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                {highlightIcon(String(h.type ?? "trend"))}
                <span>{String(h.text ?? "")}</span>
              </div>
            ))}
          </div>
        )}

        {recommendations.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 text-xs font-heading uppercase tracking-wide text-muted-foreground mb-2">
              <Lightbulb className="h-3.5 w-3.5" />
              Zo nemen deze vragen af
            </p>
            <ul className="space-y-2">
              {recommendations.map((r, i) => (
                <li
                  key={i}
                  className="text-sm pl-3 border-l-2 border-psv-gold text-muted-foreground"
                >
                  {String(r ?? "")}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!singleDay && daySummaries.length > 0 && (
          <details className="accordion">
            <summary>Per dag</summary>
            <div className="accordion__content space-y-4">
              {daySummaries.map((day) => (
                <DaySummaryBlock key={day.day} day={day} />
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function DaySummaryBlock({ day }: { day: FandeskDaySummary }) {
  const label = new Date(`${day.day}T12:00:00Z`).toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return (
    <div className="space-y-1.5">
      <p className="font-heading text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm leading-relaxed">{String(day.summary ?? "")}</p>
      {day.themes.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {day.themes
            .slice(0, 5)
            .map((t) => `${String(t.label)} (${Number(t.count) || 0})`)
            .join(" · ")}
        </p>
      )}
      {day.alerts.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{day.alerts.map((a) => String(a.label)).join(" · ")}</span>
        </p>
      )}
    </div>
  );
}
