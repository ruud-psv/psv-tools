"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Ticket,
  TrendingUp,
  AlertCircle,
  Calendar,
  Search,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ArrowUpDown,
} from "lucide-react";

interface TicketEvent {
  nameAndDate: string;
  showId: string;
  eventId: string;
  eventDate: string;
  saleStatus: string;
  soldTickets: number;
  availableCapacity: number;
  totalCapacity: number;
  startSaleFrom: string;
  endSaleAt: string;
  lastUpdate: string;
  availableForDisplay: boolean;
  category: string;
  eventName: string;
}

interface FeedData {
  events: TicketEvent[];
  count: number;
  fetchedAt: string;
}

const CATEGORIES = ["Alle", "Wedstrijden", "Tours", "Museum", "Jeugd", "Evenementen", "Abonnementen", "Overig"];
const POLL_INTERVAL = 30_000;

type SortKey = "eventDate" | "availableCapacity" | "soldTickets" | "occupancy";
type SortDir = "asc" | "desc";

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function occupancyPct(event: TicketEvent): number {
  if (event.totalCapacity === 0) return 0;
  return Math.round((event.soldTickets / event.totalCapacity) * 100);
}

function availabilityColor(event: TicketEvent): string {
  if (event.availableCapacity === 0) return "text-destructive";
  const pct = occupancyPct(event);
  if (pct >= 85) return "text-warning";
  return "text-success";
}

function availabilityBadge(event: TicketEvent) {
  if (event.availableCapacity === 0)
    return <Badge variant="destructive" className="text-xs whitespace-nowrap">Uitverkocht</Badge>;
  const pct = occupancyPct(event);
  if (pct >= 85)
    return <Badge variant="warning" className="text-xs whitespace-nowrap">Bijna vol</Badge>;
  return <Badge variant="success" className="text-xs whitespace-nowrap">Beschikbaar</Badge>;
}

