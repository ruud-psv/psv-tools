"use client";

import { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  RefreshCw, Mail, Users, Eye, MousePointerClick, TrendingUp, AlertTriangle, UserMinus,
  Ticket, Globe, Sparkles, CheckCircle2, Lightbulb,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  computeTotals as computeDmTotals,
  formatDate, formatNumber, formatPct, stripName,
  KpiCard, RateBadge,
  type MailingSummary, type Totals as DmTotals,
} from "@/lib/dm-share";
import type { DmInsightResult } from "@/lib/insights/dm";
import type { TicketInsightResult } from "@/lib/insights/ticket";
import type { AnalyticsInsightResult } from "@/lib/insights/analytics";

const REFRESH_INTERVAL = 5 * 60 * 1000;

const PSV_LOGO = "https://www.psv.nl/upload/23adcb48-abc3-487f-9158-6bc7822599a6_PSV_logo_color.svg";
const CHART_COLORS = ["#e82026", "#bb9753", "#09101d", "#c00d0d", "#2e5aac", "#287d3c"];

/* ---------- Types ---------- */

interface CampaignParams {
  kind: "campaign";
  name: string;
  from: string;
  to: string;
  sources: {
    dm?: { enabled: true; query?: string };
    ticketing?: { enabled: true; query?: string; category?: string };
    web?: { enabled: true; site: string; path?: string };
  };
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

function AiBlock({
  loading, error, summary, highlights, recommendations, extras,
}: {
  loading: boolean;
  error: string | null;
  summary?: string;
  highlights?: { type: string; text: string }[];
  recommendations?: string[];
  extras?: React.ReactNode;
}) {
  return (
    <Card className="bg-gradient-to-br from-psv-red-primary/5 to-psv-gold/5 border-psv-red-primary/20">
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <Sparkles className="h-4 w-4 text-psv-red-primary" />
        <CardTitle className="text-sm font-heading uppercase tracking-wide">AI inzichten</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {loading && (
          <p className="text-muted-foreground italic">Inzichten worden gegenereerd…</p>
        )}
        {error && !loading && (
          <p className="text-destructive">Kon geen inzichten genereren: {error}</p>
        )}
        {!loading && !error && summary && (
          <p className="leading-relaxed">{summary}</p>
        )}
        {!loading && !error && highlights && highlights.length > 0 && (
          <ul className="space-y-1.5">
            {highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-psv-red-primary" />
                <span className="leading-relaxed">{h.text}</span>
              </li>
            ))}
          </ul>
        )}
        {!loading && !error && recommendations && recommendations.length > 0 && (
          <div className="rounded-md bg-background/60 p-3 space-y-1.5">
            <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5" /> Aanbevelingen
            </p>
            <ul className="space-y-1">
              {recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-green-700" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!loading && !error && extras}
      </CardContent>
    </Card>
  );
}

/* ---------- DM Section ---------- */

function DmSection({
  token, params, query,
}: { token: string; params: CampaignParams; query?: string }) {
  const [mailings, setMailings] = useState<MailingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<DmInsightResult | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!query?.trim()) return mailings;
    const lower = query.toLowerCase();
    return mailings.filter((m) => {
      const name = (m.name ?? "").toLowerCase();
      if (name.includes(lower)) return true;
      if ((m.subject ?? "").toLowerCase().includes(lower)) return true;
      // Match against stripped name so a suggestion picked from autocomplete
      // (which is the cleaned label) still finds the underlying mailing.
      return stripName(m.name ?? "").toLowerCase().includes(lower);
    });
  }, [mailings, query]);

  const totals = useMemo(() => computeDmTotals(filtered), [filtered]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/maileon?from=${params.from}&to=${params.to}`);
      if (!res.ok) throw new Error(`API fout ${res.status}`);
      const json = await res.json();
      setMailings(json.mailings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ophalen mislukt");
    } finally {
      setLoading(false);
    }
  }, [params.from, params.to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Run AI insights when filtered data arrives (or changes meaningfully)
  useEffect(() => {
    if (filtered.length === 0) { setInsights(null); return; }
    setInsightsLoading(true);
    setInsightsError(null);
    fetch("/api/share/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        source: "dm",
        payload: {
          mailings: filtered,
          totals,
          dateRange: { preset: "custom", from: params.from, to: params.to },
        },
      }),
    })
      .then((r) => r.ok ? r.json() : r.json().then((e) => Promise.reject(e?.error ?? `Fout ${r.status}`)))
      .then((data: DmInsightResult) => setInsights(data))
      .catch((err) => setInsightsError(typeof err === "string" ? err : "Onbekende fout"))
      .finally(() => setInsightsLoading(false));
  }, [filtered, totals, token, params.from, params.to]);

  return (
    <SectionShell
      icon={Mail}
      title="DM Performance"
      subtitle={`${formatNumber(totals.mailings)} mailings · ${params.from} t/m ${params.to}${query ? ` · zoekterm "${query}"` : ""}`}
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

          {filtered.length > 0 && (
            <AiBlock
              loading={insightsLoading}
              error={insightsError}
              summary={insights?.summary}
              highlights={insights?.highlights}
              recommendations={insights?.recommendations}
              extras={
                insights && (insights.topPerformer || insights.bottomPerformer) ? (
                  <div className="grid gap-2 sm:grid-cols-2 pt-2">
                    {insights.topPerformer && (
                      <div className="rounded-md border border-green-200 bg-green-50 p-3 text-xs">
                        <p className="font-heading uppercase text-green-800 mb-1">Top performer</p>
                        <p className="font-medium">{insights.topPerformer.name}</p>
                        <p className="text-muted-foreground">{insights.topPerformer.metric}</p>
                        <p className="mt-1 text-foreground/80">{insights.topPerformer.why}</p>
                      </div>
                    )}
                    {insights.bottomPerformer && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
                        <p className="font-heading uppercase text-amber-800 mb-1">Aandacht nodig</p>
                        <p className="font-medium">{insights.bottomPerformer.name}</p>
                        <p className="text-muted-foreground">{insights.bottomPerformer.metric}</p>
                        <p className="mt-1 text-foreground/80">{insights.bottomPerformer.suggestion}</p>
                      </div>
                    )}
                  </div>
                ) : null
              }
            />
          )}
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

function TicketingSection({
  token, query, category,
}: { token: string; query?: string; category?: string }) {
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<TicketInsightResult | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

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
    if (query?.trim()) {
      const lower = query.toLowerCase();
      list = list.filter((e) => e.eventName.toLowerCase().includes(lower));
    }
    return list;
  }, [events, query, category]);

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

  useEffect(() => {
    if (filtered.length === 0) { setInsights(null); return; }
    setInsightsLoading(true);
    setInsightsError(null);
    fetch("/api/share/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, source: "ticket", payload: { events: filtered } }),
    })
      .then((r) => r.ok ? r.json() : r.json().then((e) => Promise.reject(e?.error ?? `Fout ${r.status}`)))
      .then((data: TicketInsightResult) => setInsights(data))
      .catch((err) => setInsightsError(typeof err === "string" ? err : "Onbekende fout"))
      .finally(() => setInsightsLoading(false));
  }, [filtered, token]);

  const sortedEvents = useMemo(
    () => [...filtered]
      .filter((e) => e.totalCapacity > 0)
      .sort((a, b) => (b.soldTickets / b.totalCapacity) - (a.soldTickets / a.totalCapacity))
      .slice(0, 30),
    [filtered]
  );

  return (
    <SectionShell
      icon={Ticket}
      title="Ticketing"
      subtitle={`${totals.events} events${category && category !== "all" ? ` in ${category}` : ""}${query ? ` · zoekterm "${query}"` : ""}`}
    >
      {error && (
        <div className="border border-destructive rounded-lg px-4 py-3 text-sm text-destructive">{error}</div>
      )}
      {!error && (
        <>
          <MetricGrid>
            <KpiCard label="Events" value={formatNumber(totals.events)} icon={Ticket} />
            <KpiCard label="Verkocht" value={formatNumber(totals.sold)} icon={Users} />
            <KpiCard label="Beschikbaar" value={formatNumber(totals.available)} icon={Eye} color="text-psv-gold" />
            <KpiCard label="Bezetting" value={`${totals.occupancy}%`} sub={`${formatNumber(totals.capacity)} capaciteit`} icon={TrendingUp} color="text-blue-500" />
            <KpiCard label="Uitverkocht" value={formatNumber(totals.soldOut)} icon={CheckCircle2} color="text-green-700" />
            <KpiCard label="Bijna vol (>85%)" value={formatNumber(totals.nearlyFull)} icon={AlertTriangle} color="text-warning" />
          </MetricGrid>

          {filtered.length === 0 && !loading && (
            <p className="text-center py-8 text-muted-foreground text-sm">Geen events gevonden voor deze filter.</p>
          )}

          {sortedEvents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Events op bezetting (top 30)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-4 py-3 font-heading uppercase tracking-wide text-xs">Event</th>
                        <th className="text-left px-4 py-3 font-heading uppercase tracking-wide text-xs">Datum</th>
                        <th className="text-left px-4 py-3 font-heading uppercase tracking-wide text-xs">Categorie</th>
                        <th className="text-right px-4 py-3 font-heading uppercase tracking-wide text-xs">Verkocht</th>
                        <th className="text-right px-4 py-3 font-heading uppercase tracking-wide text-xs">Beschikbaar</th>
                        <th className="text-right px-4 py-3 font-heading uppercase tracking-wide text-xs">Bezetting</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedEvents.map((e) => {
                        const pct = Math.round((e.soldTickets / e.totalCapacity) * 100);
                        return (
                          <tr key={e.eventId} className="border-b">
                            <td className="px-4 py-3 font-medium">{e.eventName}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{eventDateLabel(e.eventDate)}</td>
                            <td className="px-4 py-3 text-muted-foreground">{e.category}</td>
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

          {filtered.length > 0 && (
            <AiBlock
              loading={insightsLoading}
              error={insightsError}
              summary={insights?.summary}
              highlights={insights?.highlights}
              recommendations={insights?.recommendations}
              extras={
                insights && (insights.highestDemand || insights.mostAvailable) ? (
                  <div className="grid gap-2 sm:grid-cols-2 pt-2">
                    {insights.highestDemand && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
                        <p className="font-heading uppercase text-amber-800 mb-1">Hoogste vraag</p>
                        <p className="font-medium">{insights.highestDemand.name}</p>
                        <p className="text-muted-foreground">{insights.highestDemand.metric}</p>
                        <p className="mt-1 text-foreground/80">{insights.highestDemand.action}</p>
                      </div>
                    )}
                    {insights.mostAvailable && (
                      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs">
                        <p className="font-heading uppercase text-blue-800 mb-1">Meeste ruimte</p>
                        <p className="font-medium">{insights.mostAvailable.name}</p>
                        <p className="text-muted-foreground">{insights.mostAvailable.metric}</p>
                        <p className="mt-1 text-foreground/80">{insights.mostAvailable.action}</p>
                      </div>
                    )}
                  </div>
                ) : null
              }
            />
          )}
        </>
      )}
    </SectionShell>
  );
}

/* ---------- Web Section ---------- */

function periodForRange(from: string, to: string): string {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  const days = Math.max(1, Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24)));
  if (days <= 7) return "7d";
  if (days <= 30) return "30d";
  return "90d";
}

function WebSection({
  token, params, site, path,
}: { token: string; params: CampaignParams; site: string; path?: string }) {
  const period = periodForRange(params.from, params.to);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<AnalyticsInsightResult | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const siteData = data?.sites?.[site];

  const filteredTopPages = useMemo(() => {
    if (!siteData) return [];
    if (!path?.trim()) return siteData.topPages;
    return siteData.topPages.filter((p) => p.path.startsWith(path));
  }, [siteData, path]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics?period=${period}&token=${encodeURIComponent(token)}`);
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
  }, [period, token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!siteData) { setInsights(null); return; }
    const sites: Record<string, AnalyticsSiteData> = { [site]: { ...siteData, topPages: filteredTopPages } };
    setInsightsLoading(true);
    setInsightsError(null);
    fetch("/api/share/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        source: "analytics",
        payload: {
          sites,
          combined: { totals: siteData.totals },
          period,
        },
      }),
    })
      .then((r) => r.ok ? r.json() : r.json().then((e) => Promise.reject(e?.error ?? `Fout ${r.status}`)))
      .then((data: AnalyticsInsightResult) => setInsights(data))
      .catch((err) => setInsightsError(typeof err === "string" ? err : "Onbekende fout"))
      .finally(() => setInsightsLoading(false));
  }, [siteData, filteredTopPages, site, period, token]);

  return (
    <SectionShell
      icon={Globe}
      title="Web verkeer"
      subtitle={`${siteData?.label ?? site}${path ? ` · pad "${path}"` : ""} · periode ${period}`}
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
                  <CardTitle className="text-base">Top pagina&apos;s{path ? ` onder ${path}` : ""}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-4 py-2 font-heading uppercase tracking-wide text-xs">Pagina</th>
                        <th className="text-right px-4 py-2 font-heading uppercase tracking-wide text-xs">Pageviews</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTopPages.slice(0, 8).map((p, i) => (
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

          {siteData && (
            <AiBlock
              loading={insightsLoading}
              error={insightsError}
              summary={insights?.summary}
              highlights={insights?.highlights}
              recommendations={insights?.recommendations}
              extras={
                insights && (insights.bestPerformer || insights.attentionNeeded) ? (
                  <div className="grid gap-2 sm:grid-cols-2 pt-2">
                    {insights.bestPerformer && (
                      <div className="rounded-md border border-green-200 bg-green-50 p-3 text-xs">
                        <p className="font-heading uppercase text-green-800 mb-1">Sterk punt</p>
                        <p className="font-medium">{insights.bestPerformer.site}</p>
                        <p className="text-muted-foreground">{insights.bestPerformer.metric}</p>
                        <p className="mt-1 text-foreground/80">{insights.bestPerformer.why}</p>
                      </div>
                    )}
                    {insights.attentionNeeded && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
                        <p className="font-heading uppercase text-amber-800 mb-1">Aandacht nodig</p>
                        <p className="font-medium">{insights.attentionNeeded.site}</p>
                        <p className="text-muted-foreground">{insights.attentionNeeded.metric}</p>
                        <p className="mt-1 text-foreground/80">{insights.attentionNeeded.action}</p>
                      </div>
                    )}
                  </div>
                ) : null
              }
            />
          )}
        </>
      )}
    </SectionShell>
  );
}

