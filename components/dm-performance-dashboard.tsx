"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  // Show last 20 mailings in chronological order for the chart
  const chartData = useMemo(() => {
    const sorted = [...mailings]
      .filter((m) => m.scheduleTime)
      .sort(
        (a, b) =>
          new Date(a.scheduleTime).getTime() -
          new Date(b.scheduleTime).getTime()
      )
      .slice(-20);

    return sorted.map((m) => ({
      name:
        m.name.length > 25 ? m.name.slice(0, 25) + "..." : m.name,
      date: formatDateShort(m.scheduleTime),
      openRate: parseFloat(m.openRate.toFixed(1)),
      clickRate: parseFloat(m.clickRate.toFixed(1)),
    }));
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
                dataKey="date"
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
                labelFormatter={(label: unknown) => String(label)}
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

  const fetchData = useCallback(async (datePreset: string) => {
    setLoading(true);
    setError(null);
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

  useEffect(() => {
    fetchData(preset);
  }, [preset, fetchData]);

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

      {/* KPI Cards */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
