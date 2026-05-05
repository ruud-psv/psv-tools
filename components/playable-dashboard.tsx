"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
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
  LayoutTemplate,
  Activity,
  RefreshCw,
  Search,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  CheckCircle2,
  Send,
  Monitor,
  Tablet,
  Smartphone,
  ExternalLink,
  X,
  MousePointerClick,
  Users,
  TrendingUp,
  Calendar,
} from "lucide-react";
import type { Campaign, PlayableTotals } from "@/lib/playable-analysis";
import type { CampaignStatistics } from "@/app/api/playable/[id]/route";
import type { PlayableInsightResult } from "@/lib/insights/playable";

/* ---------- Types ---------- */

interface ApiResponse {
  campaigns: Campaign[];
  totals: PlayableTotals;
  fetchedAt: string;
}

type SortKey = "name" | "type" | "active_from" | "created_on";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "active" | "inactive";

/* ---------- Helpers ---------- */

function formatNumber(n: number): string {
  return n.toLocaleString("nl-NL");
}

function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function formatDate(iso: string | null): string {
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

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
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
        <CardTitle className="text-sm font-heading uppercase tracking-wide">{title}</CardTitle>
        <Icon className={`h-5 w-5 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-heading uppercase">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

/* ---------- Stat block ---------- */

function StatBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground font-heading uppercase tracking-wide">{label}</p>
      <p className="text-lg font-heading uppercase">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/* ---------- Campaign Detail Panel ---------- */

function CampaignDetailPanel({
  campaign,
  onClose,
}: {
  campaign: Campaign;
  onClose: () => void;
}) {
  const [stats, setStats] = useState<CampaignStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setStats(null);

    fetch(`/api/playable/${campaign.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setStats(data.data);
      })
      .catch((err) => setError(err.message ?? "Ophalen mislukt"))
      .finally(() => setLoading(false));
  }, [campaign.id]);

  const devicesTotal = stats
    ? stats.devices.desktop + stats.devices.tablet + stats.devices.mobile
    : 0;

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="min-w-0 flex-1">
          <CardTitle className="text-lg">{campaign.name}</CardTitle>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="secondary">{campaign.type || "—"}</Badge>
            <Badge variant={campaign.active ? "success" : "secondary"}>
              {campaign.active ? "Actief" : "Inactief"}
            </Badge>
            {campaign.active_from && (
              <span className="text-xs text-muted-foreground">
                {formatDate(campaign.active_from)}
                {campaign.active_to ? ` – ${formatDate(campaign.active_to)}` : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {campaign.live_url && (
            <a
              href={campaign.live_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm bg-psv-red-primary text-white hover:bg-psv-red-secondary transition-colors font-heading uppercase tracking-wide"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Bekijk pagina
            </a>
          )}
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm font-heading uppercase tracking-wide"
          >
            Sluiten
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Statistieken laden...
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatBlock label="Sessies" value={formatNumber(stats.sessions)} />
              <StatBlock
                label="Registraties"
                value={formatNumber(stats.registrations)}
                sub={`${stats.unique_registration} uniek`}
              />
              <StatBlock label="Conversie" value={formatPct(stats.conversion)} />
              <StatBlock
                label="Gem. tijd op pagina"
                value={formatDuration(stats.engagement.time_spent_average)}
              />
            </div>

            {devicesTotal > 0 && (
              <div>
                <p className="text-xs text-muted-foreground font-heading uppercase tracking-wide mb-3">
                  Apparaten
                </p>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Desktop", icon: Monitor, count: stats.devices.desktop },
                    { label: "Tablet", icon: Tablet, count: stats.devices.tablet },
                    { label: "Mobiel", icon: Smartphone, count: stats.devices.mobile },
                  ].map(({ label, icon: Icon, count }) => {
                    const pct = devicesTotal > 0 ? (count / devicesTotal) * 100 : 0;
                    return (
                      <div key={label} className="flex items-center gap-3">
                        <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="text-sm font-heading uppercase">{formatNumber(count)}</p>
                          <p className="text-xs text-muted-foreground">
                            {label} · {formatPct(pct)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {stats.facebook.shares > 0 && (
                <StatBlock
                  label="Facebook shares"
                  value={formatNumber(stats.facebook.shares)}
                  sub={`${formatNumber(stats.facebook.sessions_from_shares)} sessies via shares`}
                />
              )}
              {stats.tip_a_friend > 0 && (
                <StatBlock label="Tip a Friend" value={formatNumber(stats.tip_a_friend)} />
              )}
              <StatBlock
                label="Totale tijd"
                value={formatDuration(stats.engagement.total_time_spent)}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Campaign Table ---------- */

function CampaignTable({
  campaigns,
  onSelect,
}: {
  campaigns: Campaign[];
  onSelect: (c: Campaign) => void;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_on");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(() => {
    let list = campaigns;

    if (statusFilter === "active") list = list.filter((c) => c.active);
    if (statusFilter === "inactive") list = list.filter((c) => !c.active);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q));
    }

    return [...list].sort((a, b) => {
      const aVal = String(a[sortKey] ?? "");
      const bVal = String(b[sortKey] ?? "");
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }, [campaigns, search, sortKey, sortDir, statusFilter]);

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const Th = ({ label, column, className = "" }: { label: string; column: SortKey; className?: string }) => (
    <th
      className={`px-4 py-3 text-left text-xs font-heading uppercase tracking-wide text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors ${className}`}
      onClick={() => toggleSort(column)}
    >
      <span className="flex items-center gap-1">
        {label}
        <SortIcon column={column} />
      </span>
    </th>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <CardTitle className="text-base">Campagnes ({filtered.length})</CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle statussen</SelectItem>
              <SelectItem value="active">Actief</SelectItem>
              <SelectItem value="inactive">Inactief</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Zoek op naam of type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="inline-flex items-center rounded-md px-2 py-2 text-sm border hover:bg-muted transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr>
                <Th label="Naam" column="name" className="min-w-[200px]" />
                <Th label="Type" column="type" />
                <th className="px-4 py-3 text-left text-xs font-heading uppercase tracking-wide text-muted-foreground">
                  Status
                </th>
                <Th label="Actief vanaf" column="active_from" />
                <Th label="Aangemaakt" column="created_on" />
                <th className="px-4 py-3 text-left text-xs font-heading uppercase tracking-wide text-muted-foreground">
                  Actief t/m
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Geen campagnes gevonden
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border hover:bg-muted/40 cursor-pointer transition-colors"
                  onClick={() => onSelect(c)}
                >
                  <td className="px-4 py-3 font-medium max-w-[280px]">
                    <span className="truncate block">{c.name}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{c.type || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={c.active ? "success" : "secondary"} className="text-xs">
                      {c.active ? "Actief" : "Inactief"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {formatDate(c.active_from)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {formatDate(c.created_on)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {formatDate(c.active_to)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- AI Insights Panel ---------- */

interface Message {
  role: "user" | "assistant";
  content: string;
}

function InsightsPanel({
  campaigns,
  totals,
}: {
  campaigns: Campaign[];
  totals: PlayableTotals;
}) {
  const [insights, setInsights] = useState<PlayableInsightResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const handleAnalyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    setInsights(null);
    setMessages([]);

    try {
      const res = await fetch("/api/playable-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaigns, totals }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Analyse mislukt");
      setInsights(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analyse mislukt");
    } finally {
      setLoading(false);
    }
  }, [campaigns, totals]);

  const handleQuestion = useCallback(async () => {
    if (!question.trim() || chatLoading) return;
    const userMsg: Message = { role: "user", content: question.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setQuestion("");
    setChatLoading(true);

    try {
      const res = await fetch("/api/playable-insights/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, campaigns, totals }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Vraag mislukt");
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Er is een fout opgetreden: ${err instanceof Error ? err.message : "onbekend"}`,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [question, chatLoading, messages, campaigns, totals]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const highlightColors: Record<string, string> = {
    trend: "bg-info/10 border-info/30 text-info",
    achievement: "bg-success/10 border-success/30 text-success",
    warning: "bg-warning/10 border-warning/30 text-warning",
    anomaly: "bg-psv-red-primary/10 border-psv-red-primary/30 text-psv-red-primary",
  };

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-psv-red-primary" />
          <CardTitle className="text-base">AI Inzichten</CardTitle>
        </div>
        {!insights && !loading && (
          <button
            onClick={handleAnalyze}
            disabled={campaigns.length === 0}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm bg-psv-red-primary text-white hover:bg-psv-red-secondary transition-colors disabled:opacity-50 font-heading uppercase tracking-wide"
          >
            <Sparkles className="h-4 w-4" />
            Analyseer campagnes
          </button>
        )}
        {insights && !loading && (
          <button
            onClick={handleAnalyze}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs border hover:bg-muted transition-colors font-heading uppercase tracking-wide"
          >
            <RefreshCw className="h-3 w-3" />
            Opnieuw
          </button>
        )}
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center gap-3 text-muted-foreground py-6 justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-psv-red-primary" />
            <span className="text-sm">Campagnes analyseren...</span>
          </div>
        )}
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {!insights && !loading && !error && (
          <p className="text-sm text-muted-foreground">
            Klik op &ldquo;Analyseer campagnes&rdquo; om AI-inzichten te genereren over je Playable
            landingspagina&apos;s.
          </p>
        )}
        {insights && (
          <div className="space-y-6">
            <p className="text-sm leading-relaxed">{insights.summary}</p>

            {insights.highlights?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground">
                  Highlights
                </p>
                {insights.highlights.map((h, i) => (
                  <div
                    key={i}
                    className={`rounded-md border px-3 py-2 text-xs ${highlightColors[h.type] ?? highlightColors.trend}`}
                  >
                    {h.text}
                  </div>
                ))}
              </div>
            )}

            {(insights.topPerformer || insights.bottomPerformer) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {insights.topPerformer && (
                  <div className="rounded-md border border-success/30 bg-success/5 px-4 py-3 space-y-1">
                    <p className="text-xs font-heading uppercase tracking-wide text-success">
                      Beste campagne
                    </p>
                    <p className="text-sm font-semibold">{insights.topPerformer.name}</p>
                    <p className="text-xs text-muted-foreground">{insights.topPerformer.metric}</p>
                    <p className="text-xs">{insights.topPerformer.why}</p>
                  </div>
                )}
                {insights.bottomPerformer && (
                  <div className="rounded-md border border-warning/30 bg-warning/5 px-4 py-3 space-y-1">
                    <p className="text-xs font-heading uppercase tracking-wide text-warning">
                      Aandachtspunt
                    </p>
                    <p className="text-sm font-semibold">{insights.bottomPerformer.name}</p>
                    <p className="text-xs text-muted-foreground">{insights.bottomPerformer.metric}</p>
                    <p className="text-xs">{insights.bottomPerformer.suggestion}</p>
                  </div>
                )}
              </div>
            )}

            {insights.recommendations?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground">
                  Aanbevelingen
                </p>
                <ul className="space-y-2">
                  {insights.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-psv-red-primary mt-0.5 flex-shrink-0" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground">
                Stel een vervolgvraag
              </p>
              {messages.length > 0 && (
                <div ref={chatRef} className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
                    >
                      <div
                        className={`rounded-lg px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap ${
                          m.role === "user"
                            ? "bg-psv-red-primary text-white"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="rounded-lg px-3 py-2 text-sm bg-muted text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Antwoord formuleren...
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="Bijv: welke campagnes lopen er nog actief?"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleQuestion();
                    }
                  }}
                  disabled={chatLoading}
                  className="flex-1"
                />
                <button
                  onClick={handleQuestion}
                  disabled={!question.trim() || chatLoading}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm bg-psv-red-primary text-white hover:bg-psv-red-secondary transition-colors disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Main Dashboard ---------- */

export function PlayableDashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/playable");
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Ophalen mislukt");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ophalen mislukt");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-psv-red-primary" />
        <span>Campagnes ophalen uit Playable...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6">
        <p className="text-sm text-destructive font-medium mb-1">Fout bij ophalen</p>
        <p className="text-xs text-destructive/80 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-psv-red-primary text-white hover:bg-psv-red-secondary transition-colors font-heading uppercase tracking-wide"
        >
          <RefreshCw className="h-4 w-4" />
          Opnieuw proberen
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { campaigns, totals } = data;
  const activeCampaigns = campaigns.filter((c) => c.active);
  const recentCampaigns = [...campaigns]
    .sort((a, b) => b.created_on.localeCompare(a.created_on))
    .slice(0, 1)[0];

  return (
    <div>
      {/* Refresh */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="h-3.5 w-3.5" />
          {data.fetchedAt && (
            <span>Bijgewerkt: {new Date(data.fetchedAt).toLocaleTimeString("nl-NL")}</span>
          )}
        </div>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs border hover:bg-muted transition-colors font-heading uppercase tracking-wide"
        >
          <RefreshCw className="h-3 w-3" />
          Vernieuwen
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <KpiCard
          title="Campagnes"
          value={String(totals.total)}
          subtitle="Totaal in Playable"
          icon={LayoutTemplate}
        />
        <KpiCard
          title="Actief"
          value={String(totals.active)}
          subtitle={`${totals.inactive} inactief`}
          icon={Activity}
          color="text-success"
        />
        <KpiCard
          title="Meest recent"
          value={recentCampaigns ? formatDate(recentCampaigns.created_on) : "—"}
          subtitle={recentCampaigns?.name ?? ""}
          icon={Calendar}
          color="text-muted-foreground"
        />
      </div>

      {/* Active campaigns quick-list */}
      {activeCampaigns.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-success" />
              Actieve campagnes ({activeCampaigns.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeCampaigns.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCampaign(c)}
                  className="text-left rounded-md border border-border p-3 hover:bg-muted/40 transition-colors"
                >
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{c.type || "—"}</span>
                    {c.active_to && (
                      <span className="text-xs text-muted-foreground">· t/m {formatDate(c.active_to)}</span>
                    )}
                  </div>
                  {c.live_url && (
                    <p className="text-xs text-psv-red-primary mt-1 truncate">{c.live_url}</p>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Selected campaign detail */}
      {selectedCampaign && (
        <CampaignDetailPanel
          campaign={selectedCampaign}
          onClose={() => setSelectedCampaign(null)}
        />
      )}

      {/* Full table */}
      <CampaignTable campaigns={campaigns} onSelect={setSelectedCampaign} />

      {/* AI Insights */}
      <InsightsPanel campaigns={campaigns} totals={totals} />
    </div>
  );
}
