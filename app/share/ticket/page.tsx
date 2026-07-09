"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface TicketEvent {
  eventId: string;
  eventName: string;
  nameAndDate: string;
  eventDate: string;
  soldTickets: number;
  availableCapacity: number;
  totalCapacity: number;
  saleStatus: string;
  category: string;
}

interface HistoryPoint {
  ts: string;
  available: number;
  sold: number;
}

interface ShareParams {
  kind: string;
  eventId: string;
  eventName: string;
}

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("nl-NL", {
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

function progressColor(pct: number): string {
  if (pct >= 100) return "bg-destructive";
  if (pct >= 85) return "bg-warning";
  return "bg-success";
}

function AvailabilityChart({ eventId }: { eventId: string }) {
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/ticket-history?eventId=${encodeURIComponent(eventId)}`)
      .then((r) => r.json())
      .then((d) => setHistory(d.history ?? []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-28 text-xs text-muted-foreground">
        Verloop laden…
      </div>
    );
  }

  if (history.length < 2) {
    return (
      <div className="flex items-center justify-center h-28 text-xs text-muted-foreground">
        Nog geen historische data — metingen worden elk uur opgeslagen.
      </div>
    );
  }

  const formatted = history.map((p) => ({
    ...p,
    label: new Date(p.ts).toLocaleDateString("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  const tickInterval = Math.max(1, Math.floor(formatted.length / 6));

  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={formatted} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-share-${eventId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#e82026" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#e82026" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          interval={tickInterval}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
            fontSize: "11px",
            color: "hsl(var(--popover-foreground))",
          }}
          formatter={(value) => [Number(value).toLocaleString("nl-NL"), "Beschikbaar"]}
          labelFormatter={(label) => label}
        />
        <Area
          type="monotone"
          dataKey="available"
          stroke="#e82026"
          strokeWidth={1.5}
          fill={`url(#grad-share-${eventId})`}
          dot={false}
          activeDot={{ r: 3, fill: "#e82026" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ShareTicketContent() {
  const urlParams = useSearchParams();
  const token = urlParams.get("token") ?? "";

  const [params, setParams] = useState<ShareParams | null>(null);
  const [event, setEvent] = useState<TicketEvent | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  useEffect(() => {
    if (!token) {
      setTokenError("Ongeldige link");
      setTokenLoading(false);
      return;
    }
    fetch(`/api/share?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`Fout ${r.status}`)))
      .then((data: ShareParams) => {
        setParams(data);
        setTokenLoading(false);
      })
      .catch((err) => {
        setTokenError(String(err));
        setTokenLoading(false);
      });
  }, [token]);

  useEffect(() => {
    if (!params?.eventId) return;
    const load = () => {
      fetch("/api/ticket-feed", { cache: "no-store" })
        .then((r) => r.json())
        .then((data: { events: TicketEvent[] }) => {
          const found = data.events?.find((e) => e.eventId === params.eventId) ?? null;
          setEvent(found);
          setLastFetched(new Date());
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [params]);

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

  const pct = event
    ? event.totalCapacity > 0
      ? Math.round((event.soldTickets / event.totalCapacity) * 100)
      : 0
    : 0;

  const displayName = params?.eventName || event?.eventName || event?.nameAndDate || "Event";

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-sidebar border-b border-sidebar-border w-full">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img
              src="https://www.psv.nl/upload/23adcb48-abc3-487f-9158-6bc7822599a6_PSV_logo_color.svg"
              alt="PSV"
              className="h-9 w-9 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-xs font-heading uppercase tracking-wide text-sidebar-foreground/60">
                Ticket beschikbaarheid
              </p>
              <h1 className="text-lg font-heading uppercase text-sidebar-foreground leading-tight truncate">
                {displayName}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-sidebar-foreground/60 shrink-0">
            <RefreshCw className="h-3.5 w-3.5" />
            {lastFetched
              ? lastFetched.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })
              : "Laden…"}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {event ? (
          <>
            {/* Bezettingsgraad */}
            <div className="border border-border rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground">
                  Bezettingsgraad
                </p>
                <span className="text-2xl font-heading">{pct}%</span>
              </div>
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full transition-all ${progressColor(pct)}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div>
                  <p className="text-xs text-muted-foreground font-heading uppercase tracking-wide">Verkocht</p>
                  <p className="text-xl font-heading">{event.soldTickets.toLocaleString("nl-NL")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-heading uppercase tracking-wide">Beschikbaar</p>
                  <p className="text-xl font-heading text-success">{event.availableCapacity.toLocaleString("nl-NL")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-heading uppercase tracking-wide">Totaal</p>
                  <p className="text-xl font-heading">{event.totalCapacity.toLocaleString("nl-NL")}</p>
                </div>
              </div>
            </div>

            {/* Event info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="border border-border rounded-lg p-4">
                <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground mb-1">Evenementdatum</p>
                <p>{formatDateTime(event.eventDate)}</p>
              </div>
              <div className="border border-border rounded-lg p-4">
                <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground mb-1">Categorie</p>
                <p>{event.category}</p>
              </div>
            </div>

            {/* Beschikbaarheidsverloop */}
            <div className="border border-border rounded-lg p-5">
              <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground mb-3">
                Beschikbaarheidsverloop
              </p>
              <AvailabilityChart eventId={event.eventId} />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            {lastFetched ? "Event niet gevonden in de huidige feed." : "Eventdata laden…"}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground pt-4 border-t border-border">
          PSV
        </p>
      </div>
    </div>
  );
}

export default function ShareTicketPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen text-muted-foreground text-sm">
          Laden…
        </div>
      }
    >
      <ShareTicketContent />
    </Suspense>
  );
}
