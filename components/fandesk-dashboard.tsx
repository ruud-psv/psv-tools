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
  TAXONOMY_LABELS,
  TAXONOMY_LEVELS,
  toAmsterdamParts,
  TOP_LEVEL,
  UNSET_LABEL,
  type TaxonomyNode,
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
 * Kleuren per groep — de bovenste laag van de taxonomie. Recharts heeft
 * letterlijke waarden nodig, dus dit zijn de PSV-tokens.
 *
 * Waarom maar drie hues: in een treemap kan elk vlak aan elk ander grenzen, dus
 * geldt de strengere all-pairs kleurenblindheidstoets. Rood naast oranje zakt
 * daar naar ΔE 10,7 — onder de harde ondergrens van 15 — terwijl rood/blauw/groen
 * de toets wél haalt. Groepen daarbuiten krijgen grijs; in een treemap draagt het
 * label de identiteit, en de tabel eronder geeft de exacte aantallen.
 */
const GROUP_HUES = [
  "#e82026", // color.red.primary
  "#2e5aac", // color.info
  "#287d3c", // color.success
] as const;

/**
 * Groepen buiten de eerste drie. Twee grijstinten in plaats van één, zodat twee
 * naast elkaar liggende restgroepen in de legenda niet hetzelfde vakje krijgen.
 */
const OTHER_GROUP_COLORS = ["#595959", "#8c8c8c"];
const OTHER_GROUP_COLOR = OTHER_GROUP_COLORS[0];
/** Tickets waar Freshdesk niets invulde. */
const UNSET_COLOR = "#cccccc"; // color.gray.08

/**
 * Kleur per groep. De volgorde komt van de server, bepaald over een vast venster
 * van 180 dagen — niet over de gekozen periode. Zo krijgen de grootste groepen de
 * onderscheidende kleuren, terwijl een wissel van 30 naar 7 dagen ze niet omgooit:
 * kleur hoort bij de categorie, niet bij zijn positie in de ranglijst van nu.
 */
