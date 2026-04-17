"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Ticket,
  Mail,
  Eye,
  MousePointerClick,
  Users,
  ArrowRight,
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

interface TicketEvent {
  nameAndDate: string;
  eventId: string;
  eventDate: string;
  saleStatus: string;
  soldTickets: number;
  availableCapacity: number;
  totalCapacity: number;
  category: string;
  subCategory: string;
  matchGroup: string;
  eventName: string;
}

interface MailingSummary {
  id: number;
  name: string;
  scheduleTime: string;
  recipients: number;
  openRate: number;
  clickRate: number;
}

interface MaileonResponse {
  mailings: MailingSummary[];
  totals: {
    mailings: number;
    recipients: number;
    uniqueOpens: number;
    uniqueClicks: number;
    avgOpenRate: number;
    avgClickRate: number;
    avgCtor: number;
  };
}

/* ---------- Helpers ---------- */

function formatNumber(n: number): string {
  return n.toLocaleString("nl-NL");
}

function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
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

function occupancyPct(e: TicketEvent): number {
  if (e.totalCapacity <= 0) return 0;
  return Math.round((e.soldTickets / e.totalCapacity) * 100);
}

function occupancyColor(pct: number): string {
  if (pct >= 95) return "bg-psv-red-primary";
  if (pct >= 75) return "bg-amber-500";
  return "bg-emerald-500";
}

function statusBadge(pct: number) {
  if (pct >= 100)
    return <Badge variant="destructive" className="text-xs whitespace-nowrap">Uitverkocht</Badge>;
  if (pct >= 95)
    return <Badge variant="warning" className="text-xs whitespace-nowrap">Bijna vol</Badge>;
  return <Badge variant="success" className="text-xs whitespace-nowrap">Beschikbaar</Badge>;
}

/* ---------- Component ---------- */

export function DashboardOverview() {
  const [tickets, setTickets] = useState<TicketEvent[] | null>(null);
  const [maileon, setMaileon] = useState<MaileonResponse | null>(null);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [maileonLoading, setMaileonLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ticket-feed")
      .then((r) => r.json())
      .then((d) => setTickets(d.events ?? []))
      .catch(() => setTickets([]))
      .finally(() => setTicketsLoading(false));

    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    fetch(`/api/maileon?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => setMaileon(d))
      .catch(() => setMaileon(null))
      .finally(() => setMaileonLoading(false));
  }, []);

  const matches = useMemo(() => {
    if (!tickets) return [];
    const seen = new Set<string>();
    return tickets
      .filter((e) => {
        if (e.category !== "Wedstrijden") return false;
        if (!e.matchGroup || seen.has(e.matchGroup)) return false;
        const n = e.nameAndDate.toLowerCase();
        if (
          n.startsWith("package ") ||
          n.startsWith("fietsenstalling") ||
          n.startsWith("psv direct")
        )
          return false;
        seen.add(e.matchGroup);
        return true;
      })
      .sort(
        (a, b) =>
          new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
      );
  }, [tickets]);

  const chartData = useMemo(() => {
    if (!maileon?.mailings) return [];
    return [...maileon.mailings]
      .filter((m) => m.scheduleTime)
      .sort(
        (a, b) =>
          new Date(a.scheduleTime).getTime() -
          new Date(b.scheduleTime).getTime()
      )
      .slice(-10)
      .map((m) => ({
        date: formatDateShort(m.scheduleTime),
        name: m.name.replace(/^\d{4}\.\d{2}\.\d{2}\s*/, ""),
        openRate: parseFloat(m.openRate.toFixed(1)),
        clickRate: parseFloat(m.clickRate.toFixed(1)),
      }));
  }, [maileon]);

  return (
    <div className="space-y-8">
      {/* Ticket Inzichten */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-heading uppercase tracking-wide flex items-center gap-2">
            <Ticket className="h-5 w-5 text-psv-red-primary" />
            Aankomende wedstrijden
          </h2>
          <Link
            href="/dashboard/ticket-inzichten"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            Alle tickets
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {ticketsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-psv-red-primary" />
          </div>
        ) : matches.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Geen aankomende wedstrijden gevonden.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {matches.slice(0, 6).map((m) => {
              const pct = occupancyPct(m);
              return (
                <Card key={m.eventId}>
                  <CardContent className="pt-5 pb-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {m.eventName || m.nameAndDate}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(m.eventDate).toLocaleDateString("nl-NL", {
                            weekday: "short",
                            day: "numeric",
                            month: "long",
                          })}
                        </p>
                      </div>
                      {statusBadge(pct)}
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>
                          {formatNumber(m.soldTickets)} verkocht
                        </span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${occupancyColor(pct)}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* DM Performance */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-heading uppercase tracking-wide flex items-center gap-2">
            <Mail className="h-5 w-5 text-psv-red-primary" />
            DM Performance
          </h2>
          <Link
            href="/dashboard/dm-performance"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            Alle mailings
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {maileonLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-psv-red-primary" />
          </div>
        ) : !maileon?.totals ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Geen mailing data beschikbaar.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-heading uppercase tracking-wide">
                    Mailings (30d)
                  </CardTitle>
                  <Mail className="h-4 w-4 text-psv-red-primary" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-heading uppercase">
                    {formatNumber(maileon.totals.mailings)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatNumber(maileon.totals.recipients)} ontvangers
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-heading uppercase tracking-wide">
                    Gem. Open Rate
                  </CardTitle>
                  <Eye className="h-4 w-4 text-psv-red-primary" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-heading uppercase">
                    {formatPct(maileon.totals.avgOpenRate)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatNumber(maileon.totals.uniqueOpens)} unieke opens
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-heading uppercase tracking-wide">
                    Gem. Click Rate
                  </CardTitle>
                  <MousePointerClick className="h-4 w-4 text-psv-red-primary" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-heading uppercase">
                    {formatPct(maileon.totals.avgClickRate)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatNumber(maileon.totals.uniqueClicks)} unieke clicks
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-heading uppercase tracking-wide">
                    Gem. CTOR
                  </CardTitle>
                  <Users className="h-4 w-4 text-psv-red-primary" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-heading uppercase">
                    {formatPct(maileon.totals.avgCtor)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Click-to-open rate
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Chart */}
            {chartData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    Open & Click Rate — laatste 10 mailings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} barGap={2}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#333"
                          opacity={0.2}
                        />
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
                          labelFormatter={(_label, payload) => {
                            const item = (payload as unknown as { payload?: { name?: string } }[])?.[0]
                              ?.payload;
                            return item?.name ?? String(_label);
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
            )}
          </div>
        )}
      </section>
    </div>
  );
}
