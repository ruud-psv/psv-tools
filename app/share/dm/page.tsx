"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { RefreshCw, Mail, Users, Eye, MousePointerClick, TrendingUp, AlertTriangle, UserMinus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

interface FilterParams {
  q: string;
  preset: string;
  customFrom: string;
  customTo: string;
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

/** Strip DMID-suffix, datumpatronen én achtergebleven " - " separatoren */
function stripName(name: string): string {
  const MONTHS = "januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|jan|feb|mrt|apr|jun|jul|aug|sep|okt|nov|dec";
  return name
    .replace(/\s*DMID.*/i, "")
    .replace(/\s*\b\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\b/g, "")
    .replace(/\s*\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, "")
    .replace(new RegExp(`\\s*\\b\\d{1,2}\\s+(${MONTHS})\\.?\\s*\\d{0,4}\\b`, "gi"), "")
    .replace(new RegExp(`\\s*\\b(${MONTHS})\\.?\\s+\\d{4}\\b`, "gi"), "")
    .replace(/\s+/g, " ")
    .replace(/(\s*-)+\s*$/, "")
    .replace(/^\s*(-\s*)+/, "")
    .trim() || name;
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

function KpiCard({ label, value, sub, icon: Icon, color = "text-psv-red-primary" }: {
  label: string; value: string; sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-heading uppercase tracking-wide">{label}</CardTitle>
        <Icon className={`h-5 w-5 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-heading uppercase">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

/* ---------- RateBadge ---------- */

function RateBadge({ rate, thresholds, inverted = false }: {
  rate: number; thresholds: [number, number]; inverted?: boolean;
}) {
  let variant: "destructive" | "warning" | "success" = "success";
  if (inverted) {
    if (rate >= thresholds[0]) variant = "destructive";
    else if (rate >= thresholds[1]) variant = "warning";
  } else {
    if (rate < thresholds[0]) variant = "destructive";
    else if (rate < thresholds[1]) variant = "warning";
  }
  return <Badge variant={variant} className="text-xs tabular-nums">{formatPct(rate)}</Badge>;
}

/* ---------- Mailing detail panel ---------- */

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground font-heading uppercase tracking-wide">{label}</p>
      <p className="text-lg font-heading uppercase">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function MailingDetail({ mailing, onClose }: { mailing: MailingSummary; onClose: () => void }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="min-w-0 flex-1">
          <CardTitle className="text-lg">{stripName(mailing.name)}</CardTitle>
          {mailing.subject && (
            <p className="text-sm text-muted-foreground mt-1 truncate">Onderwerp: {mailing.subject}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            {mailing.type && <Badge variant="secondary">{mailing.type}</Badge>}
            {mailing.state && (
              <Badge variant={mailing.state === "done" ? "success" : "info"}>{mailing.state}</Badge>
            )}
            {mailing.scheduleTime && (
              <span className="text-xs text-muted-foreground">Verzonden: {formatDate(mailing.scheduleTime)}</span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm font-heading uppercase tracking-wide">
          Sluiten
        </button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Ontvangers" value={formatNumber(mailing.recipients)} />
          <Stat label="Unieke opens" value={formatNumber(mailing.uniqueOpens)} sub={formatPct(mailing.openRate)} />
          <Stat label="Unieke clicks" value={formatNumber(mailing.uniqueClicks)} sub={formatPct(mailing.clickRate)} />
          <Stat label="Click-to-open" value={formatPct(mailing.clickToOpenRate)} />
          <Stat label="Totaal opens" value={formatNumber(mailing.opens)} />
          <Stat label="Totaal clicks" value={formatNumber(mailing.clicks)} />
          <Stat label="Bounces" value={formatNumber(mailing.bounces)} sub={formatPct(mailing.bounceRate)} />
          <Stat label="Uitschrijvingen" value={formatNumber(mailing.unsubscriptions)} sub={formatPct(mailing.unsubscribeRate)} />
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Mailings tabel ---------- */

function MailingsTable({ mailings, onSelect, selected }: {
  mailings: MailingSummary[];
  onSelect: (m: MailingSummary | null) => void;
  selected: MailingSummary | null;
}) {
  const sorted = useMemo(
    () => [...mailings].sort((a, b) => new Date(b.scheduleTime).getTime() - new Date(a.scheduleTime).getTime()),
    [mailings]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mailings</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-heading uppercase tracking-wide text-xs">Naam</th>
                <th className="text-left px-4 py-3 font-heading uppercase tracking-wide text-xs">Datum</th>
                <th className="text-right px-4 py-3 font-heading uppercase tracking-wide text-xs">Ontvangers</th>
                <th className="text-right px-4 py-3 font-heading uppercase tracking-wide text-xs">Opens</th>
                <th className="text-right px-4 py-3 font-heading uppercase tracking-wide text-xs">Open %</th>
                <th className="text-right px-4 py-3 font-heading uppercase tracking-wide text-xs">Clicks</th>
                <th className="text-right px-4 py-3 font-heading uppercase tracking-wide text-xs">Click %</th>
                <th className="text-right px-4 py-3 font-heading uppercase tracking-wide text-xs">Bounce %</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => onSelect(m.id === selected?.id ? null : m)}
                  className={`border-b hover:bg-muted/30 cursor-pointer transition-colors ${m.id === selected?.id ? "bg-primary/5" : ""}`}
                >
                  <td className="px-4 py-3 max-w-xs">
                    <div className="font-medium truncate">{stripName(m.name)}</div>
                    {m.subject && <div className="text-xs text-muted-foreground truncate">{m.subject}</div>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDate(m.scheduleTime)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(m.recipients)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(m.uniqueOpens)}</td>
                  <td className="px-4 py-3 text-right tabular-nums"><RateBadge rate={m.openRate} thresholds={[15, 25]} /></td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(m.uniqueClicks)}</td>
                  <td className="px-4 py-3 text-right tabular-nums"><RateBadge rate={m.clickRate} thresholds={[2, 5]} /></td>
                  <td className="px-4 py-3 text-right tabular-nums"><RateBadge rate={m.bounceRate} thresholds={[5, 2]} inverted /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Main ---------- */

const REFRESH_INTERVAL = 5 * 60 * 1000;

function ShareDmContent() {
  const urlParams = useSearchParams();
  const token = urlParams.get("token") ?? "";

  const [filter, setFilter] = useState<FilterParams | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [mailings, setMailings] = useState<MailingSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [selected, setSelected] = useState<MailingSummary | null>(null);

  useEffect(() => {
    if (!token) {
      setTokenError("Ongeldige link");
      setTokenLoading(false);
      return;
    }
    fetch(`/api/share?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`Fout ${r.status}`)))
      .then((data: FilterParams) => { setFilter(data); setTokenLoading(false); })
      .catch((err) => { setTokenError(String(err)); setTokenLoading(false); });
  }, [token]);

  const { from, to } = useMemo(
    () => filter ? getDateRange(filter.preset, filter.customFrom || undefined, filter.customTo || undefined) : { from: "", to: "" },
    [filter]
  );

  const fetchData = useCallback(async () => {
    if (!filter) return;
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
  }, [filter, from, to]);

  useEffect(() => {
    if (!filter) return;
    fetchData();
    const id = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData, filter]);

  const filtered = useMemo(() => {
    const q = filter?.q ?? "";
    if (!q.trim()) return mailings;
    const lower = q.toLowerCase();
    return mailings.filter(
      (m) => (m.name ?? "").toLowerCase().includes(lower) || (m.subject ?? "").toLowerCase().includes(lower)
    );
  }, [mailings, filter]);

  const totals = useMemo(() => computeTotals(filtered), [filtered]);

  if (tokenLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-muted-foreground text-sm">
        Laden…
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="flex items-center justify-center min-h-screen text-muted-foreground text-sm">
        Ongeldige of verlopen link.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Full-width header bar */}
      <header className="bg-sidebar border-b border-sidebar-border w-full">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img
              src="https://www.psv.nl/upload/23adcb48-abc3-487f-9158-6bc7822599a6_PSV_logo_color.svg"
              alt="PSV"
              className="h-9 w-9 shrink-0"
            />
            <h1 className="text-xl font-heading uppercase text-sidebar-foreground leading-tight">
              Mailing rapportage
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-sidebar-foreground/60 shrink-0">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {lastFetched
              ? `Ververst om ${lastFetched.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`
              : "Laden…"}
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="border border-destructive rounded-lg px-4 py-3 text-sm text-destructive">{error}</div>
        )}

        {/* KPI's */}
        {!error && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Mailings" value={formatNumber(totals.mailings)} icon={Mail} />
            <KpiCard label="Ontvangers" value={formatNumber(totals.recipients)} icon={Users} />
            <KpiCard label="Totaal clicks" value={formatNumber(totals.uniqueClicks)} sub={`${formatPct(totals.avgClickRate)} click rate`} icon={MousePointerClick} />
            <KpiCard label="Gem. Open Rate" value={formatPct(totals.avgOpenRate)} sub={`${formatNumber(totals.uniqueOpens)} unieke opens`} icon={Eye} />
            <KpiCard label="Gem. Click Rate" value={formatPct(totals.avgClickRate)} sub={`${formatNumber(totals.uniqueClicks)} unieke clicks`} icon={MousePointerClick} color="text-psv-gold" />
            <KpiCard label="Click-to-Open" value={formatPct(totals.avgCtor)} icon={TrendingUp} color="text-blue-500" />
            <KpiCard label="Bounces" value={formatNumber(totals.bounces)} sub={formatPct(totals.avgBounceRate)} icon={AlertTriangle} color="text-warning" />
            <KpiCard label="Uitschrijvingen" value={formatNumber(totals.unsubscriptions)} sub={formatPct(totals.avgUnsubRate)} icon={UserMinus} color="text-psv-gold" />
          </div>
        )}

        {/* Detail panel */}
        {selected && <MailingDetail mailing={selected} onClose={() => setSelected(null)} />}

        {/* Tabel */}
        {!error && filtered.length > 0 && (
          <MailingsTable mailings={filtered} onSelect={setSelected} selected={selected} />
        )}

        {/* Lege state */}
        {!loading && !error && filtered.length === 0 && (
          <p className="text-center py-12 text-muted-foreground text-sm">Geen mailings gevonden voor dit filter.</p>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pt-4 border-t border-border">
          Automatisch ververst elke 5 minuten · PSV Eindhoven
        </p>
      </div>
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
