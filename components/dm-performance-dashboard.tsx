"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail,
  Users,
  MousePointerClick,
  Eye,
  AlertTriangle,
  UserMinus,
  RefreshCw,
  Search,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Loader2,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

/* ---------- Types ---------- */

interface MailingSummary {
  id: number;
  name: string;
  subject: string;
  state: string;
  type: string;
  scheduleTime: string;
  recipients: number;
  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;
  bounces: number;
  unsubscriptions: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  unsubscribeRate: number;
  clickToOpenRate: number;
}

interface Totals {
  mailings: number;
  recipients: number;
  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;
  bounces: number;
  unsubscriptions: number;
  avgOpenRate: number;
  avgClickRate: number;
  avgBounceRate: number;
  avgUnsubRate: number;
  avgCtor: number;
}

interface ApiResponse {
  mailings: MailingSummary[];
  totals: Totals;
  fetchedAt: string;
}

/* ---------- Helpers ---------- */

type SortKey =
  | "scheduleTime"
  | "recipients"
  | "openRate"
  | "clickRate"
  | "bounceRate"
  | "uniqueOpens"
  | "uniqueClicks";
type SortDir = "asc" | "desc";

function formatNumber(n: number): string {
  return n.toLocaleString("nl-NL");
}

function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDateShort(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("nl-NL", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function getDateRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);

  switch (preset) {
    case "7d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { from: d.toISOString().slice(0, 10), to };
    }
    case "30d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { from: d.toISOString().slice(0, 10), to };
    }
    case "90d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      return { from: d.toISOString().slice(0, 10), to };
    }
    case "6m": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      return { from: d.toISOString().slice(0, 10), to };
    }
    case "1y": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return { from: d.toISOString().slice(0, 10), to };
    }
    default: {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { from: d.toISOString().slice(0, 10), to };
    }
  }
}

