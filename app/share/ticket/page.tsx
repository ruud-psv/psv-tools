"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { TicketSalesChart } from "@/components/ticket-sales-chart";
import type { SnapshotPoint } from "@/lib/blob-snapshots";

interface ShareParams {
  kind: string;
  eventId: string;
  eventName: string;
  /** Ontbreekt in links die zijn gemaakt voordat de eventdatum werd meegegeven. */
  eventDate?: string;
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

function ShareTicketContent() {
  const urlParams = useSearchParams();
  const token = urlParams.get("token") ?? "";

  const [params, setParams] = useState<ShareParams | null>(null);
  const [history, setHistory] = useState<SnapshotPoint[] | null>(null);
  const [feedEventDate, setFeedEventDate] = useState<string | null>(null);
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
    if (!params?.eventName) return;
    document.title = `${params.eventName} — Ticketbeschikbaarheid | PSV`;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = "Bekijk de actuele ticketbeschikbaarheid en het verkoopverloop voor dit PSV-event.";
  }, [params?.eventName]);

  // Eén fetch voor zowel de KPI-tegel als de grafiek, zodat die niet uit elkaar lopen.
  useEffect(() => {
    const eventId = params?.eventId;
    if (!eventId) return;
    const load = () => {
      fetch(`/api/ticket-history?eventId=${encodeURIComponent(eventId)}`)
        .then((r) => r.json())
        .then((d) => {
          setHistory(d.history ?? []);
          setLastFetched(new Date());
        })
        .catch(() => {
          setHistory((prev) => prev ?? []);
          setLastFetched(new Date());
        });
    };
    load();
    const id = setInterval(load, 10 * 60_000);
    return () => clearInterval(id);
  }, [params?.eventId]);

  // Links van vóór deze wijziging bevatten geen eventDate; die halen we uit de
  // live feed zodat de dagen-tot-event ook daar zichtbaar zijn.
  useEffect(() => {
    const eventId = params?.eventId;
    if (!eventId || params?.eventDate) return;
    let cancelled = false;
    fetch("/api/ticket-feed")
      .then((r) => r.json())
      .then((d: { events?: { eventId: string; eventDate: string }[] }) => {
        const match = d.events?.find((e) => e.eventId === eventId);
        if (!cancelled && match?.eventDate) setFeedEventDate(match.eventDate);
      })
      .catch(() => {
        /* zonder eventdatum rendert de grafiek gewoon zonder dagen-tot-event */
      });
    return () => {
      cancelled = true;
    };
  }, [params?.eventId, params?.eventDate]);

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

  const latest = history && history.length > 0 ? history[history.length - 1] : null;
  const total = latest ? latest.sold + latest.available : 0;
  const pct = total > 0 && latest ? Math.round((latest.sold / total) * 100) : 0;
  const displayName = params?.eventName || "Event";
  const eventDate = params?.eventDate || feedEventDate || undefined;

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
        {!lastFetched ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            Laden…
          </div>
        ) : (
          <>
            {latest && (
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
                    <p className="text-xl font-heading">{latest.sold.toLocaleString("nl-NL")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-heading uppercase tracking-wide">Beschikbaar</p>
                    <p className="text-xl font-heading text-success">{latest.available.toLocaleString("nl-NL")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-heading uppercase tracking-wide">Totaal</p>
                    <p className="text-xl font-heading">{total.toLocaleString("nl-NL")}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-right">
                  Meting van {formatDateTime(latest.ts)}
                </p>
              </div>
            )}

            {/* Verkochte tickets per dag */}
            {params && history && (
              <div className="border border-border rounded-lg p-5">
                <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground mb-3">
                  Verkochte tickets per dag
                </p>
                <TicketSalesChart
                  eventId={params.eventId}
                  eventDate={eventDate}
                  history={history}
                />
              </div>
            )}

            {!latest && (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                Nog geen metingen beschikbaar voor dit event.
              </div>
            )}
          </>
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