function progressColor(pct: number): string {
  if (pct >= 100) return "bg-destructive";
  if (pct >= 85) return "bg-warning";
  return "bg-success";
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground mb-1">
              {label}
            </p>
            <p className="text-3xl font-heading uppercase text-foreground">
              {typeof value === "number" ? value.toLocaleString("nl-NL") : value}
            </p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="flex-shrink-0 mt-0.5 w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EventDetailPanel({
  event,
  allEvents,
}: {
  event: TicketEvent;
  allEvents: TicketEvent[];
}) {
  const pct = occupancyPct(event);
  const related = allEvents.filter(
    (e) => e.showId === event.showId && e.eventId !== event.eventId
  );

  return (
    <div className="bg-muted/40 border border-border rounded-md p-4 mt-1 space-y-4">
      {/* Bezetting */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Bezettingsgraad</span>
          <span className="text-sm font-heading text-foreground">{pct}%</span>
        </div>
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full transition-all ${progressColor(pct)}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
          <span>{event.soldTickets.toLocaleString("nl-NL")} verkocht</span>
          <span>{event.availableCapacity.toLocaleString("nl-NL")} beschikbaar</span>
          <span>{event.totalCapacity.toLocaleString("nl-NL")} totaal</span>
        </div>
      </div>

      {/* Tijden */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground mb-0.5">Evenementdatum</p>
          <p className="text-foreground">{formatDateTime(event.eventDate)}</p>
        </div>
        <div>
          <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground mb-0.5">Verkoop start</p>
          <p className="text-foreground">{formatDateTime(event.startSaleFrom)}</p>
        </div>
        <div>
          <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground mb-0.5">Verkoop sluit</p>
          <p className="text-foreground">{event.endSaleAt ? formatDateTime(event.endSaleAt) : "—"}</p>
        </div>
        <div>
          <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground mb-0.5">Laatste update</p>
          <p className="text-foreground">{formatDateTime(event.lastUpdate)}</p>
        </div>
      </div>

      {/* Gerelateerde events */}
      {related.length > 0 && (
        <div>
          <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground mb-2">
            Overige sessies ({related.length})
          </p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {related
              .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
              .map((r) => (
                <div
                  key={r.eventId}
                  className="flex items-center justify-between text-xs bg-background border border-border rounded px-2.5 py-1.5"
                >
                  <span className="text-foreground">{formatDateTime(r.eventDate)}</span>
                  <div className="flex items-center gap-2">
                    <span className={availabilityColor(r)}>
                      {r.availableCapacity.toLocaleString("nl-NL")} vrij
                    </span>
                    {availabilityBadge(r)}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EventsTable({
  events,
  allEvents,
}: {
  events: TicketEvent[];
  allEvents: TicketEvent[];
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("eventDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return events.filter(
      (e) =>
        e.nameAndDate.toLowerCase().includes(q) ||
        e.eventName.toLowerCase().includes(q)
    );
  }, [events, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "eventDate") cmp = a.eventDate.localeCompare(b.eventDate);
      else if (sortKey === "availableCapacity") cmp = a.availableCapacity - b.availableCapacity;
      else if (sortKey === "soldTickets") cmp = a.soldTickets - b.soldTickets;
      else if (sortKey === "occupancy") cmp = occupancyPct(a) - occupancyPct(b);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => toggleSort(k)}
      className="flex items-center gap-1 hover:text-foreground transition-colors group"
    >
      {label}
      <ArrowUpDown
        className={`h-3 w-3 transition-colors ${
          sortKey === k ? "text-primary" : "text-muted-foreground/50 group-hover:text-muted-foreground"
        }`}
      />
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Zoek op evenement..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Geen events gevonden{search ? ` voor "${search}"` : ""}.
        </div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          {/* Tabel header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-x-4 px-4 py-2.5 bg-muted/50 border-b border-border text-xs font-heading uppercase tracking-wide text-muted-foreground">
            <span>Evenement</span>
            <SortBtn k="eventDate" label="Datum" />
            <SortBtn k="soldTickets" label="Verkocht" />
            <SortBtn k="availableCapacity" label="Beschikbaar" />
            <SortBtn k="occupancy" label="Bezetting" />
            <span>Status</span>
          </div>

          {/* Rijen */}
          <div className="divide-y divide-border">
            {sorted.map((event) => {
              const pct = occupancyPct(event);
              const isExpanded = expandedId === event.eventId;

              return (
                <div key={event.eventId}>
                  <button
                    className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-x-4 px-4 py-3 w-full text-left hover:bg-muted/30 transition-colors items-center"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : event.eventId)
                    }
                  >
                    {/* Naam */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate leading-tight">
                        {event.eventName || event.nameAndDate}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {event.category}
                      </p>
                    </div>

                    {/* Datum */}
                    <span className="text-xs text-muted-foreground whitespace-nowrap text-right">
                      {formatDate(event.eventDate)}
                    </span>

                    {/* Verkocht */}
                    <span className="text-sm text-right whitespace-nowrap">
                      {event.soldTickets.toLocaleString("nl-NL")}
                    </span>

                    {/* Beschikbaar */}
                    <span
                      className={`text-sm font-medium text-right whitespace-nowrap ${availabilityColor(event)}`}
                    >
                      {event.availableCapacity.toLocaleString("nl-NL")}
                    </span>

                    {/* Bezetting progress */}
                    <div className="flex items-center gap-2 w-28">
                      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${progressColor(pct)}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-8 text-right shrink-0">
                        {pct}%
                      </span>
                    </div>

                    {/* Status + expand */}
                    <div className="flex items-center gap-2">
                      {availabilityBadge(event)}
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-3">
                      <EventDetailPanel event={event} allEvents={allEvents} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-right">
        {sorted.length} van {events.length} events
      </p>
    </div>
  );
}

function CategoryOverview({ events }: { events: TicketEvent[] }) {
  const stats = useMemo(() => {
    const cats: Record<
      string,
      { total: number; available: number; sold: number; count: number; soldOut: number }
    > = {};
    for (const e of events) {
      const c = e.category;
      if (!cats[c]) cats[c] = { total: 0, available: 0, sold: 0, count: 0, soldOut: 0 };
      cats[c].count++;
      cats[c].total += e.totalCapacity;
      cats[c].available += e.availableCapacity;
      cats[c].sold += e.soldTickets;
      if (e.availableCapacity === 0) cats[c].soldOut++;
    }
    return Object.entries(cats)
      .map(([cat, s]) => ({ cat, ...s, pct: s.total > 0 ? Math.round((s.sold / s.total) * 100) : 0 }))
      .sort((a, b) => b.sold - a.sold);
  }, [events]);

  return (
    <div className="space-y-3">
      {stats.map(({ cat, count, available, sold, total, pct, soldOut }) => (
        <div key={cat} className="border border-border rounded-md p-3.5">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <p className="text-sm font-medium">{cat}</p>
              <p className="text-xs text-muted-foreground">{count} events</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-heading">
                <span className="text-success">{available.toLocaleString("nl-NL")}</span>{" "}
                <span className="text-muted-foreground text-xs">vrij</span>
              </p>
              {soldOut > 0 && (
                <p className="text-xs text-destructive">{soldOut} uitverkocht</p>
              )}
            </div>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all ${progressColor(pct)}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
            <span>{sold.toLocaleString("nl-NL")} verkocht</span>
            <span>{pct}% bezet</span>
            <span>{total.toLocaleString("nl-NL")} totaal</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TicketInzichtenDashboard() {
  const [data, setData] = useState<FeedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState("Alle");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/ticket-feed", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json: FeedData = await res.json();
      setData(json);
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  const events = data?.events ?? [];

  // KPI's
  const kpis = useMemo(() => {
    const totalAvailable = events.reduce((s, e) => s + e.availableCapacity, 0);
    const totalSold = events.reduce((s, e) => s + e.soldTickets, 0);
    const soldOut = events.filter((e) => e.availableCapacity === 0).length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 7);
    const thisWeek = events.filter((e) => {
      try {
        const d = new Date(e.eventDate);
        return d >= today && d <= tomorrow;
      } catch {
        return false;
      }
    }).length;
    return { totalAvailable, totalSold, soldOut, thisWeek };
  }, [events]);

  // Gefilterde events per tab
  const tabEvents = useMemo(() => {
    if (activeTab === "Alle") return events;
    return events.filter((e) => e.category === activeTab);
  }, [events, activeTab]);

  // Categorie counts voor tab labels
  const catCounts = useMemo(() => {
    const m: Record<string, number> = { Alle: events.length };
    for (const e of events) {
      m[e.category] = (m[e.category] ?? 0) + 1;
    }
    return m;
  }, [events]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="h-4 w-24 bg-muted rounded animate-pulse mb-2" />
                <div className="h-8 w-16 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="h-96 bg-muted rounded-md animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-destructive/50 bg-destructive/5 rounded-md p-6 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-destructive text-sm">Feed niet bereikbaar</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
          <button
            onClick={fetchData}
            className="mt-3 text-xs font-heading uppercase tracking-wide text-primary hover:underline"
          >
            Opnieuw proberen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI kaarten */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          icon={Ticket}
          label="Beschikbare tickets"
          value={kpis.totalAvailable}
          sub="over alle events"
        />
        <KpiCard
          icon={TrendingUp}
          label="Verkochte tickets"
          value={kpis.totalSold}
          sub="over alle events"
        />
        <KpiCard
          icon={AlertCircle}
          label="Uitverkochte events"
          value={kpis.soldOut}
          sub={`van ${events.length} events`}
        />
        <KpiCard
          icon={Calendar}
          label="Events deze week"
          value={kpis.thisWeek}
          sub="komende 7 dagen"
        />
      </div>

      {/* Hoofdpanel: tabs + content */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6">
        {/* Events tabel */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg">Events</CardTitle>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <RefreshCw className="h-3 w-3" />
                {lastRefresh
                  ? `${lastRefresh.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                  : "—"}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1 mb-4 justify-start">
                {CATEGORIES.map((cat) => (
                  <TabsTrigger
                    key={cat}
                    value={cat}
                    className="text-xs h-7 px-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    {cat}
                    {catCounts[cat] != null && (
                      <span className="ml-1.5 opacity-60">{catCounts[cat]}</span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
              {CATEGORIES.map((cat) => (
                <TabsContent key={cat} value={cat} className="mt-0">
                  <EventsTable events={tabEvents} allEvents={events} />
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        {/* Categorie overzicht sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Per categorie</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <CategoryOverview events={events} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
