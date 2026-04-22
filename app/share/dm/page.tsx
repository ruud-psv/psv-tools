"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { RefreshCw, X } from "lucide-react";

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

/** Strip DMID-suffix én datumpatronen (dd-mm-jjjj, jjjj.mm.dd, 15 april 2026, etc.) */
function stripName(name: string): string {
  const MONTHS = "januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|jan|feb|mrt|apr|jun|jul|aug|sep|okt|nov|dec";
  return name
    .replace(/\s*DMID.*/i, "")
    .replace(/\s*\b\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\b/g, "")
    .replace(/\s*\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, "")
    .replace(new RegExp(`\\s*\\b\\d{1,2}\\s+(${MONTHS})\\.?\\s*\\d{0,4}\\b`, "gi"), "")
    .replace(new RegExp(`\\s*\\b(${MONTHS})\\.?\\s+\\d{4}\\b`, "gi"), "")
    .replace(/\s+/g, " ")
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
    <div className="bg-card border border-border rounded-lg p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-heading text-base uppercase">{stripName(mailing.name)}</p>
          {mailing.subject && (
            <p className="text-sm text-muted-foreground mt-0.5 truncate">Onderwerp: {mailing.subject}</p>
          )}
          {mailing.scheduleTime && (
            <p className="text-xs text-muted-foreground mt-1">Verzonden: {formatDate(mailing.scheduleTime)}</p>
          )}
        </div>
        <button onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-border">
        <Stat label="Ontvangers" value={formatNumber(mailing.recipients)} />
        <Stat label="Unieke opens" value={formatNumber(mailing.uniqueOpens)} sub={formatPct(mailing.openRate)} />
        <Stat label="Unieke clicks" value={formatNumber(mailing.uniqueClicks)} sub={formatPct(mailing.clickRate)} />
        <Stat label="Click-to-open" value={formatPct(mailing.clickToOpenRate)} />
        <Stat label="Totaal opens" value={formatNumber(mailing.opens)} />
        <Stat label="Totaal clicks" value={formatNumber(mailing.clicks)} />
        <Stat label="Bounces" value={formatNumber(mailing.bounces)} sub={formatPct(mailing.bounceRate)} />
        <Stat label="Uitschrijvingen" value={formatNumber(mailing.unsubscriptions)} sub={formatPct(mailing.unsubscribeRate)} />
      </div>
    </div>
  );
}

/* ---------- Mailings tabel ---------- */

function MailingsTable({ mailings, onSelect, selected }: { mailings: MailingSummary[]; onSelect: (m: MailingSummary) => void; selected: MailingSummary | null }) {
  const sorted = useMemo(
    () => [...mailings].sort((a, b) => new Date(b.scheduleTime).getTime() - new Date(a.scheduleTime).getTime()),
    [mailings]
  );

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-sm font-heading uppercase tracking-wide text-muted-foreground">Mailings</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-4 py-2.5 text-xs font-heading uppercase tracking-wide text-muted-foreground">Naam</th>
              <th className="text-right px-4 py-2.5 text-xs font-heading uppercase tracking-wide text-muted-foreground">Datum</th>
              <th className="text-right px-4 py-2.5 text-xs font-heading uppercase tracking-wide text-muted-foreground">Ontvangers</th>
              <th className="text-right px-4 py-2.5 text-xs font-heading uppercase tracking-wide text-muted-foreground">Open %</th>
              <th className="text-right px-4 py-2.5 text-xs font-heading uppercase tracking-wide text-muted-foreground">Click %</th>
              <th className="text-right px-4 py-2.5 text-xs font-heading uppercase tracking-wide text-muted-foreground">Bounce %</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => (
              <tr
                key={m.id}
                onClick={() => onSelect(m.id === selected?.id ? null as unknown as MailingSummary : m)}
                className={`border-b border-border last:border-0 cursor-pointer transition-colors ${m.id === selected?.id ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/20"}`}
              >
                <td className="px-4 py-2.5 max-w-xs">
                  <div className="font-medium truncate">{stripName(m.name)}</div>
                  {m.subject && <div className="text-xs text-muted-foreground truncate">{m.subject}</div>}
                </td>
                <td className="px-4 py-2.5 text-right text-muted-foreground whitespace-nowrap">{formatDate(m.scheduleTime)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(m.recipients)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatPct(m.openRate)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatPct(m.clickRate)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatPct(m.bounceRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Main ---------- */

const REFRESH_INTERVAL = 5 * 60 * 1000;

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
  const [selected, setSelected] = useState<MailingSummary | null>(null);

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
            <h1 className="text-2xl font-heading uppercase">Mailing rapportage</h1>
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

      {/* Detail panel */}
      {selected && <MailingDetail mailing={selected} onClose={() => setSelected(null)} />}

      {/* Tabel */}
      {!error && filtered.length > 0 && <MailingsTable mailings={filtered} onSelect={setSelected} selected={selected} />}

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
