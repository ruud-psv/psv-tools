"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Globe,
  Users,
  Eye,
  MousePointerClick,
  RefreshCw,
  Loader2,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  Monitor,
  Smartphone,
  Tablet,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

/* ---------- Types ---------- */

interface SiteTotals {
  sessions: number;
  users: number;
  pageviews: number;
  newUsers: number;
  bounceRate: number;
  engagementRate: number;
}

interface DailyPoint {
  date: string;
  sessions: number;
  users: number;
  pageviews: number;
}

interface SiteData {
  label: string;
  totals: SiteTotals;
  dailyTrend: DailyPoint[];
  topSources: { source: string; sessions: number; users: number }[];
  topPages: { path: string; pageviews: number }[];
  devices: { device: string; sessions: number; percentage: number }[];
}

interface AnalyticsResponse {
  sites: Record<string, SiteData>;
  combined: {
    totals: { sessions: number; users: number; pageviews: number };
    dailyTrend: DailyPoint[];
  };
  siteErrors?: Record<string, string>;
  fetchedAt: string;
}

interface InsightsResponse {
  summary: string;
  highlights: { type: string; text: string }[];
  recommendations: string[];
  bestPerformer: { site: string; metric: string; why: string } | null;
  attentionNeeded: { site: string; metric: string; action: string } | null;
}

/* ---------- Helpers ---------- */

function formatNumber(n: number): string {
  return n.toLocaleString("nl-NL");
}

function formatDateShort(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("nl-NL", { day: "2-digit", month: "short" });
  } catch {
    return iso;
  }
}

function deviceIcon(device: string) {
  const d = device.toLowerCase();
  if (d === "mobile") return <Smartphone className="h-4 w-4" />;
  if (d === "tablet") return <Tablet className="h-4 w-4" />;
  return <Monitor className="h-4 w-4" />;
}

/* ---------- AI Insights Panel ---------- */