/* ---------- Main ---------- */

function ShareRapportageContent() {
  const urlParams = useSearchParams();
  const token = urlParams.get("token") ?? "";

  const [params, setParams] = useState<CampaignParams | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [refreshTick, setRefreshTick] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    if (!token) { setTokenError("Ongeldige link"); setLoading(false); return; }
    fetch(`/api/share?token=${encodeURIComponent(token)}`)
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
  }, [token]);

  useEffect(() => {
    if (!params) return;
    const id = setInterval(() => {
      setRefreshTick((t) => t + 1);
      setLastRefresh(new Date());
    }, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [params]);

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
                {params.from} t/m {params.to}
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
        {params.sources.dm?.enabled && (
          <DmSection key={`dm-${refreshTick}`} token={token} params={params} query={params.sources.dm.query} />
        )}
        {params.sources.ticketing?.enabled && (
          <TicketingSection
            key={`ticket-${refreshTick}`}
            token={token}
            query={params.sources.ticketing.query}
            category={params.sources.ticketing.category}
          />
        )}
        {params.sources.web?.enabled && (
          <WebSection
            key={`web-${refreshTick}`}
            token={token}
            params={params}
            site={params.sources.web.site}
            path={params.sources.web.path}
          />
        )}

        <div className="flex items-center justify-between gap-4 pt-4 border-t border-border">
          <Badge variant="secondary" className="text-xs">PSV Tools</Badge>
          <p className="text-xs text-muted-foreground">
            Live data — automatisch ververst elke 5 minuten.
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
