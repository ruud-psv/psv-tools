"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { RefreshCw } from "lucide-react";

/* ---------- Types ---------- */

interface MailingSummary {
  id: number;
  name: string;
  subject: string;
  scheduleTime: string;
  recipients: number;
  uniqueOpens: number;
  openRate: number;
  uniqueClicks: number;
  clickRate: number;
  bounceRate: number;
  unsubscribeRate: number;
  clickToOpenRate: number;
  opens: number;
  clicks: number;
  bounces: number;
  unsubscriptions: number;
  type: string;
  state: string;
}

interface Totals {
  mailings: number;
  recipients: number;
  uniqueOpens: number;
  avgOpenRate: number;
  uniqueClicks: number;
  avgClickRate: number;
  avgCtor: number;
  bounces: number;
  avgBounceRate: number;
  unsubscriptions: number;
  avgUnsubRate: number;
}

/* ---------- Helpers ---------- */

function formatNumber(n: number) {
  return n.toLocaleString("nl-NL");
}

function formatPct(n: number) {
  return `${n.toFixed(1)}%`;
}

function formatDate(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return iso; }
}

function formatDateShort(iso: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("nl-NL", { day: "2-digit", month: "short" });
  } catch { return iso; }
}

function getDateRange(preset: string, customFrom?: string, customTo?: string) {
  if (preset === "custom" && customFrom && customTo) return { from: customFrom, to: customTo };
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  switch (preset) {
    case "7d":  { const d = new Date(now); d.setDate(d.getDate() - 7);   return { from: d.toISOString().slice(0, 10), to }; }
    case "30d": { const d = new Date(now); d.setDate(d.getDate() - 30);  return { from: d.toISOString().slice(0, 10), to }; }
    case "90d": { const d = new Date(now); d.setDate(d.getDate() - 90);  return { from: d.toISOString().slice(0, 10), to }; }
    case "6m":  { const d = new Date(now); d.setMonth(d.getMonth() - 6); return { from: d.toISOString().slice(0, 10), to }; }
    case "1y":  { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return { from: d.toISOString().slice(0, 10), to }; }
    case "seizoen2425": return { from: "2024-07-01", to: "2025-06-30" };
    case "seizoen2526": {
      const end = new Date(Math.min(new Date("2026-06-30").getTime(), now.getTime()));
      return { from: "2025-07-01", to: end.toISOString().slice(0, 10) };
    }
    default: { const d = new Date(now); d.setDate(d.getDate() - 30); return { from: d.toISOString().slice(0, 10), to }; }
  }
}

const PRESET_LABELS: Record<string, string> = {
  "7d": "Afgelopen week", "30d": "Afgelopen maand", "90d": "Afgelopen kwartaal",
  "6m": "Afgelopen halfjaar", "1y": "Afgelopen jaar",
  "seizoen2425": "Seizoen 24/25", "seizoen2526": "Seizoen 25/26",
};

function computeTotals(mailings: MailingSummary[]): Totals {
  if (!mailings.length) return { mailings: 0, recipients: 0, uniqueOpens: 0, avgOpenRate: 0, uniqueClicks: 0, avgClickRate: 0, avgCtor: 0, bounces: 0, avgBounceRate: 0, unsubscriptions: 0, avgUnsubRate: 0 };
  const sum = (k: keyof MailingSummary) => mailings.reduce((a, m) => a + ((m[k] as number) || 0), 0);
  const avg = (k: keyof MailingSummary) => sum(k) / mailings.length;
  return {
    mailings: mailings.length,
    recipients: sum("recipients"),
    uniqueOpens: sum("uniqueOpens"),
    avgOpenRate: avg("openRate"),
    uniqueClicks: sum("uniqueClicks"),
    avgClickRate: avg("clickRate"),
    avgCtor: avg("clickToOpenRate"),
    bounces: sum("bounces"),
    avgBounceRate: avg("bounceRate"),
    unsubscriptions: sum("unsubscriptions"),
    avgUnsubRate: avg("unsubscribeRate"),
  };
}

/* ---------- KPI Card ---------- */

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-heading uppercase text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

/* ---------- Chart ---------- */