function WebInsightsPanel({
  onAnalyze,
  insights,
  loading,
  error,
  hasData,
  periodLabel,
}: {
  onAnalyze: () => void;
  insights: InsightsResponse | null;
  loading: boolean;
  error: string | null;
  hasData: boolean;
  periodLabel: string;
}) {
  const highlightIcon = (type: string) => {
    switch (type) {
      case "achievement": return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />;
      case "opportunity": return <TrendingUp className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />;
      case "trend":       return <TrendingUp className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />;
      case "warning":     return <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />;
      case "anomaly":     return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;
      default:            return <TrendingUp className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />;
    }
  };

  if (loading) {
    return (
      <Card><CardContent className="flex items-center justify-center gap-3 py-8">
        <Loader2 className="h-5 w-5 animate-spin text-psv-gold" />
        <span className="text-sm text-muted-foreground">AI-inzichten worden gegenereerd...</span>
      </CardContent></Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive"><CardContent className="flex items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div><p className="text-sm font-medium">Analyse mislukt</p><p className="text-xs text-muted-foreground">{error}</p></div>
        </div>
        <Button variant="outline" size="sm" onClick={onAnalyze}>Opnieuw proberen</Button>
      </CardContent></Card>
    );
  }

  if (!insights) {
    return (
      <Card className="border-dashed"><CardContent className="flex items-center justify-between gap-4 py-4">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-psv-gold shrink-0" />
          <div>
            <p className="text-sm font-medium">AI Inzichten</p>
            <p className="text-xs text-muted-foreground">Laat het model het webverkeer analyseren voor de {periodLabel}.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onAnalyze} disabled={!hasData} className="shrink-0">
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />Analyseren
        </Button>
      </CardContent></Card>
    );
  }

  return (
    <Card className="border-t-2 border-t-psv-gold">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-psv-gold" />AI Inzichten
            <span className="text-xs font-normal text-muted-foreground ml-1">{periodLabel}</span>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onAnalyze} className="text-xs text-muted-foreground h-7">Vernieuwen</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm leading-relaxed">{String(insights.summary ?? "")}</p>

        {insights.highlights?.length > 0 && (
          <div className="space-y-2">
            {insights.highlights.map((h, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">{highlightIcon(h.type)}<span>{String(h.text ?? "")}</span></div>
            ))}
          </div>
        )}

        {(insights.bestPerformer || insights.attentionNeeded) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {insights.bestPerformer && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 space-y-1">
                <p className="text-xs font-heading uppercase tracking-wide text-emerald-600">Beste prestatie</p>
                <p className="text-sm font-medium">{String(insights.bestPerformer.site ?? "")}</p>
                <p className="text-xs text-muted-foreground">{String(insights.bestPerformer.metric ?? "")}</p>
                <p className="text-xs text-muted-foreground">{String(insights.bestPerformer.why ?? "")}</p>
              </div>
            )}
            {insights.attentionNeeded && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-1">
                <p className="text-xs font-heading uppercase tracking-wide text-amber-600">Aandacht nodig</p>
                <p className="text-sm font-medium">{String(insights.attentionNeeded.site ?? "")}</p>
                <p className="text-xs text-muted-foreground">{String(insights.attentionNeeded.metric ?? "")}</p>
                <p className="text-xs text-muted-foreground">{String(insights.attentionNeeded.action ?? "")}</p>
              </div>
            )}
          </div>
        )}

        {insights.recommendations?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground">Aanbevelingen</p>
            <ul className="space-y-2">
              {insights.recommendations.map((r, i) => (
                <li key={i} className="text-sm pl-3 border-l-2 border-psv-gold text-muted-foreground">{String(r ?? "")}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Site Detail ---------- */

function SiteDetail({ site }: { site: SiteData }) {
  const trendData = useMemo(
    () => site.dailyTrend.map((d) => ({ ...d, label: formatDateShort(d.date) })),
    [site.dailyTrend]
  );

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MiniKpi label="Sessies" value={formatNumber(site.totals.sessions)} />
        <MiniKpi label="Gebruikers" value={formatNumber(site.totals.users)} />
        <MiniKpi label="Pageviews" value={formatNumber(site.totals.pageviews)} />
        <MiniKpi label="Nieuwe gebruikers" value={formatNumber(site.totals.newUsers)} />
        <MiniKpi label="Bounce rate" value={`${site.totals.bounceRate}%`} />
        <MiniKpi label="Engagement" value={`${site.totals.engagementRate}%`} />
      </div>

      {/* Daily trend chart */}
      {trendData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Dagelijks verkeer</CardTitle></CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#999" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#999" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: "6px", color: "#fff", fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="sessions" name="Sessies" stroke="#e82026" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="users" name="Gebruikers" stroke="#bb9753" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-6 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-psv-red-primary" />Sessies</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-psv-gold" />Gebruikers</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top sources */}
        {site.topSources.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Top verkeersbronnen</CardTitle></CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={site.topSources.slice(0, 5)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.2} />
                    <XAxis type="number" tick={{ fontSize: 10 }} stroke="#999" />
                    <YAxis type="category" dataKey="source" tick={{ fontSize: 10 }} stroke="#999" width={80} />
                    <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: "6px", color: "#fff", fontSize: 12 }} />
                    <Bar dataKey="sessions" name="Sessies" fill="#e82026" radius={[0, 3, 3, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top pages */}
        {site.topPages.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Top pagina&apos;s</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <tbody>
                  {site.topPages.slice(0, 8).map((p, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2 truncate max-w-[200px] text-muted-foreground">{p.path}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{formatNumber(p.pageviews)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* Devices */}
        {site.devices.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Apparaten</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {site.devices.map((d, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-muted-foreground">{deviceIcon(d.device)}</span>
                  <span className="text-sm capitalize flex-1">{d.device}</span>
                  <span className="text-sm tabular-nums font-medium">{d.percentage}%</span>
                  <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-psv-red-primary rounded-full" style={{ width: `${d.percentage}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-4 py-3">
      <p className="text-[10px] font-heading uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-heading uppercase mt-0.5">{value}</p>
    </div>
  );
}

/* ---------- Main Dashboard ---------- */

const PERIOD_OPTIONS = [
  { value: "7d", label: "Laatste 7 dagen" },
  { value: "30d", label: "Laatste 30 dagen" },
  { value: "90d", label: "Laatste 90 dagen" },
];

export function WebVerkeerDashboard() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("30d");
  const [activeSite, setActiveSite] = useState("combined");
  const [lastFetched, setLastFetched] = useState<string | null>(null);

  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const insightsCache = useRef<Map<string, InsightsResponse>>(new Map());

  const fetchData = useCallback(async (p: string) => {
    setLoading(true);
    setError(null);
    insightsCache.current.delete(p);
    try {
      const res = await fetch(`/api/analytics?period=${p}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `API gaf status ${res.status}`);
      }
      const json: AnalyticsResponse = await res.json();
      setData(json);
      setLastFetched(json.fetchedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ophalen mislukt");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInsights = useCallback(async () => {
    if (!data?.sites || Object.keys(data.sites).length === 0) return;
    const cached = insightsCache.current.get(period);
    if (cached) { setInsights(cached); setInsightsError(null); return; }
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const res = await fetch("/api/analytics-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sites: data.sites, combined: data.combined, period }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `API gaf status ${res.status}`);
      }
      const result: InsightsResponse = await res.json();
      setInsights(result);
      insightsCache.current.set(period, result);
    } catch (err) {
      setInsightsError(err instanceof Error ? err.message : "Analyse mislukt");
    } finally {
      setInsightsLoading(false);
    }
  }, [data, period]);

  useEffect(() => { fetchData(period); }, [period, fetchData]);
  useEffect(() => { setInsights(null); setInsightsError(null); }, [period]);

  const sites = data?.sites ?? {};
  const siteKeys = Object.keys(sites);
  const combined = data?.combined;
  const periodLabel = PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? period;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={() => fetchData(period)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Vernieuwen
          </button>
        </div>
        {lastFetched && (
          <span className="text-xs text-muted-foreground">
            Laatst opgehaald: {new Date(lastFetched).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {/* Error */}
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

      {/* Partial errors */}
      {data?.siteErrors && Object.keys(data.siteErrors).length > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-sm">Sommige sites konden niet worden opgehaald</p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {Object.entries(data.siteErrors).map(([key, msg]) => (
                  <li key={key}><span className="font-medium">{key}:</span> {msg}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-psv-red-primary" />
          <span className="ml-3 text-muted-foreground">Analytics data ophalen...</span>
        </div>
      )}

      {/* AI Insights */}
      {!loading && !error && siteKeys.length > 0 && (
        <WebInsightsPanel
          onAnalyze={fetchInsights}
          insights={insights}
          loading={insightsLoading}
          error={insightsError}
          hasData={siteKeys.length > 0}
          periodLabel={periodLabel}
        />
      )}

      {/* Combined KPIs */}
      {combined && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-heading uppercase tracking-wide">Sessies totaal</CardTitle>
              <Globe className="h-4 w-4 text-psv-red-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-heading uppercase">{formatNumber(combined.totals.sessions)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">over {siteKeys.length} websites</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-heading uppercase tracking-wide">Gebruikers totaal</CardTitle>
              <Users className="h-4 w-4 text-psv-red-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-heading uppercase">{formatNumber(combined.totals.users)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-heading uppercase tracking-wide">Pageviews totaal</CardTitle>
              <Eye className="h-4 w-4 text-psv-red-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-heading uppercase">{formatNumber(combined.totals.pageviews)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Site tabs */}
      {siteKeys.length > 0 && (
        <div>
          <div className="flex flex-wrap gap-1.5 mb-6">
            <button
              onClick={() => setActiveSite("combined")}
              className={`px-3 py-1.5 rounded-md text-xs font-heading uppercase tracking-wide transition-colors ${
                activeSite === "combined" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              Totaal
            </button>
            {siteKeys.map((key) => (
              <button
                key={key}
                onClick={() => setActiveSite(key)}
                className={`px-3 py-1.5 rounded-md text-xs font-heading uppercase tracking-wide transition-colors ${
                  activeSite === key ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-muted-foreground"
                }`}
              >
                {sites[key].label}
              </button>
            ))}
          </div>

          {activeSite === "combined" && combined ? (
            <Card>
              <CardHeader><CardTitle className="text-sm">Dagelijks verkeer — alle sites</CardTitle></CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={combined.dailyTrend.map((d) => ({ ...d, label: formatDateShort(d.date) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.2} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#999" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#999" />
                      <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: "6px", color: "#fff", fontSize: 12 }} />
                      <Line type="monotone" dataKey="sessions" name="Sessies" stroke="#e82026" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="users" name="Gebruikers" stroke="#bb9753" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-6 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-psv-red-primary" />Sessies</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-psv-gold" />Gebruikers</span>
                </div>
              </CardContent>
            </Card>
          ) : sites[activeSite] ? (
            <SiteDetail site={sites[activeSite]} />
          ) : null}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && siteKeys.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Globe className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-heading uppercase">Geen analytics data</p>
            <p className="text-sm text-muted-foreground mt-1">Controleer of de GA4 configuratie correct is ingesteld.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