/* ---------- KPI Card ---------- */

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = "text-psv-red-primary",
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-heading uppercase tracking-wide">
          {title}
        </CardTitle>
        <Icon className={`h-5 w-5 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-heading uppercase">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Mailing Detail Panel ---------- */

function MailingDetailPanel({
  mailing,
  onClose,
}: {
  mailing: MailingSummary;
  onClose: () => void;
}) {
  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="min-w-0 flex-1">
          <CardTitle className="text-lg">{mailing.name}</CardTitle>
          {mailing.subject && (
            <p className="text-sm text-muted-foreground mt-1 truncate">
              Onderwerp: {mailing.subject}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary">{mailing.type}</Badge>
            <Badge variant={mailing.state === "done" ? "success" : "info"}>
              {mailing.state}
            </Badge>
            {mailing.scheduleTime && (
              <span className="text-xs text-muted-foreground">
                Verzonden: {formatDate(mailing.scheduleTime)}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-sm font-heading uppercase tracking-wide"
        >
          Sluiten
        </button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Ontvangers" value={formatNumber(mailing.recipients)} />
          <Stat
            label="Unieke opens"
            value={formatNumber(mailing.uniqueOpens)}
            sub={formatPct(mailing.openRate)}
          />
          <Stat
            label="Unieke clicks"
            value={formatNumber(mailing.uniqueClicks)}
            sub={formatPct(mailing.clickRate)}
          />
          <Stat
            label="Click-to-open"
            value={formatPct(mailing.clickToOpenRate)}
          />
          <Stat
            label="Totaal opens"
            value={formatNumber(mailing.opens)}
          />
          <Stat
            label="Totaal clicks"
            value={formatNumber(mailing.clicks)}
          />
          <Stat
            label="Bounces"
            value={formatNumber(mailing.bounces)}
            sub={formatPct(mailing.bounceRate)}
          />
          <Stat
            label="Uitschrijvingen"
            value={formatNumber(mailing.unsubscriptions)}
            sub={formatPct(mailing.unsubscribeRate)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground font-heading uppercase tracking-wide">
        {label}
      </p>
      <p className="text-lg font-heading uppercase">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/* ---------- Performance Chart ---------- */

function PerformanceChart({ mailings }: { mailings: MailingSummary[] }) {
  const chartData = useMemo(() => {
    const sorted = [...mailings]
      .filter((m) => m.scheduleTime)
      .sort(
        (a, b) =>
          new Date(a.scheduleTime).getTime() -
          new Date(b.scheduleTime).getTime()
      )
      .slice(-20);

    const dateCounts = new Map<string, number>();
    for (const m of sorted) {
      const d = formatDateShort(m.scheduleTime);
      dateCounts.set(d, (dateCounts.get(d) ?? 0) + 1);
    }

    const dateIndex = new Map<string, number>();
    return sorted.map((m) => {
      const date = formatDateShort(m.scheduleTime);
      const count = dateCounts.get(date) ?? 1;
      let label = date;
      if (count > 1) {
        const idx = (dateIndex.get(date) ?? 0) + 1;
        dateIndex.set(date, idx);
        label = `${date} (${idx})`;
      }

      const tooltipName = m.name.replace(/^\d{4}\.\d{2}\.\d{2}\s*/, "");

      return {
        name: m.name.length > 25 ? m.name.slice(0, 25) + "..." : m.name,
        tooltipName,
        label,
        date,
        openRate: parseFloat(m.openRate.toFixed(1)),
        clickRate: parseFloat(m.clickRate.toFixed(1)),
      };
    });
  }, [mailings]);

  if (chartData.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">Open & Click Rate per Mailing</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.2} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                stroke="#999"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="#999"
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1a1a2e",
                  border: "1px solid #333",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: 12,
                }}
                formatter={(value: unknown, name: unknown) => [
                  `${value}%`,
                  name === "openRate" ? "Open rate" : "Click rate",
                ]}
                labelFormatter={(_label, payload) => {
                  const items = payload as unknown as { payload?: { tooltipName?: string } }[];
                  return items?.[0]?.payload?.tooltipName ?? String(_label);
                }}
              />
              <Bar
                dataKey="openRate"
                name="openRate"
                fill="#e82026"
                radius={[3, 3, 0, 0]}
                maxBarSize={32}
              />
              <Bar
                dataKey="clickRate"
                name="clickRate"
                fill="#bb9753"
                radius={[3, 3, 0, 0]}
                maxBarSize={32}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-6 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-psv-red-primary" />
            Open rate
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-psv-gold" />
            Click rate
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Mailing Table ---------- */

function MailingTable({
  mailings,
  onSelect,
}: {
  mailings: MailingSummary[];
  onSelect: (m: MailingSummary) => void;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("scheduleTime");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(() => {
    let list = mailings;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.subject.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const aVal = a[sortKey] ?? 0;
      const bVal = b[sortKey] ?? 0;
      if (sortKey === "scheduleTime") {
        const aTime = aVal ? new Date(aVal as string).getTime() : 0;
        const bTime = bVal ? new Date(bVal as string).getTime() : 0;
        return sortDir === "asc" ? aTime - bTime : bTime - aTime;
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [mailings, search, sortKey, sortDir]);

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ChevronUp className="h-3 w-3" />
    ) : (
      <ChevronDown className="h-3 w-3" />
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">Mailings</CardTitle>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Zoek op naam of onderwerp..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-heading uppercase tracking-wide text-xs">
                  Mailing
                </th>
                <SortTh column="scheduleTime" label="Datum" sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort} SortIcon={SortIcon} />
                <SortTh column="recipients" label="Ontvangers" sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort} SortIcon={SortIcon} />
                <SortTh column="uniqueOpens" label="Opens" sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort} SortIcon={SortIcon} />
                <SortTh column="openRate" label="Open %" sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort} SortIcon={SortIcon} />
                <SortTh column="uniqueClicks" label="Clicks" sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort} SortIcon={SortIcon} />
                <SortTh column="clickRate" label="Click %" sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort} SortIcon={SortIcon} />
                <SortTh column="bounceRate" label="Bounce %" sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort} SortIcon={SortIcon} />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-muted-foreground">
                    Geen mailings gevonden
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => onSelect(m)}
                    className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-medium truncate">{m.name}</div>
                      {m.subject && (
                        <div className="text-xs text-muted-foreground truncate">
                          {m.subject}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {formatDate(m.scheduleTime)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatNumber(m.recipients)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatNumber(m.uniqueOpens)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <RateBadge rate={m.openRate} thresholds={[15, 25]} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatNumber(m.uniqueClicks)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <RateBadge rate={m.clickRate} thresholds={[2, 5]} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <RateBadge rate={m.bounceRate} thresholds={[5, 2]} inverted />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function SortTh({
  column,
  label,
  sortKey: _sk,
  sortDir: _sd,
  toggleSort,
  SortIcon,
}: {
  column: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: SortDir;
  toggleSort: (k: SortKey) => void;
  SortIcon: React.ComponentType<{ column: SortKey }>;
}) {
  return (
    <th
      className="px-4 py-3 font-heading uppercase tracking-wide text-xs cursor-pointer select-none text-right"
      onClick={() => toggleSort(column)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <SortIcon column={column} />
      </span>
    </th>
  );
}

function RateBadge({
  rate,
  thresholds,
  inverted = false,
}: {
  rate: number;
  thresholds: [number, number]; // [low, high] — below low=bad, above high=good
  inverted?: boolean;
}) {
  let variant: "destructive" | "warning" | "success" = "success";
  if (inverted) {
    // Higher is worse (e.g. bounce rate)
    if (rate >= thresholds[0]) variant = "destructive";
    else if (rate >= thresholds[1]) variant = "warning";
  } else {
    // Higher is better (e.g. open rate)
    if (rate < thresholds[0]) variant = "destructive";
    else if (rate < thresholds[1]) variant = "warning";
  }

  return (
    <Badge variant={variant} className="text-xs tabular-nums">
      {formatPct(rate)}
    </Badge>
  );
}

/* ---------- AI Insights ---------- */

interface DmInsightsResponse {
  summary: string;
  highlights: { type: "trend" | "anomaly" | "achievement" | "warning"; text: string }[];
  recommendations: string[];
  topPerformer: { name: string; metric: string; why: string } | null;
  bottomPerformer: { name: string; metric: string; suggestion: string } | null;
}

function DmInsightsPanel({
  mailings,
  totals,
  preset,
  onAnalyze,
  insights,
  loading,
  error,
}: {
  mailings: MailingSummary[];
  totals: Totals | undefined;
  preset: string;
  onAnalyze: () => void;
  insights: DmInsightsResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const presetLabels: Record<string, string> = {
    "7d": "laatste 7 dagen",
    "30d": "laatste 30 dagen",
    "90d": "laatste 90 dagen",
    "6m": "laatste 6 maanden",
    "1y": "laatste jaar",
  };

  const highlightIcon = (type: DmInsightsResponse["highlights"][0]["type"]) => {
    switch (type) {
      case "achievement":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />;
      case "trend":
        return <TrendingUp className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />;
      case "anomaly":
        return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;
    }
  };

  if (loading) {
    return (
      <Card className="mb-2">
        <CardContent className="flex items-center justify-center gap-3 py-8">
          <Loader2 className="h-5 w-5 animate-spin text-psv-gold" />
          <span className="text-sm text-muted-foreground">AI-inzichten worden gegenereerd...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive mb-2">
        <CardContent className="flex items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-medium">Analyse mislukt</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onAnalyze}>
            Opnieuw proberen
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!insights) {
    return (
      <Card className="mb-2 border-dashed">
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-psv-gold shrink-0" />
            <div>
              <p className="text-sm font-medium">AI Inzichten</p>
              <p className="text-xs text-muted-foreground">
                Laat het model patronen, anomalieën en aanbevelingen analyseren voor de {presetLabels[preset] ?? preset}.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onAnalyze}
            disabled={!mailings.length || !totals}
            className="shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Analyseren
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-2 border-t-2 border-t-psv-gold">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-psv-gold" />
            AI Inzichten
            <span className="text-xs font-normal text-muted-foreground ml-1">
              {presetLabels[preset] ?? preset}
            </span>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onAnalyze} className="text-xs text-muted-foreground h-7">
            Vernieuwen
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Summary */}
        <p className="text-sm leading-relaxed">{String(insights.summary ?? "")}</p>

        {/* Highlights */}
        {insights.highlights?.length > 0 && (
          <div className="space-y-2">
            {insights.highlights.map((h, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                {highlightIcon(h.type)}
                <span>{String(h.text ?? "")}</span>
              </div>
            ))}
          </div>
        )}

        {/* Top / Bottom performer */}
        {(insights.topPerformer || insights.bottomPerformer) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {insights.topPerformer && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 space-y-1">
                <p className="text-xs font-heading uppercase tracking-wide text-emerald-600">
                  Beste mailing
                </p>
                <p className="text-sm font-medium truncate">{String(insights.topPerformer.name ?? "")}</p>
                <p className="text-xs text-muted-foreground">{String(insights.topPerformer.metric ?? "")}</p>
                <p className="text-xs text-muted-foreground">{String(insights.topPerformer.why ?? "")}</p>
              </div>
            )}
            {insights.bottomPerformer && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-1">
                <p className="text-xs font-heading uppercase tracking-wide text-amber-600">
                  Verbeterpunt
                </p>
                <p className="text-sm font-medium truncate">{String(insights.bottomPerformer.name ?? "")}</p>
                <p className="text-xs text-muted-foreground">{String(insights.bottomPerformer.metric ?? "")}</p>
                <p className="text-xs text-muted-foreground">{String(insights.bottomPerformer.suggestion ?? "")}</p>
              </div>
            )}
          </div>
        )}

        {/* Recommendations */}
        {insights.recommendations?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground">
              Aanbevelingen
            </p>
            <ul className="space-y-2">
              {insights.recommendations.map((r, i) => (
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
      </CardContent>
    </Card>
  );
}

/* ---------- Main Dashboard ---------- */

const PRESET_OPTIONS = [
  { value: "7d", label: "Laatste 7 dagen" },
  { value: "30d", label: "Laatste 30 dagen" },
  { value: "90d", label: "Laatste 90 dagen" },
  { value: "6m", label: "Laatste 6 maanden" },
  { value: "1y", label: "Laatste jaar" },
];

export function DmPerformanceDashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState("30d");
  const [selectedMailing, setSelectedMailing] = useState<MailingSummary | null>(null);
  const [lastFetched, setLastFetched] = useState<string | null>(null);

  const [insights, setInsights] = useState<DmInsightsResponse | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const insightsCache = useRef<Map<string, DmInsightsResponse>>(new Map());

  const fetchData = useCallback(async (datePreset: string) => {
    setLoading(true);
    setError(null);
    // Clear cached insights for this preset so a refresh also refreshes AI
    insightsCache.current.delete(datePreset);
    try {
      const { from, to } = getDateRange(datePreset);
      const res = await fetch(`/api/maileon?from=${from}&to=${to}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `API gaf status ${res.status}`);
      }
      const json: ApiResponse = await res.json();
      setData(json);
      setLastFetched(json.fetchedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ophalen mislukt");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInsights = useCallback(async () => {
    if (!data?.mailings.length || !data.totals) return;
    const cached = insightsCache.current.get(preset);
    if (cached) {
      setInsights(cached);
      setInsightsError(null);
      return;
    }
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const { from, to } = getDateRange(preset);
      const res = await fetch("/api/dm-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailings: data.mailings, totals: data.totals, dateRange: { preset, from, to } }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `API gaf status ${res.status}`);
      }
      const result: DmInsightsResponse = await res.json();
      setInsights(result);
      insightsCache.current.set(preset, result);
    } catch (err) {
      setInsightsError(err instanceof Error ? err.message : "Analyse mislukt");
    } finally {
      setInsightsLoading(false);
    }
  }, [data, preset]);

  useEffect(() => {
    fetchData(preset);
  }, [preset, fetchData]);

  // Reset insights panel when switching presets
  useEffect(() => {
    setInsights(null);
    setInsightsError(null);
  }, [preset]);

  const totals = data?.totals;
  const mailings = data?.mailings ?? [];

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Select value={preset} onValueChange={setPreset}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESET_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={() => fetchData(preset)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Vernieuwen
          </button>
        </div>
        {lastFetched && (
          <span className="text-xs text-muted-foreground">
            Laatst opgehaald:{" "}
            {new Date(lastFetched).toLocaleTimeString("nl-NL", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>

      {/* Error state */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium">Fout bij ophalen data</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {loading && !data && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-psv-red-primary" />
          <span className="ml-3 text-muted-foreground">
            Maileon data ophalen...
          </span>
        </div>
      )}

      {/* AI Insights Panel */}
      {!loading && !error && mailings.length > 0 && (
        <DmInsightsPanel
          mailings={mailings}
          totals={totals}
          preset={preset}
          onAnalyze={fetchInsights}
          insights={insights}
          loading={insightsLoading}
          error={insightsError}
        />
      )}

      {/* KPI Cards */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <KpiCard
            title="Mailings"
            value={formatNumber(totals.mailings)}
            icon={Mail}
          />
          <KpiCard
            title="Ontvangers"
            value={formatNumber(totals.recipients)}
            icon={Users}
          />
          <KpiCard
            title="Gem. Open Rate"
            value={formatPct(totals.avgOpenRate)}
            subtitle={`${formatNumber(totals.uniqueOpens)} unieke opens`}
            icon={Eye}
          />
          <KpiCard
            title="Gem. Click Rate"
            value={formatPct(totals.avgClickRate)}
            subtitle={`${formatNumber(totals.uniqueClicks)} unieke clicks`}
            icon={MousePointerClick}
          />
          <KpiCard
            title="Gem. CTOR"
            value={formatPct(totals.avgCtor)}
            subtitle="Click-to-open rate"
            icon={TrendingUp}
          />
          <KpiCard
            title="Bounces"
            value={formatNumber(totals.bounces)}
            subtitle={`${formatPct(totals.avgBounceRate)} bounce rate`}
            icon={AlertTriangle}
            color="text-psv-gold"
          />
          <KpiCard
            title="Uitschrijvingen"
            value={formatNumber(totals.unsubscriptions)}
            subtitle={`${formatPct(totals.avgUnsubRate)} unsub rate`}
            icon={UserMinus}
            color="text-psv-gold"
          />
        </div>
      )}

      {/* Chart */}
      {mailings.length > 0 && <PerformanceChart mailings={mailings} />}

      {/* Selected mailing detail */}
      {selectedMailing && (
        <MailingDetailPanel
          mailing={selectedMailing}
          onClose={() => setSelectedMailing(null)}
        />
      )}

      {/* Mailing table */}
      {mailings.length > 0 && (
        <MailingTable mailings={mailings} onSelect={setSelectedMailing} />
      )}

      {/* Empty state */}
      {!loading && !error && mailings.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Mail className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-heading uppercase">
              Geen mailings gevonden
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Pas de periode aan om mailings te zien.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
