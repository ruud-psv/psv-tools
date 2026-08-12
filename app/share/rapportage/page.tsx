"use client";

import { useEffect, useState, useMemo, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  RefreshCw, Mail, Users, Eye, MousePointerClick, TrendingUp, AlertTriangle, UserMinus,
  Ticket, Globe, ShoppingBag, Euro, Package, Sparkles, CheckCircle2, Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  computeTotals as computeDmTotals,
  formatDate, formatNumber, formatPct, formatEuro, getDateRange, stripName,
  KpiCard, RateBadge,
  type MailingSummary, type Totals as DmTotals,
} from "@/lib/dm-share";
import type {
  CombinedInsightResult, CombinedDm, CombinedTicket, CombinedWeb, CombinedFanstore,
} from "@/lib/insights/combined";
import type { PeriodConfig, ReportRecord } from "@/lib/reports";
import { PAGE_SELECT_LIMIT } from "@/components/report-wizard/constants";

/** Rapporteert de samengevatte data van een sectie omhoog voor de gecombineerde analyse. */
type ReportData = (payload: object | null, sig: string) => void;

const REFRESH_INTERVAL = 5 * 60 * 1000;

const PSV_LOGO = "https://www.psv.nl/upload/23adcb48-abc3-487f-9158-6bc7822599a6_PSV_logo_color.svg";
const CHART_COLORS = ["#e82026", "#bb9753", "#09101d", "#c00d0d", "#2e5aac", "#287d3c"];

/* ---------- Types ---------- */

interface CampaignParams {
  kind: "campaign";
  name: string;
  intro?: string;
  // Legacy globale periode (oude ?token=-links); nieuwe rapporten hebben periode per bron.
  from?: string;
  to?: string;
  sources: {
    dm?: { enabled: true; query?: string; queries?: string[]; period?: PeriodConfig };
    ticketing?: { enabled: true; query?: string; queries?: string[]; category?: string; mode?: "current" | "period"; period?: PeriodConfig };
    web?: { enabled: true; site: string; path?: string; paths?: string[]; period?: PeriodConfig };
    fanstore?: { enabled: true; products?: string[]; period?: PeriodConfig };
  };
}

/** Los een bron-periode op naar een concreet {from,to}. Relatieve presets worden
 *  op weergavemoment berekend (meebewegend); valt terug op de legacy globale
 *  periode of, als laatste redmiddel, 30 dagen. */
function resolvePeriod(
  period: PeriodConfig | undefined,
  legacyFrom?: string,
  legacyTo?: string
): { from: string; to: string } {
  if (period) {
    if (period.preset === "custom" && period.from && period.to) {
      return { from: period.from, to: period.to };
    }
    if (period.preset !== "custom") return getDateRange(period.preset);
  }
  if (legacyFrom && legacyTo) return { from: legacyFrom, to: legacyTo };
  return getDateRange("30d");
}