function buildGroupColors(colorOrder: string[], present: string[]): Record<string, string> {
  const colors: Record<string, string> = { [UNSET_LABEL]: UNSET_COLOR };
  // Groepen die alleen in deze periode voorkomen achteraan toevoegen, zodat ze
  // ook een kleur hebben.
  const ordered = [...colorOrder, ...present.filter((s) => !colorOrder.includes(s))].filter(
    (group) => group !== UNSET_LABEL
  );
  ordered.forEach((group, index) => {
    colors[group] =
      index < GROUP_HUES.length
        ? GROUP_HUES[index]
        : OTHER_GROUP_COLORS[(index - GROUP_HUES.length) % OTHER_GROUP_COLORS.length];
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

/**
 * "Type · subtype · soort" — de niveaus in de volgorde waarin ze genest zijn.
 * Staat hier één keer zodat de kaarttekst en de tabelkop niet uit de pas kunnen
 * lopen met TAXONOMY_LEVELS.
 */
const LEVEL_HEADING = TAXONOMY_LEVELS.map((level, index) =>
  index === 0 ? TAXONOMY_LABELS[level] : TAXONOMY_LABELS[level].toLowerCase()
).join(" · ");

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
 * Eén rij in de tijdgrafiek. De aantallen per groep staan als losse sleutels op
 * het object omdat recharts op `dataKey` stapelt, en de groepen pas op
 * runtime bekend zijn — ze komen uit Freshdesk, niet uit een vaste lijst.
 */
interface SeriesRow {
  key: string;
  label: string;
  fullLabel: string;
  total: number;
  [group: string]: number | string;
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

  /** Groepen in de volgorde die de server bepaalde: op aantal, hoogste eerst. */
  const groups = useMemo(() => data?.groups ?? [], [data]);
  const groupColors = useMemo(
    () => buildGroupColors(data?.groupColorOrder ?? [], groups),
    [data, groups]
  );
  const taxonomy = useMemo<TaxonomyNode[]>(() => data?.taxonomy ?? [], [data]);

  /**
   * De treemap en de tabel tonen alleen ingedeelde tickets, dus hun percentages
   * moeten tegen dát aantal afgezet worden. Tegen het totaal zouden alle aandelen
   * structureel te laag uitvallen en nooit optellen tot 100%.
   */
  const classifiedTotal = useMemo(
    () => data?.classifiedTotal ?? taxonomy.reduce((sum, node) => sum + node.count, 0),
    [data, taxonomy]
  );

  /**
   * De legenda boven de treemap leest de boom zelf uit in plaats van `groups`.
   * Dat laatste bevat ook "Niet ingevuld" voor de tijdgrafiek, en een vakje in de
   * legenda dat nergens in de treemap terugkomt laat de kijker zoeken naar iets
   * wat er niet is.
   */
  const taxonomyGroups = useMemo(() => taxonomy.map((node) => node.label), [taxonomy]);

  /**
   * De boom in de vorm die recharts verwacht, recursief opgebouwd zodat de
   * nestvolgorde alleen in TAXONOMY_LEVELS staat. Elk knooppunt draagt `group`
   * (de bovenste laag, voor de kleur) en `path` (de labels tot hier, voor de
   * tooltip) mee. `tint` maakt opeenvolgende bladeren binnen één tak iets lichter,
   * zodat aangrenzende vlakken van elkaar te onderscheiden zijn.
   */
  const treemapData = useMemo(() => {
    const toCell = (
      node: TaxonomyNode,
      group: string,
      path: string[],
      index: number
    ): Record<string, unknown> => {
      const here = [...path, node.label];
      const cell: Record<string, unknown> = { name: node.label, group, path: here };
      if (node.children.length) {
        cell.children = node.children.map((child, i) => toCell(child, group, here, i));
      } else {
        cell.tint = index % 4;
        cell.size = node.count;
      }
      return cell;
    };
    return taxonomy.map((node) => toCell(node, node.label, [], 0));
  }, [taxonomy]);

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
        // Elke groep krijgt een sleutel, ook als hij in dit bucket niet voorkomt:
        // recharts stapelt anders een gat in plaats van een nul.
        for (const group of groups) row[group] = 0;
        rows.set(key, row);
      }
      for (const [group, count] of Object.entries(bucket.counts)) {
        row[group] = ((row[group] as number) ?? 0) + count;
        row.total += count;
      }
    }

    return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [data, activeGranularity, groups]);

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

  const groupRows = useMemo(() => {
    if (!data) return [];
    return groups.map((group) => {
      const count = data.totals.byGroup[group] ?? 0;
      const before = data.previous.byGroup[group] ?? 0;
      return {
        group,
        count,
        before,
        // Afzetten tegen het ingedeelde totaal, net als de treemap en de tabel.
        // Tegen het totaal zou dezelfde groep op één pagina twee percentages
        // krijgen — 45,8% in de KPI en 48,3% in de tabel.
        share: classifiedTotal > 0 ? (count / classifiedTotal) * 100 : 0,
        delta: count - before,
      };
    });
  }, [data, groups, classifiedTotal]);

  // "Niet ingevuld" is geen categorie maar het ontbreken ervan; als grootste
  // categorie aankondigen zegt niets over waar de vragen over gaan.
  const largest = groupRows.find((row) => row.group !== UNSET_LABEL) ?? null;
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
              label={`Grootste ${TAXONOMY_LABELS[TOP_LEVEL].toLowerCase()}`}
              value={largest && largest.count > 0 ? largest.group : "—"}
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
                    {stacked ? "Alleen totaal" : `Per ${TAXONOMY_LABELS[TOP_LEVEL].toLowerCase()}`}
                  </button>
                </CardHeader>
                <CardContent>
                  {stacked && <GroupLegend groups={groups} colors={groupColors} />}
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
                            content={<SeriesTooltip groups={groups} colors={groupColors} />}
                          />
                          {groups.map((group, index) => (
                            <Bar
                              key={group}
                              dataKey={group}
                              stackId="tickets"
                              fill={groupColors[group]}
                              maxBarSize={24}
                              // 2px in surface-kleur = de tussenruimte tussen segmenten
                              stroke={SURFACE}
                              strokeWidth={2}
                              radius={
                                index === groups.length - 1
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
                            stroke={GROUP_HUES[0]}
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
                              {groups.map((group) => (
                                <th
                                  key={group}
                                  className="py-2 pr-4 text-right font-heading text-xs uppercase tracking-wide text-muted-foreground"
                                >
                                  {group}
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
                                {groups.map((group) => (
                                  <td
                                    key={group}
                                    className="py-1.5 pr-4 text-right tabular-nums"
                                  >
                                    {formatNumber((row[group] as number) ?? 0)}
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
                        {LEVEL_HEADING} zoals Freshdesk de tickets indeelt, van breed naar fijn.
                        De grootte van een vlak is het aantal tickets.
                      </p>
                      {(data.unclassifiedCount ?? 0) > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatNumber(data.unclassifiedCount ?? 0)} tickets zonder indeling zijn
                          hier niet meegeteld; ze staan wel in de totalen en in de grafiek over
                          tijd.
                        </p>
                      )}
                    </div>
                    {(data.inferredCount ?? 0) > 0 && (
                      <span className="shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5 text-psv-gold" />
                        {formatNumber(data.inferredCount ?? 0)} door AI ingedeeld
                      </span>
                    )}
                  </CardHeader>
                  <CardContent>
                    <GroupLegend groups={taxonomyGroups} colors={groupColors} />
                    <div className="h-96 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <Treemap
                          data={treemapData}
                          dataKey="size"
                          isAnimationActive={false}
                          stroke={SURFACE}
                          content={<TreemapCell colors={groupColors} />}
                        >
                          <Tooltip content={<TreemapTooltip total={classifiedTotal} />} />
                        </Treemap>
                      </ResponsiveContainer>
                    </div>

                    <details className="accordion mt-4">
                      <summary>Tabelweergave</summary>
                      <div className="accordion__content">
                        <TaxonomyTable
                          taxonomy={taxonomy}
                          colors={groupColors}
                          total={classifiedTotal}
                          groupRows={groupRows}
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
function GroupLegend({
  groups,
  colors,
}: {
  groups: string[];
  colors: Record<string, string>;
}) {
  if (groups.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-4 mb-4">
      {groups.map((group) => (
        <span key={group} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5"
            style={{ backgroundColor: colors[group] ?? OTHER_GROUP_COLOR }}
          />
          {group}
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
  groups = [],
  colors = {},
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  totalOnly?: boolean;
  groups?: string[];
  colors?: Record<string, string>;
}) {
  const row = active && payload?.length ? payload[0].payload : null;
  if (!row) return null;
  return (
    <div className="border border-border bg-card px-3 py-2 shadow-card">
      <p className="text-xs text-muted-foreground mb-1.5">{row.fullLabel}</p>
      {!totalOnly &&
        groups
          .filter((group) => ((row[group] as number) ?? 0) > 0)
          .map((group) => (
          <p key={group} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="inline-block h-0.5 w-3 shrink-0"
              style={{ backgroundColor: colors[group] ?? OTHER_GROUP_COLOR }}
            />
            <span className="font-bold tabular-nums">
              {formatNumber((row[group] as number) ?? 0)}
            </span>
            <span className="text-xs text-muted-foreground">{group}</span>
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
  /** De bovenste laag waar dit vlak onder valt — bepaalt de kleurfamilie. */
  group?: string;
  /** De labels van boven naar beneden, voor de tooltip. */
  path?: string[];
  tint?: number;
  colors?: Record<string, string>;
}

/**
 * Eigen renderer voor de treemap. De diepte bepaalt de rol: de bovenste laag
 * krijgt alleen een omlijsting, de middelste een fijne scheiding, en het diepste
 * niveau is het gevulde vlak. Zo zie je de drie lagen zonder dat de kleuren gaan
 * schreeuwen.
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
    group,
    path = [],
    tint = 0,
    colors = {},
  } = props;

  if (width <= 0 || height <= 0) return null;

  const base = colors[group ?? name] ?? OTHER_GROUP_COLOR;

  // Diepte 1 is de bovenste laag. Alleen een kader: de kinderen vullen de ouder
  // volledig, dus een label hier zou er altijd achter verdwijnen. De groepering
  // leest af aan de kleurfamilie van de vlakken, met de legenda als naamgeving.
  if (depth === 1) {
    return (
      <rect x={x} y={y} width={width} height={height} fill="none" stroke={base} strokeWidth={2} />
    );
  }

  // Diepte 2 is de middelste laag: geen vulling, alleen een fijne scheiding.
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

  // Diepte 3 is de diepste laag: het gevulde vlak dat het aantal draagt.
  const fill = lighten(base, 0.25 + Math.min(tint, 3) * 0.15);

  /*
   * Het diepste niveau herhaalt zich: dezelfde soort komt onder meerdere
   * subtypes voor, dus vijf vakjes met "Thuiswedstrijden" zeggen los van elkaar
   * niets. Daarom staat de tak waar dit vlak onder hangt erboven, klein. Past die
   * regel er niet bij, dan valt hij weg en blijft het vlak leesbaar.
   */
  const branch = path.length > 1 ? path[path.length - 2] : "";

  // Alleen labelen als het past. Een afgekapt label is slechter dan geen label;
  // de waarde blijft bereikbaar via de tooltip en de tabel.
  const fits = width > name.length * 6.2 + 12 && height > 30;
  // Alleen samen met het blad zelf: een vlak dat wél zijn tak toont maar niet zijn
  // eigen naam, laat de lezer met de verkeerde helft achter.
  const branchFits = fits && Boolean(branch) && width > branch.length * 5.4 + 12 && height > 48;
  const top = branchFits ? y + 14 : y;

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke={SURFACE} strokeWidth={2} />
      {/*
       * `stroke="none"` is hier geen detail. De <Treemap> krijgt stroke={SURFACE}
       * mee voor de tussenruimte tussen de vlakken, en recharts zet die op de
       * omhullende <g>. Stroke erft in SVG, dus de labels kregen een witte lijn
       * van 1px over hun eigen vulling heen — bij 11px is dat breder dan de stok
       * van de letter zelf, waardoor de tekst wit en vet werd in plaats van donker
       * en gewoon.
       *
       * Alle regels dragen dezelfde inkt: #333333 haalde op de donkerste tinten
       * maar 3,3:1, terwijl #09101d overal minstens 4,95:1 haalt. De hiërarchie
       * zit in de tekstgrootte, niet in de kleur.
       */}
      {branchFits && (
        <text x={x + 6} y={y + 13} fill="#09101d" stroke="none" fontSize={9}>
          {branch}
        </text>
      )}
      {fits && (
        <>
          <text x={x + 6} y={top + 16} fill="#09101d" stroke="none" fontSize={11}>
            {name}
          </text>
          <text x={x + 6} y={top + 29} fill="#09101d" stroke="none" fontSize={10}>
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
  // Het pad reist mee op het knooppunt, dus de tooltip hoeft niets te raden over
  // welk niveau hij in handen heeft.
  const path = (Array.isArray(node.path) ? node.path : []).filter(
    (part): part is string => typeof part === "string" && part.length > 0
  );
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
  groupRows,
  previousLabel,
}: {
  taxonomy: TaxonomyNode[];
  colors: Record<string, string>;
  total: number;
  groupRows: Array<{ group: string; count: number; before: number; delta: number }>;
  previousLabel: string;
}) {
  const deltaFor = (group: string) => groupRows.find((row) => row.group === group);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 pr-4 font-heading text-xs uppercase tracking-wide text-muted-foreground">
              {LEVEL_HEADING}
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
          {taxonomy.map((node) => (
            <TaxonomyRows
              key={node.label}
              node={node}
              path={[]}
              depth={0}
              colors={colors}
              total={total}
              delta={deltaFor(node.label)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Opmaak per diepte: inspringing, tekstgrootte en hoe zwaar de scheidingslijn is. */
const ROW_STYLES = [
  { cell: "py-2 pr-4", indent: "", text: "", border: "border-b border-border/50" },
  { cell: "py-1.5 pr-4", indent: "pl-6", text: "text-muted-foreground", border: "border-b border-border/30" },
  { cell: "py-1 pr-4", indent: "pl-12", text: "text-xs text-muted-foreground", border: "border-b border-border/20" },
] as const;

/**
 * Eén knoop plus alles eronder. Recursief in plaats van drie uitgeschreven lagen,
 * zodat de tabel meebeweegt met TAXONOMY_LEVELS in plaats van de nestvolgorde nog
 * eens vast te leggen.
 */
function TaxonomyRows({
  node,
  path,
  depth,
  colors,
  total,
  delta,
}: {
  node: TaxonomyNode;
  path: string[];
  depth: number;
  colors: Record<string, string>;
  total: number;
  delta?: { count: number; before: number; delta: number };
}) {
  const style = ROW_STYLES[Math.min(depth, ROW_STYLES.length - 1)];
  const isTop = depth === 0;
  const key = [...path, node.label].join("/");

  return (
    <Fragment key={key}>
      <tr className={style.border}>
        <td className={cn(style.cell, style.indent, style.text)}>
          {isTop ? (
            <span className="flex items-center gap-2 font-bold">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 shrink-0"
                style={{ backgroundColor: colors[node.label] ?? OTHER_GROUP_COLOR }}
              />
              {node.label}
            </span>
          ) : (
            node.label
          )}
        </td>
        <td className={cn(style.cell, "text-right tabular-nums", style.text, isTop && "font-bold")}>
          {formatNumber(node.count)}
        </td>
        <td className={cn(style.cell, "text-right tabular-nums", !isTop && style.text)}>
          {formatPercent(total > 0 ? (node.count / total) * 100 : 0)}
        </td>
        <td className={isTop ? "py-2 text-right" : undefined}>
          {isTop && delta && (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              {formatNumber(delta.before)}
              {delta.delta !== 0 && (
                <Badge variant={delta.delta > 0 ? "warning" : "success"} className="gap-1">
                  {delta.delta > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {delta.delta > 0 ? "+" : "−"}
                  {formatNumber(Math.abs(delta.delta))}
                </Badge>
              )}
            </span>
          )}
        </td>
      </tr>
      {node.children.map((child) => (
        <TaxonomyRows
          key={`${key}/${child.label}`}
          node={child}
          path={[...path, node.label]}
          depth={depth + 1}
          colors={colors}
          total={total}
        />
      ))}
    </Fragment>
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
              fill={GROUP_HUES[0]}
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
