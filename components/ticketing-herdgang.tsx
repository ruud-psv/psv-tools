"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HerdgangMap } from "@/components/herdgang-map";
import { isHerdgangMatch } from "@/lib/ticketing-herdgang/events";
import type { AreaOccupancy, Occupancy } from "@/lib/ticketing-herdgang/occupancy";

interface EventEntry {
  eventId: string;
  name: string | null;
  eventDate: string | null;
}

interface Overview {
  ingest: {
    manifestsComplete: boolean;
    salesComplete: boolean;
    capacityComplete: boolean;
    caughtUpAt: string | null;
    running: boolean;
    lastError: string | null;
  };
  events: EventEntry[];
}

interface OccupancyResponse {
  event: EventEntry;
  areas: AreaOccupancy[];
  total: Occupancy;
  ticketsWithoutManifest: number;
  capacityComplete: boolean;
  dataAsOf: string | null;
  catchUp: "bijgewerkt" | "overgeslagen" | "mislukt";
}

const number = new Intl.NumberFormat("nl-NL");
const percent = new Intl.NumberFormat("nl-NL", { style: "percent", maximumFractionDigits: 0 });

function share(part: number, whole: number): string {
  return whole > 0 ? percent.format(part / whole) : "–";
}

function formatDateTime(value: string | null): string {
  if (!value) return "onbekend";
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatEventDate(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value.replace(" ", "T"));
  if (isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-heading">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Balk: verkocht in rood, daarvan in de resale in goud, de rest van de capaciteit grijs. */
function OccupancyBar({ row }: { row: Occupancy }) {
  const width = (value: number) => `${row.capacity > 0 ? Math.min((value / row.capacity) * 100, 100) : 0}%`;
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="bg-psv-red-primary" style={{ width: width(row.sold - row.resale) }} />
      <div className="bg-psv-gold" style={{ width: width(row.resale) }} />
    </div>
  );
}

export function TicketingHerdgang() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [eventId, setEventId] = useState("");
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultError, setResultError] = useState<string | null>(null);
  const [result, setResult] = useState<OccupancyResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ticketing-herdgang", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      setOverview(data);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Standaard alleen thuiswedstrijden van Jong PSV en PSV Vrouwen.
  const visibleEvents = useMemo(
    () => (overview?.events ?? []).filter((event) => showAllEvents || isHerdgangMatch(event.name)),
    [overview, showAllEvents]
  );

  useEffect(() => {
    if (!visibleEvents.some((event) => event.eventId === eventId)) {
      setEventId(visibleEvents[0]?.eventId ?? "");
      setResult(null);
    }
  }, [visibleEvents, eventId]);

  const ingest = overview?.ingest;
  const ready = Boolean(ingest?.manifestsComplete && ingest?.salesComplete);

  async function showOccupancy() {
    setBusy(true);
    setResultError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ticketing-herdgang/bezetting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      setResult(data);
    } catch (caught) {
      setResultError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Laden…
      </div>
    );
  }

  if (error || !overview) {
    return (
      <Card>
        <CardContent className="p-6 flex items-start gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-primary" />
          <span>Het overzicht kon niet worden geladen: {error}</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6 space-y-5">
          <div>
            <h2 className="text-xl">Bezetting per wedstrijd</h2>
            <p className="text-sm text-muted-foreground max-w-3xl">
              Kies een wedstrijd. De tool haalt eerst de nieuwste stand uit Ringside op en telt daarna per vak de
              capaciteit, de verkochte tickets en wat er nog vrij is.
            </p>
          </div>

          {!ready ? (
            <p className="text-sm text-muted-foreground">
              De stoelstatus wordt nog voor het eerst ingelezen. Zodra dat klaar is, zie je hier de bezetting.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1.5 min-w-[18rem] flex-1 max-w-xl">
                  <label htmlFor="wedstrijd" className="text-xs font-heading uppercase tracking-wide text-muted-foreground">
                    Wedstrijd
                  </label>
                  <select
                    id="wedstrijd"
                    value={eventId}
                    onChange={(e) => {
                      setEventId(e.target.value);
                      setResult(null);
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {visibleEvents.length === 0 && <option value="">Geen wedstrijden op De Herdgang gevonden</option>}
                    {visibleEvents.map((event) => (
                      <option key={event.eventId} value={event.eventId}>
                        {event.name ?? "Onbekende wedstrijd"} · {formatEventDate(event.eventDate)}
                      </option>
                    ))}
                  </select>
                </div>
                <Button onClick={showOccupancy} disabled={busy || !eventId}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                  Toon bezetting
                </Button>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showAllEvents}
                  onChange={(e) => setShowAllEvents(e.target.checked)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                Toon alle evenementen, niet alleen thuiswedstrijden van Jong PSV en PSV Vrouwen
              </label>
            </div>
          )}

          {resultError && (
            <p className="flex items-start gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-primary" />
              {resultError}
            </p>
          )}

          {result && (
            <div className="space-y-5 border-t border-border pt-5">
              {!result.capacityComplete && (
                <div className="alert alert--warning text-sm">
                  De capaciteit van de staanvakken wordt nog ingelezen. Tot dat klaar is, kan een staanvak met
                  capaciteit 1 verschijnen en kloppen vrij en bezetting niet.
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <Stat label="Capaciteit" value={number.format(result.total.capacity)} hint={`${number.format(result.total.sellable)} te koop`} />
                <Stat label="Verkocht" value={number.format(result.total.sold)} hint="incl. reserveringen" />
                <Stat label="Bezetting" value={share(result.total.sold, result.total.capacity)} hint="verkocht van capaciteit" />
                <Stat label="Vrij" value={number.format(result.total.free)} hint="nog te koop" />
                <Stat label="In de resale" value={number.format(result.total.resale)} hint="aangeboden door de houder" />
              </div>

              <HerdgangMap areas={result.areas} />

              <details className="text-sm">
                <summary className="cursor-pointer text-xs font-heading uppercase tracking-wide text-muted-foreground">
                  Als tabel
                </summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        {["Vak", "Capaciteit", "Verkocht", "In de resale", "Vrij", "Bezetting", ""].map((label, i) => (
                          <th
                            key={i}
                            className={`py-2 pr-4 text-xs font-heading uppercase tracking-wide text-muted-foreground ${i > 0 && i < 6 ? "text-right" : ""}`}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.areas.map((row) => (
                        <tr key={row.area} className="border-b border-border last:border-0">
                          <td className="py-2 pr-4 font-medium">
                            {row.area}
                            {!row.standing && <span className="ml-2 text-xs text-muted-foreground">genummerd</span>}
                            {row.sellable === 0 && row.capacity > 0 && (
                              <span className="ml-2 text-xs text-muted-foreground">niet te koop</span>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">{number.format(row.capacity)}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{number.format(row.sold)}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{number.format(row.resale)}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{number.format(row.free)}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{share(row.sold, row.capacity)}</td>
                          <td className="py-2 w-40 min-w-[8rem]">
                            <OccupancyBar row={row} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>

              <p className="text-xs text-muted-foreground">
                Rood is verkocht, goud verkocht maar in de resale aangeboden. Stand van {formatDateTime(result.dataAsOf)}
                {result.catchUp === "overgeslagen" && " (er liep al een update; dit is de stand daarvoor)"}
                {result.catchUp === "mislukt" && " (bijwerken mislukte; dit is de vorige stand)"}.
                {result.ticketsWithoutManifest > 0 &&
                  ` ${number.format(result.ticketsWithoutManifest)} tickets wijzen naar een plek die (nog) niet in de stoelenkaart staat; die tellen mee als verkocht in hun vak.`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {ingest?.lastError && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-primary" />
          Vorige update uit Ringside gaf een fout: {ingest.lastError}. De volgende probeert het opnieuw.
        </p>
      )}
    </div>
  );
}