/** Base64url token voor de data/insights endpoints (client-side variant van Buffer#base64url). */
function makeShareToken(payload: object): string {
  return btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Normalize legacy `path` (single string) and new `paths` (array) into one list. */
function collectPaths(src: { path?: string; paths?: string[] } | undefined): string[] {
  if (!src) return [];
  const out: string[] = [];
  if (Array.isArray(src.paths)) {
    for (const p of src.paths) {
      const t = p?.trim?.();
      if (t) out.push(t);
    }
  }
  if (typeof src.path === "string" && src.path.trim()) out.push(src.path.trim());
  return [...new Set(out)];
}

/** Normalize legacy `query` (single string) and new `queries` (array) into one list. */
function collectQueries(src: { query?: string; queries?: string[] } | undefined): string[] {
  if (!src) return [];
  const out: string[] = [];
  if (Array.isArray(src.queries)) {
    for (const q of src.queries) {
      const t = q?.trim?.();
      if (t) out.push(t);
    }
  }
  if (typeof src.query === "string" && src.query.trim()) out.push(src.query.trim());
  return out;
}

interface TicketEvent {
  eventId: string;
  eventName: string;
  eventDate: string;
  category: string;
  subCategory: string;
  soldTickets: number;
  availableCapacity: number;
  totalCapacity: number;
  saleStatus: string;
}

interface AnalyticsSiteData {
  label: string;
  totals: {
    sessions: number; users: number; pageviews: number;
    newUsers: number; bounceRate: number; engagementRate: number;
  };
  dailyTrend: { date: string; sessions: number; users: number; pageviews: number }[];
  topSources: { source: string; sessions: number; users?: number }[];
  topPages: { path: string; pageviews: number }[];
  devices: { device: string; sessions: number; percentage: number }[];
}

interface AnalyticsResponse {
  sites: Record<string, AnalyticsSiteData>;
  combined: {
    totals: { sessions: number; users: number; pageviews: number };
    dailyTrend: { date: string; sessions: number; users: number; pageviews: number }[];
  };
}

/* ---------- Helpers ---------- */

function eventDateLabel(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

function pctClass(pct: number, inverted = false) {
  if (inverted) {
    if (pct >= 70) return "text-destructive";
    if (pct >= 55) return "text-warning";
    return "text-green-600";
  }
  if (pct >= 85) return "text-destructive";
  if (pct >= 70) return "text-warning";
  return "text-green-600";
}

function MetricGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{children}</div>;
}

function SectionShell({ icon: Icon, title, subtitle, children }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <Icon className="h-5 w-5 text-psv-red-primary" />
        <div>
          <h2 className="text-lg font-heading uppercase tracking-wide">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/* ---------- DM Section ---------- */

function DmSection({
  from, to, queries, onData,
}: { from: string; to: string; queries: string[]; onData: ReportData }) {
  const [mailings, setMailings] = useState<MailingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (queries.length === 0) return mailings;
    const lowered = queries.map((q) => q.toLowerCase());
    return mailings.filter((m) => {
      const name = (m.name ?? "").toLowerCase();
      const subject = (m.subject ?? "").toLowerCase();
      const stripped = stripName(m.name ?? "").toLowerCase();
      return lowered.some((q) => name.includes(q) || subject.includes(q) || stripped.includes(q));
    });
  }, [mailings, queries]);

  const totals = useMemo(() => computeDmTotals(filtered), [filtered]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/maileon?from=${from}&to=${to}`);
      if (!res.ok) throw new Error(`API fout ${res.status}`);
      const json = await res.json();
      setMailings(json.mailings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ophalen mislukt");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Rapporteer een compacte samenvatting omhoog voor de gecombineerde analyse.
  useEffect(() => {
    if (loading) return;
    if (filtered.length === 0) { onData(null, "dm:0"); return; }
    const top = [...filtered]
      .sort((a, b) => b.openRate - a.openRate)
      .slice(0, 5)
      .map((m) => ({ name: stripName(m.name), openRate: m.openRate, clickRate: m.clickRate, recipients: m.recipients }));
    const payload: CombinedDm = {
      from, to,
      mailings: totals.mailings, recipients: totals.recipients,
      avgOpenRate: totals.avgOpenRate, avgClickRate: totals.avgClickRate, avgCtor: totals.avgCtor,
      bounces: totals.bounces, unsubscriptions: totals.unsubscriptions,
      top,
    };
    onData(payload, `dm:${totals.mailings}:${totals.recipients}`);
  }, [loading, filtered, totals, from, to, onData]);

  return (
    <SectionShell
      icon={Mail}
      title="DM Performance"
      subtitle={`${formatNumber(totals.mailings)} mailings · ${from} t/m ${to}${queries.length > 0 ? ` · ${queries.length === 1 ? `zoekterm "${queries[0]}"` : `${queries.length} zoektermen`}` : ""}`}
    >
      {error && (
        <div className="border border-destructive rounded-lg px-4 py-3 text-sm text-destructive">{error}</div>
      )}
      {!error && (
        <>
          <MetricGrid>
            <KpiCard label="Mailings" value={formatNumber(totals.mailings)} icon={Mail} />
            <KpiCard label="Ontvangers" value={formatNumber(totals.recipients)} icon={Users} />
            <KpiCard label="Gem. Open Rate" value={formatPct(totals.avgOpenRate)} sub={`${formatNumber(totals.uniqueOpens)} unieke opens`} icon={Eye} />
            <KpiCard label="Gem. Click Rate" value={formatPct(totals.avgClickRate)} sub={`${formatNumber(totals.uniqueClicks)} unieke clicks`} icon={MousePointerClick} color="text-psv-gold" />
            <KpiCard label="Click-to-Open" value={formatPct(totals.avgCtor)} icon={TrendingUp} color="text-blue-500" />
            <KpiCard label="Bounces" value={formatNumber(totals.bounces)} sub={formatPct(totals.avgBounceRate)} icon={AlertTriangle} color="text-warning" />
            <KpiCard label="Uitschrijvingen" value={formatNumber(totals.unsubscriptions)} sub={formatPct(totals.avgUnsubRate)} icon={UserMinus} color="text-psv-gold" />
          </MetricGrid>

          {filtered.length === 0 && !loading && (
            <p className="text-center py-8 text-muted-foreground text-sm">Geen mailings gevonden in deze periode.</p>
          )}

          {filtered.length > 0 && <DmTable mailings={filtered} totals={totals} />}
        </>
      )}
    </SectionShell>
  );
}

function DmTable({ mailings }: { mailings: MailingSummary[]; totals: DmTotals }) {
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
                <th className="text-right px-4 py-3 font-heading uppercase tracking-wide text-xs">Open %</th>
                <th className="text-right px-4 py-3 font-heading uppercase tracking-wide text-xs">Click %</th>
                <th className="text-right px-4 py-3 font-heading uppercase tracking-wide text-xs">Bounce %</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => (
                <tr key={m.id} className="border-b">
                  <td className="px-4 py-3 max-w-xs">
                    <div className="font-medium truncate">{stripName(m.name)}</div>
                    {m.subject && <div className="text-xs text-muted-foreground truncate">{m.subject}</div>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDate(m.scheduleTime)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(m.recipients)}</td>
                  <td className="px-4 py-3 text-right tabular-nums"><RateBadge rate={m.openRate} thresholds={[15, 25]} /></td>
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

/* ---------- Ticketing Section ---------- */

interface SnapshotPoint { ts: string; available: number; sold: number }

function TicketingSection({
  queries, category, mode, from, to, onData,
}: { queries: string[]; category?: string; mode: "current" | "period"; from: string; to: string; onData: ReportData }) {
  const isPeriod = mode === "period";
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, SnapshotPoint[]>>({});
  const [snapLoaded, setSnapLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = events.filter(
      (e) =>
        !e.eventName.toLowerCase().startsWith("package") &&
        !e.eventName.toLowerCase().startsWith("fietsenstalling") &&
        !e.eventName.toLowerCase().startsWith("psv direct")
    );
    if (category && category !== "all") {
      list = list.filter((e) => e.category === category);
    }
    if (queries.length > 0) {
      const lowered = queries.map((q) => q.toLowerCase());
      list = list.filter((e) => {
        const n = e.eventName.toLowerCase();
        return lowered.some((q) => n.includes(q));
      });
    }
    return list;
  }, [events, queries, category]);

  const totals = useMemo(() => {
    const sold = filtered.reduce((s, e) => s + e.soldTickets, 0);
    const available = filtered.reduce((s, e) => s + e.availableCapacity, 0);
    const capacity = filtered.reduce((s, e) => s + e.totalCapacity, 0);
    const soldOut = filtered.filter((e) => e.totalCapacity > 0 && e.availableCapacity === 0).length;
    const nearlyFull = filtered.filter(
      (e) => e.availableCapacity > 0 && e.totalCapacity > 0 && e.soldTickets / e.totalCapacity >= 0.85
    ).length;
    return {
      events: filtered.length,
      sold, available, capacity,
      occupancy: capacity > 0 ? Math.round((sold / capacity) * 100) : 0,
      soldOut, nearlyFull,
    };
  }, [filtered]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ticket-feed`);
      if (!res.ok) throw new Error(`API fout ${res.status}`);
      const json = await res.json();
      setEvents(json.events ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ophalen mislukt");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Snapshot-historie ophalen per event (alleen in periode-modus), gecapt op 40 events.
  const eventsKey = useMemo(() => filtered.map((e) => e.eventId).join(","), [filtered]);
  useEffect(() => {
    if (!isPeriod || filtered.length === 0) { setSnapshots({}); setSnapLoaded(true); return; }
    let active = true;
    const ctrl = new AbortController();
    setSnapLoaded(false);
    const targets = filtered.slice(0, 40);
    Promise.all(
      targets.map((e) =>
        fetch(`/api/ticket-history?eventId=${encodeURIComponent(e.eventId)}`, { signal: ctrl.signal })
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((j) => [e.eventId, (j.history ?? []) as SnapshotPoint[]] as const)
          .catch(() => [e.eventId, [] as SnapshotPoint[]] as const)
      )
    ).then((entries) => { if (active) { setSnapshots(Object.fromEntries(entries)); setSnapLoaded(true); } });
    return () => { active = false; ctrl.abort(); };
  }, [isPeriod, eventsKey, from, to]);

  // Verkocht-in-periode per event = sold(laatste) − sold(eerste) binnen [from,to].
  const soldByEvent = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const e of filtered) {
      const pts = (snapshots[e.eventId] ?? []).filter((p) => {
        const d = p.ts.slice(0, 10);
        return d >= from && d <= to;
      });
      map[e.eventId] = pts.length >= 2 ? Math.max(0, pts[pts.length - 1].sold - pts[0].sold)
        : pts.length === 1 ? 0 : null;
    }
    return map;
  }, [filtered, snapshots, from, to]);

  const periodSoldTotal = useMemo(
    () => Object.values(soldByEvent).reduce((s: number, v) => s + (v ?? 0), 0),
    [soldByEvent]
  );

  // Gecombineerde verkoop-over-tijd (som van sold per datum over de events).
  const salesTrend = useMemo(() => {
    if (!isPeriod) return [];
    const byDate = new Map<string, number>();
    for (const pts of Object.values(snapshots)) {
      for (const p of pts) {
        const d = p.ts.slice(0, 10);
        if (d < from || d > to) continue;
        byDate.set(d, (byDate.get(d) ?? 0) + p.sold);
      }
    }
    return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, sold]) => ({ date, sold }));
  }, [isPeriod, snapshots, from, to]);

  const sortedEvents = useMemo(() => {
    const withCap = filtered.filter((e) => e.totalCapacity > 0);
    if (isPeriod) {
      return [...withCap]
        .sort((a, b) => (soldByEvent[b.eventId] ?? -1) - (soldByEvent[a.eventId] ?? -1))
        .slice(0, 30);
    }
    return [...withCap]
      .sort((a, b) => (b.soldTickets / b.totalCapacity) - (a.soldTickets / a.totalCapacity))
      .slice(0, 30);
  }, [filtered, isPeriod, soldByEvent]);

  // Rapporteer samenvatting omhoog voor de gecombineerde analyse (periode: pas als snapshots binnen zijn).
  useEffect(() => {
    if (loading) return;
    if (isPeriod && !snapLoaded) return;
    if (filtered.length === 0) { onData(null, "tk:0"); return; }
    const top = sortedEvents.slice(0, 8).map((e) => ({
      name: e.eventName,
      category: e.category,
      occupancy: e.totalCapacity > 0 ? Math.round((e.soldTickets / e.totalCapacity) * 100) : 0,
      ...(isPeriod && { soldInPeriod: soldByEvent[e.eventId] ?? null }),
    }));
    const payload: CombinedTicket = {
      mode,
      ...(isPeriod && { from, to }),
      events: totals.events, sold: totals.sold, available: totals.available,
      capacity: totals.capacity, occupancy: totals.occupancy,
      soldOut: totals.soldOut, nearlyFull: totals.nearlyFull,
      ...(isPeriod && { periodSold: periodSoldTotal }),
      top,
    };
    onData(payload, `tk:${totals.events}:${totals.sold}:${isPeriod ? periodSoldTotal : "c"}`);
  }, [loading, isPeriod, snapLoaded, filtered, sortedEvents, totals, mode, from, to, soldByEvent, periodSoldTotal, onData]);

  return (
    <SectionShell
      icon={Ticket}
      title="Ticketing"
      subtitle={`${totals.events} events${category && category !== "all" ? ` in ${category}` : ""}${isPeriod ? ` · ${from} t/m ${to}` : " · actuele status"}${queries.length > 0 ? ` · ${queries.length === 1 ? `zoekterm "${queries[0]}"` : `${queries.length} zoektermen`}` : ""}`}
    >
      {error && (
        <div className="border border-destructive rounded-lg px-4 py-3 text-sm text-destructive">{error}</div>
      )}
      {!error && (
        <>
          <MetricGrid>
            <KpiCard label="Events" value={formatNumber(totals.events)} icon={Ticket} />
            {isPeriod && (
              <KpiCard label="Verkocht in periode" value={formatNumber(periodSoldTotal)} icon={TrendingUp} color="text-green-700" />
            )}
            <KpiCard label={isPeriod ? "Verkocht totaal" : "Verkocht"} value={formatNumber(totals.sold)} icon={Users} />
            <KpiCard label="Beschikbaar" value={formatNumber(totals.available)} icon={Eye} color="text-psv-gold" />
            <KpiCard label="Bezetting" value={`${totals.occupancy}%`} sub={`${formatNumber(totals.capacity)} capaciteit`} icon={TrendingUp} color="text-blue-500" />
            <KpiCard label="Uitverkocht" value={formatNumber(totals.soldOut)} icon={CheckCircle2} color="text-green-700" />
            <KpiCard label="Bijna vol (>85%)" value={formatNumber(totals.nearlyFull)} icon={AlertTriangle} color="text-warning" />
          </MetricGrid>

          {filtered.length === 0 && !loading && (
            <p className="text-center py-8 text-muted-foreground text-sm">Geen events gevonden voor deze filter.</p>
          )}

          {isPeriod && salesTrend.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Verkoop over tijd</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ width: "100%", height: 240 }}>
                  <ResponsiveContainer>
                    <LineChart data={salesTrend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(v) => formatNumber(Number(v))} />
                      <Line type="monotone" dataKey="sold" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} name="Verkocht" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {sortedEvents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{isPeriod ? "Events op verkoop in periode (top 30)" : "Events op bezetting (top 30)"}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-4 py-3 font-heading uppercase tracking-wide text-xs">Event</th>
                        <th className="text-left px-4 py-3 font-heading uppercase tracking-wide text-xs">Datum</th>
                        <th className="text-left px-4 py-3 font-heading uppercase tracking-wide text-xs">Categorie</th>
                        {isPeriod && <th className="text-right px-4 py-3 font-heading uppercase tracking-wide text-xs">In periode</th>}
                        <th className="text-right px-4 py-3 font-heading uppercase tracking-wide text-xs">Verkocht</th>
                        <th className="text-right px-4 py-3 font-heading uppercase tracking-wide text-xs">Beschikbaar</th>
                        <th className="text-right px-4 py-3 font-heading uppercase tracking-wide text-xs">Bezetting</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedEvents.map((e) => {
                        const pct = Math.round((e.soldTickets / e.totalCapacity) * 100);
                        const inPeriod = soldByEvent[e.eventId];
                        return (
                          <tr key={e.eventId} className="border-b">
                            <td className="px-4 py-3 font-medium">{e.eventName}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{eventDateLabel(e.eventDate)}</td>
                            <td className="px-4 py-3 text-muted-foreground">{e.category}</td>
                            {isPeriod && (
                              <td className="px-4 py-3 text-right tabular-nums font-medium text-green-700">
                                {inPeriod == null ? "—" : `+${formatNumber(inPeriod)}`}
                              </td>
                            )}
                            <td className="px-4 py-3 text-right tabular-nums">{formatNumber(e.soldTickets)}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{formatNumber(e.availableCapacity)}</td>
                            <td className={`px-4 py-3 text-right tabular-nums font-medium ${pctClass(pct)}`}>{pct}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

        </>
      )}
    </SectionShell>
  );
}

/* ---------- Web Section ---------- */

function WebSection({
  token, from, to, site, paths, onData,
}: { token: string; from: string; to: string; site: string; paths: string[]; onData: ReportData }) {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const siteData = data?.sites?.[site];

  const filteredTopPages = useMemo(() => {
    if (!siteData) return [];
    if (paths.length === 0) return siteData.topPages;
    return siteData.topPages.filter((p) => paths.some((prefix) => p.path.startsWith(prefix)));
  }, [siteData, paths]);

  // Bij een expliciete selectie alle gekozen pagina's tonen — anders zou een
  // selectie van meer dan 8 pagina's stilzwijgend worden afgekapt.
  const visibleTopPages = useMemo(
    () => (paths.length > 0 ? filteredTopPages : filteredTopPages.slice(0, 8)),
    [filteredTopPages, paths.length]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        from, to,
        pageLimit: String(PAGE_SELECT_LIMIT),
        token,
      });
      const res = await fetch(`/api/analytics?${params}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `API fout ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ophalen mislukt");
    } finally {
      setLoading(false);
    }
  }, [from, to, token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Rapporteer samenvatting omhoog voor de gecombineerde analyse.
  useEffect(() => {
    if (loading) return;
    if (!siteData) { onData(null, `web:${site}:0`); return; }
    const payload: CombinedWeb = {
      site: siteData.label ?? site,
      from, to,
      totals: siteData.totals,
      topSources: (siteData.topSources ?? []).slice(0, 5).map((s) => ({ source: s.source, sessions: s.sessions })),
      topPages: filteredTopPages.slice(0, 5).map((p) => ({ path: p.path, pageviews: p.pageviews })),
    };
    onData(payload, `web:${site}:${siteData.totals.sessions}:${siteData.totals.pageviews}`);
  }, [loading, siteData, filteredTopPages, site, from, to, onData]);

  return (
    <SectionShell
      icon={Globe}
      title="Web verkeer"
      subtitle={`${siteData?.label ?? site} · ${from} t/m ${to}${paths.length > 0 ? ` · ${paths.length === 1 ? `pad "${paths[0]}"` : `${paths.length} pagina's`}` : ""}`}
    >
      {error && (
        <div className="border border-destructive rounded-lg px-4 py-3 text-sm text-destructive">{error}</div>
      )}
      {!error && !siteData && !loading && (
        <p className="text-center py-8 text-muted-foreground text-sm">
          Geen data beschikbaar voor deze site.
        </p>
      )}
      {!error && siteData && (
        <>
          <MetricGrid>
            <KpiCard label="Sessies" value={formatNumber(siteData.totals.sessions)} icon={Globe} />
            <KpiCard label="Gebruikers" value={formatNumber(siteData.totals.users)} icon={Users} />
            <KpiCard label="Pageviews" value={formatNumber(siteData.totals.pageviews)} icon={Eye} color="text-psv-gold" />
            <KpiCard label="Nieuwe gebruikers" value={formatNumber(siteData.totals.newUsers)} icon={TrendingUp} color="text-blue-500" />
            <KpiCard label="Bounce rate" value={`${siteData.totals.bounceRate}%`} icon={AlertTriangle} color="text-warning" />
            <KpiCard label="Engagement rate" value={`${siteData.totals.engagementRate}%`} icon={CheckCircle2} color="text-green-700" />
          </MetricGrid>

          {siteData.dailyTrend?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dagelijks verkeer</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ width: "100%", height: 240 }}>
                  <ResponsiveContainer>
                    <LineChart data={siteData.dailyTrend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Line type="monotone" dataKey="sessions" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} name="Sessies" />
                      <Line type="monotone" dataKey="users" stroke={CHART_COLORS[1]} strokeWidth={2} dot={false} name="Gebruikers" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {siteData.topSources?.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top verkeersbronnen</CardTitle>
                </CardHeader>
                <CardContent>
                  <div style={{ width: "100%", height: 200 }}>
                    <ResponsiveContainer>
                      <BarChart data={siteData.topSources.slice(0, 6)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis dataKey="source" type="category" tick={{ fontSize: 11 }} tickLine={false} width={110} />
                        <Tooltip />
                        <Bar dataKey="sessions" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {filteredTopPages.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top pagina&apos;s{paths.length === 1 ? ` onder ${paths[0]}` : paths.length > 1 ? " (geselecteerde pagina's)" : ""}</CardTitle>
                </CardHeader>
                <CardContent className="p-0 max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="sticky top-0 bg-muted text-left px-4 py-2 font-heading uppercase tracking-wide text-xs">Pagina</th>
                        <th className="sticky top-0 bg-muted text-right px-4 py-2 font-heading uppercase tracking-wide text-xs">Pageviews</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleTopPages.map((p, i) => (
                        <tr key={i} className="border-b">
                          <td className="px-4 py-2 truncate max-w-xs font-mono text-xs">{p.path}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatNumber(p.pageviews)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </SectionShell>
  );
}

/* ---------- Fanstore Section ---------- */

interface FanstoreOverview {
  totals: { revenue: number; transactions: number; avgOrderValue: number; itemsPurchased: number };
  dailyTrend: { date: string; revenue: number; transactions: number }[];
  topProducts: { name: string; revenue: number; itemsPurchased: number }[];
  topCategories: { category: string; revenue: number; transactions: number }[];
}

interface ProductTrend {
  productName: string;
  dailyTrend: { date: string; revenue: number; itemsPurchased: number }[];
}

function FanstoreSection({
  token, from, to, products, onData,
}: { token: string; from: string; to: string; products: string[]; onData: ReportData }) {
  const [data, setData] = useState<FanstoreOverview | null>(null);
  const [productTrends, setProductTrends] = useState<ProductTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasSelection = products.length > 0;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = `/api/fanstore-analytics?startDate=${from}&endDate=${to}&token=${encodeURIComponent(token)}`;
      const overviewReq = fetch(`${base}&limit=100`).then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? `API fout ${r.status}`);
        }
        return r.json() as Promise<FanstoreOverview>;
      });
      const trendReqs = products.map((p) =>
        fetch(`${base}&product=${encodeURIComponent(p)}`).then(async (r) => {
          if (!r.ok) return null;
          return r.json() as Promise<ProductTrend>;
        })
      );
      const [overview, ...trends] = await Promise.all([overviewReq, ...trendReqs]);
      setData(overview);
      setProductTrends(trends.filter((t): t is ProductTrend => t !== null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ophalen mislukt");
    } finally {
      setLoading(false);
    }
  }, [from, to, token, products]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Per geselecteerd product: totalen uit de dagelijkse trend (exact, ook buiten de top-100)
  const productRows = useMemo(() => {
    if (!hasSelection) return [];
    return productTrends
      .map((t) => ({
        name: t.productName,
        revenue: t.dailyTrend.reduce((s, d) => s + d.revenue, 0),
        itemsPurchased: t.dailyTrend.reduce((s, d) => s + d.itemsPurchased, 0),
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [hasSelection, productTrends]);

  const selectionTotals = useMemo(() => ({
    revenue: productRows.reduce((s, p) => s + p.revenue, 0),
    itemsPurchased: productRows.reduce((s, p) => s + p.itemsPurchased, 0),
  }), [productRows]);

  // Gecombineerde omzet per dag voor de geselecteerde producten (één lijn per product)
  const selectionChartData = useMemo(() => {
    if (!hasSelection) return [];
    const byDate = new Map<string, Record<string, number | string>>();
    for (const trend of productTrends) {
      for (const d of trend.dailyTrend) {
        const row = byDate.get(d.date) ?? { date: d.date };
        row[trend.productName] = parseFloat((((row[trend.productName] as number) ?? 0) + d.revenue).toFixed(2));
        byDate.set(d.date, row);
      }
    }
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [hasSelection, productTrends]);

  const displayProducts = useMemo(() => {
    if (hasSelection) return productRows;
    return (data?.topProducts ?? []).slice(0, 10);
  }, [hasSelection, productRows, data]);

  // Rapporteer samenvatting omhoog voor de gecombineerde analyse.
  useEffect(() => {
    if (loading) return;
    if (!data || (hasSelection && productRows.length === 0)) { onData(null, "fs:0"); return; }
    const totals = hasSelection
      ? { revenue: selectionTotals.revenue, transactions: data.totals.transactions, avgOrderValue: data.totals.avgOrderValue, itemsPurchased: selectionTotals.itemsPurchased }
      : data.totals;
    const productList = hasSelection ? productRows : data.topProducts.slice(0, 20);
    const payload: CombinedFanstore = {
      from, to,
      selected: hasSelection,
      totals,
      products: productList.map((p) => ({ name: p.name, revenue: p.revenue, itemsPurchased: p.itemsPurchased })),
    };
    onData(payload, `fs:${Math.round(totals.revenue)}:${totals.itemsPurchased}`);
  }, [loading, data, hasSelection, productRows, selectionTotals, from, to, onData]);

  const revenueShare = hasSelection && data && data.totals.revenue > 0
    ? Math.round((selectionTotals.revenue / data.totals.revenue) * 100)
    : null;

  return (
    <SectionShell
      icon={ShoppingBag}
      title="Fanstore"
      subtitle={`${from} t/m ${to}${hasSelection ? ` · ${products.length === 1 ? `product "${products[0]}"` : `${products.length} producten`}` : " · hele winkel"}`}
    >
      {error && (
        <div className="border border-destructive rounded-lg px-4 py-3 text-sm text-destructive">{error}</div>
      )}
      {!error && (
        <>
          <MetricGrid>
            {hasSelection ? (
              <>
                <KpiCard label="Omzet (selectie)" value={formatEuro(selectionTotals.revenue)} icon={Euro} />
                <KpiCard label="Stuks verkocht" value={formatNumber(selectionTotals.itemsPurchased)} icon={Package} color="text-psv-gold" />
                <KpiCard label="Producten" value={formatNumber(productRows.length)} icon={ShoppingBag} color="text-blue-500" />
                <KpiCard
                  label="Aandeel winkelomzet"
                  value={revenueShare !== null ? `${revenueShare}%` : "—"}
                  sub={data ? `winkel totaal ${formatEuro(data.totals.revenue)}` : undefined}
                  icon={TrendingUp}
                  color="text-green-700"
                />
              </>
            ) : (
              <>
                <KpiCard label="Omzet" value={data ? formatEuro(data.totals.revenue) : "—"} icon={Euro} />
                <KpiCard label="Transacties" value={data ? formatNumber(data.totals.transactions) : "—"} icon={Users} />
                <KpiCard label="Gem. orderwaarde" value={data ? formatEuro(data.totals.avgOrderValue) : "—"} icon={TrendingUp} color="text-blue-500" />
                <KpiCard label="Stuks verkocht" value={data ? formatNumber(data.totals.itemsPurchased) : "—"} icon={Package} color="text-psv-gold" />
              </>
            )}
          </MetricGrid>

          {hasSelection && productRows.length === 0 && !loading && (
            <p className="text-center py-8 text-muted-foreground text-sm">
              Geen verkoopdata gevonden voor de geselecteerde producten in deze periode.
            </p>
          )}

          {hasSelection && selectionChartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dagelijkse omzet per product</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ width: "100%", height: 240 }}>
                  <ResponsiveContainer>
                    <LineChart data={selectionChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(v) => formatEuro(Number(v))} />
                      {productTrends.map((t, i) => (
                        <Line
                          key={t.productName}
                          type="monotone"
                          dataKey={t.productName}
                          stroke={CHART_COLORS[i % CHART_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {!hasSelection && (data?.dailyTrend?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dagelijkse omzet</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ width: "100%", height: 240 }}>
                  <ResponsiveContainer>
                    <LineChart data={data!.dailyTrend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(v, name) => (name === "revenue" ? formatEuro(Number(v)) : formatNumber(Number(v)))} />
                      <Line type="monotone" dataKey="revenue" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} name="Omzet" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {displayProducts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{hasSelection ? "Geselecteerde producten" : "Top producten"}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-4 py-3 font-heading uppercase tracking-wide text-xs">Product</th>
                        <th className="text-right px-4 py-3 font-heading uppercase tracking-wide text-xs">Omzet</th>
                        <th className="text-right px-4 py-3 font-heading uppercase tracking-wide text-xs">Stuks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayProducts.map((p) => (
                        <tr key={p.name} className="border-b">
                          <td className="px-4 py-3 max-w-md"><span className="font-medium">{p.name}</span></td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatEuro(p.revenue)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatNumber(p.itemsPurchased)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {!hasSelection && (data?.topCategories?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top categorieën</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <BarChart data={data!.topCategories.slice(0, 6)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis dataKey="category" type="category" tick={{ fontSize: 11 }} tickLine={false} width={130} />
                      <Tooltip formatter={(v) => formatEuro(Number(v))} />
                      <Bar dataKey="revenue" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} name="Omzet" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

        </>
      )}
    </SectionShell>
  );
}

/* ---------- Gecombineerde AI-analyse ---------- */

function CombinedAnalysisBlock({
  loading, error, result, stale, hasData, hasRun, generatedAt, onRerun,
}: {
  loading: boolean;
  error: string | null;
  result: CombinedInsightResult | null;
  stale: boolean;
  hasData: boolean;
  hasRun: boolean;
  generatedAt: string | null;
  onRerun: () => void;
}) {
  const generatedLabel = generatedAt
    ? new Date(generatedAt).toLocaleString("nl-NL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;
  return (
    <Card className="bg-gradient-to-br from-psv-red-primary/5 to-psv-gold/5 border-psv-red-primary/20">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-psv-red-primary" />
          <CardTitle className="text-sm font-heading uppercase tracking-wide">AI-analyse</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          {stale && !loading ? (
            <span className="text-xs text-warning">Nieuwe data beschikbaar</span>
          ) : generatedLabel && !loading ? (
            <span className="text-xs text-muted-foreground">Geanalyseerd op {generatedLabel}</span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRerun}
            disabled={loading || !hasData}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {hasRun ? "Opnieuw analyseren" : "Analyseren"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {loading && <p className="text-muted-foreground italic">Analyse wordt gegenereerd…</p>}
        {!loading && error && <p className="text-destructive">Kon geen analyse genereren: {error}</p>}
        {!loading && !error && !result && (
          <p className="text-muted-foreground italic">
            {hasData ? "Nog geen analyse — klik op ‘Analyseren’ om er één te maken." : "Wachten op data…"}
          </p>
        )}
        {!loading && !error && result?.summary && <p className="leading-relaxed">{result.summary}</p>}
        {!loading && !error && result?.highlights && result.highlights.length > 0 && (
          <ul className="space-y-1.5">
            {result.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-psv-red-primary" />
                <span className="leading-relaxed">{h.text}</span>
              </li>
            ))}
          </ul>
        )}
        {!loading && !error && result?.recommendations && result.recommendations.length > 0 && (
          <div className="rounded-md bg-background/60 p-3 space-y-1.5">
            <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5" /> Aanbevelingen
            </p>
            <ul className="space-y-1">
              {result.recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-green-700" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Main ---------- */

function ShareRapportageContent() {
  const urlParams = useSearchParams();
  const reportId = urlParams.get("id") ?? "";
  const legacyToken = urlParams.get("token") ?? "";

  const [params, setParams] = useState<CampaignParams | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [refreshTick, setRefreshTick] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Token voor de data/insights endpoints is volledig afleidbaar uit de URL.
  const token = useMemo(
    () => (reportId ? makeShareToken({ kind: "report", id: reportId }) : legacyToken),
    [reportId, legacyToken]
  );

  useEffect(() => {
    if (reportId) {
      // Opgeslagen rapport: configuratie ophalen via het rapport-id
      fetch(`/api/reports/${encodeURIComponent(reportId)}`)
        .then((r) => r.ok ? r.json() : r.json().then((e) => Promise.reject(e?.error ?? `Fout ${r.status}`)).catch(() => Promise.reject(`Fout ${r.status}`)))
        .then((data) => {
          const report = data?.report as ReportRecord | undefined;
          if (!report || !report.sources) {
            setTokenError("Rapport niet gevonden.");
            setLoading(false);
            return;
          }
          setParams({
            kind: "campaign",
            name: report.title,
            intro: report.intro,
            from: report.from,
            to: report.to,
            sources: report.sources,
          });
          setLoading(false);
          setLastRefresh(new Date());
        })
        .catch((err) => { setTokenError(String(err)); setLoading(false); });
      return;
    }

    if (!legacyToken) { setTokenError("Ongeldige link"); setLoading(false); return; }
    fetch(`/api/share?token=${encodeURIComponent(legacyToken)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(`Fout ${r.status}`))
      .then((data) => {
        if (!data || data.kind !== "campaign") {
          setTokenError("Deze link hoort niet bij een campagne-rapportage.");
          setLoading(false);
          return;
        }
        setParams(data as CampaignParams);
        setLoading(false);
        setLastRefresh(new Date());
      })
      .catch((err) => { setTokenError(String(err)); setLoading(false); });
  }, [reportId, legacyToken]);

  useEffect(() => {
    if (!params) return;
    const id = setInterval(() => {
      setRefreshTick((t) => t + 1);
      setLastRefresh(new Date());
    }, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [params]);

  /* ---- Gecombineerde AI-analyse: opgeslagen, alleen (her)genereren via de knop ---- */
  const enabledKeys = useMemo(() => {
    const ks: string[] = [];
    if (params?.sources.dm?.enabled) ks.push("dm");
    if (params?.sources.ticketing?.enabled) ks.push("ticket");
    if (params?.sources.web?.enabled) ks.push("web");
    if (params?.sources.fanstore?.enabled) ks.push("fanstore");
    return ks;
  }, [params]);

  const reportedRef = useRef<Record<string, { payload: object | null; sig: string }>>({});
  const [dataSig, setDataSig] = useState("");
  const [analysis, setAnalysis] = useState<CombinedInsightResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analyzedSig, setAnalyzedSig] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const report = useCallback((key: string, payload: object | null, sig: string) => {
    reportedRef.current[key] = { payload, sig };
    const combined = Object.keys(reportedRef.current).sort()
      .map((k) => `${k}=${reportedRef.current[k].sig}`).join("|");
    setDataSig(combined);
  }, []);

  const reportDm = useCallback<ReportData>((p, s) => report("dm", p, s), [report]);
  const reportTicket = useCallback<ReportData>((p, s) => report("ticket", p, s), [report]);
  const reportWeb = useCallback<ReportData>((p, s) => report("web", p, s), [report]);
  const reportFanstore = useCallback<ReportData>((p, s) => report("fanstore", p, s), [report]);

  // Bij het openen: opgeslagen analyse ophalen (geen nieuwe AI-call).
  useEffect(() => {
    if (!reportId) return;
    let active = true;
    fetch(`/api/reports/${encodeURIComponent(reportId)}/analysis`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const a = data?.analysis;
        if (active && a?.result) {
          setAnalysis(a.result as CombinedInsightResult);
          setAnalyzedSig(typeof a.sig === "string" ? a.sig : "");
          setGeneratedAt(a.generatedAt ?? null);
        }
      })
      .catch(() => { /* geen opgeslagen analyse — gebruiker kan zelf genereren */ });
    return () => { active = false; };
  }, [reportId]);

  const runAnalysis = useCallback(async () => {
    if (enabledKeys.length === 0) return;
    const payload: Record<string, unknown> = {};
    if (params?.name) payload.title = params.name;
    if (params?.intro) payload.intro = params.intro;
    let any = false;
    for (const k of enabledKeys) {
      const entry = reportedRef.current[k];
      if (entry?.payload) { payload[k] = entry.payload; any = true; }
    }
    const sigAtRun = dataSig;
    if (!any) {
      setAnalysisError("Er is nog geen data om te analyseren.");
      return;
    }
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      // Rapport-id → opslaan zodat een refresh geen nieuwe AI-call doet.
      const endpoint = reportId
        ? `/api/reports/${encodeURIComponent(reportId)}/analysis`
        : "/api/share/insights";
      const requestBody = reportId
        ? { token, sig: sigAtRun, payload }
        : { token, source: "combined", payload };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error ?? `Fout ${res.status}`);
      }
      const data = await res.json();
      if (reportId) {
        const a = data.analysis;
        setAnalysis(a.result as CombinedInsightResult);
        setAnalyzedSig(a.sig ?? sigAtRun);
        setGeneratedAt(a.generatedAt ?? null);
      } else {
        setAnalysis(data as CombinedInsightResult);
        setAnalyzedSig(sigAtRun);
        setGeneratedAt(new Date().toISOString());
      }
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Analyse mislukt");
    } finally {
      setAnalysisLoading(false);
    }
  }, [enabledKeys, params, token, reportId, dataSig]);

  const allReported = enabledKeys.length > 0 && enabledKeys.every((k) => k in reportedRef.current);
  const hasData = enabledKeys.some((k) => reportedRef.current[k]?.payload);
  const stale = analyzedSig !== null && allReported && dataSig !== analyzedSig;

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-muted-foreground text-sm">Laden…</div>;
  }
  if (tokenError) {
    return <div className="flex items-center justify-center min-h-screen text-muted-foreground text-sm">{tokenError}</div>;
  }
  if (!params) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-sidebar border-b border-sidebar-border w-full">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <img src={PSV_LOGO} alt="PSV" className="h-9 w-9 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-xl font-heading uppercase text-sidebar-foreground leading-tight truncate">
                {params.name}
              </h1>
              <p className="text-xs text-sidebar-foreground/60 mt-0.5">
                Live rapportage — elk inzicht met eigen periode
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-sidebar-foreground/60 shrink-0">
            <RefreshCw className="h-3.5 w-3.5" />
            {lastRefresh
              ? `Ververst om ${lastRefresh.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`
              : "Laden…"}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">
        {params.intro && (
          <p className="text-sm leading-relaxed text-muted-foreground border-l-2 border-psv-red-primary pl-4 whitespace-pre-line">
            {params.intro}
          </p>
        )}

        <CombinedAnalysisBlock
          loading={analysisLoading}
          error={analysisError}
          result={analysis}
          stale={stale}
          hasData={hasData}
          hasRun={analysis !== null}
          generatedAt={generatedAt}
          onRerun={runAnalysis}
        />

        {params.sources.dm?.enabled && (() => {
          const range = resolvePeriod(params.sources.dm.period, params.from, params.to);
          return (
            <DmSection
              key={`dm-${refreshTick}`}
              from={range.from}
              to={range.to}
              queries={collectQueries(params.sources.dm)}
              onData={reportDm}
            />
          );
        })()}
        {params.sources.ticketing?.enabled && (() => {
          const tk = params.sources.ticketing;
          const mode = tk.mode === "period" ? "period" : "current";
          const range = resolvePeriod(tk.period, params.from, params.to);
          return (
            <TicketingSection
              key={`ticket-${refreshTick}`}
              queries={collectQueries(tk)}
              category={tk.category}
              mode={mode}
              from={range.from}
              to={range.to}
              onData={reportTicket}
            />
          );
        })()}
        {params.sources.web?.enabled && (() => {
          const range = resolvePeriod(params.sources.web.period, params.from, params.to);
          return (
            <WebSection
              key={`web-${refreshTick}`}
              token={token}
              from={range.from}
              to={range.to}
              site={params.sources.web.site}
              paths={collectPaths(params.sources.web)}
              onData={reportWeb}
            />
          );
        })()}
        {params.sources.fanstore?.enabled && (() => {
          const range = resolvePeriod(params.sources.fanstore.period, params.from, params.to);
          return (
            <FanstoreSection
              key={`fanstore-${refreshTick}`}
              token={token}
              from={range.from}
              to={range.to}
              products={params.sources.fanstore.products ?? []}
              onData={reportFanstore}
            />
          );
        })()}

        <div className="flex items-center justify-between gap-4 pt-4 border-t border-border">
          <Badge variant="secondary" className="text-xs">PSV Tools</Badge>
          <p className="text-xs text-muted-foreground">
            Cijfers verversen automatisch elke 5 minuten · AI-analyse draait op verzoek.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ShareRapportagePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-muted-foreground text-sm">Laden…</div>}>
      <ShareRapportageContent />
    </Suspense>
  );
}