function PerformanceChart({ mailings }: { mailings: MailingSummary[] }) {
  const chartData = useMemo(() => {
    const sorted = [...mailings].filter((m) => m.scheduleTime)
      .sort((a, b) => new Date(a.scheduleTime).getTime() - new Date(b.scheduleTime).getTime());

    const dateCounts = new Map<string, number>();
    sorted.forEach((m) => {
      const d = formatDateShort(m.scheduleTime);
      dateCounts.set(d, (dateCounts.get(d) ?? 0) + 1);
    });
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
      return { label, openRate: +m.openRate.toFixed(1), clickRate: +m.clickRate.toFixed(1), date };
    });
  }, [mailings]);

  if (!chartData.length) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-sm font-heading uppercase tracking-wide text-muted-foreground mb-4">Open &amp; Click Rate per Mailing</p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} unit="%" domain={[0, "auto"]} />
          <Tooltip
            contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px" }}
            formatter={(v) => [`${Number(v).toFixed(1)}%`]}
          />
          <Legend wrapperStyle={{ fontSize: "12px" }} />
          <Bar dataKey="openRate" name="Open Rate" fill="#e82026" radius={[3, 3, 0, 0]} maxBarSize={32} />
          <Bar dataKey="clickRate" name="Click Rate" fill="#bb9753" radius={[3, 3, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Main ---------- */

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minuten

function ShareDmContent() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const preset = params.get("preset") ?? "30d";
  const customFrom = params.get("from") ?? "";
  const customTo = params.get("to") ?? "";

  const { from, to } = getDateRange(preset, customFrom || undefined, customTo || undefined);

  const [mailings, setMailings] = useState<MailingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/maileon?from=${from}&to=${to}`);
      if (!res.ok) throw new Error(`API fout ${res.status}`);
      const json = await res.json();
      setMailings(json.mailings ?? []);
      setLastFetched(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ophalen mislukt");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  const filtered = useMemo(() => {
    if (!q.trim()) return mailings;
    const lower = q.toLowerCase();
    return mailings.filter(
      (m) => (m.name ?? "").toLowerCase().includes(lower) || (m.subject ?? "").toLowerCase().includes(lower)
    );
  }, [mailings, q]);

  const totals = useMemo(() => computeTotals(filtered), [filtered]);

  const dateLabel = preset === "custom"
    ? `${formatDate(from)} – ${formatDate(to)}`
    : (PRESET_LABELS[preset] ?? preset);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <img src="https://www.psv.nl/upload/23adcb48-abc3-487f-9158-6bc7822599a6_PSV_logo_color.svg" alt="PSV" className="h-8 w-8" />
            <h1 className="text-2xl font-heading uppercase">DM Performance</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="bg-muted px-2 py-0.5 rounded text-xs font-heading uppercase">{dateLabel}</span>
            {q && (
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-heading uppercase">
                Filter: {q}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {lastFetched
            ? `Ververst om ${lastFetched.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`
            : "Laden…"}
        </div>
      </div>

      {error && (
        <div className="border border-destructive rounded-lg px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {/* KPI's */}
      {!error && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <KpiCard label="Mailings" value={formatNumber(totals.mailings)} />
          <KpiCard label="Ontvangers" value={formatNumber(totals.recipients)} />
          <KpiCard label="Gem. Open Rate" value={formatPct(totals.avgOpenRate)} sub={`${formatNumber(totals.uniqueOpens)} unieke opens`} />
          <KpiCard label="Gem. Click Rate" value={formatPct(totals.avgClickRate)} sub={`${formatNumber(totals.uniqueClicks)} unieke clicks`} />
          <KpiCard label="Click-to-Open" value={formatPct(totals.avgCtor)} />
          <KpiCard label="Bounces" value={formatNumber(totals.bounces)} sub={formatPct(totals.avgBounceRate)} />
          <KpiCard label="Uitschrijvingen" value={formatNumber(totals.unsubscriptions)} sub={formatPct(totals.avgUnsubRate)} />
        </div>
      )}

      {/* Grafiek */}
      {!error && filtered.length > 0 && <PerformanceChart mailings={filtered} />}

      {/* Lege state */}
      {!loading && !error && filtered.length === 0 && (
        <p className="text-center py-12 text-muted-foreground text-sm">Geen mailings gevonden voor dit filter.</p>
      )}

      {/* Footer */}
      <p className="text-center text-xs text-muted-foreground pt-4 border-t border-border">
        Automatisch ververst elke 5 minuten · PSV Eindhoven
      </p>
    </div>
  );
}

export default function ShareDmPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-muted-foreground text-sm">Laden…</div>}>
      <ShareDmContent />
    </Suspense>
  );
}
