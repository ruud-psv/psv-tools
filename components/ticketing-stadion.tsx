"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Armchair,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AreaOccupancy, Occupancy } from "@/lib/ticketing-herdgang/occupancy";
import type { Comparison, SalesPace } from "@/lib/ticketing-stadion/summary";

interface MatchRow {
  eventId: string;
  name: string | null;
  eventDate: string | null;
  daysOut: number;
  total: Occupancy;
  otherTotal: Occupancy;
  areas: AreaOccupancy[];
  pace: SalesPace | null;
  comparison: Comparison;
}

interface Overview {
  matches: MatchRow[];
  summaryAt: string;
  seats: {
    ready: boolean;
    capacityComplete: boolean;
    reservationComplete: boolean;
    caughtUpAt: string | null;
    running: boolean;
    lastError: string | null;
  };
  sales: { complete: boolean; updatedAt: string | null; lastError: string | null };
}

/** Vanaf deze bezetting heet een wedstrijd (bijna) uitverkocht. */
const NEARLY_SOLD_OUT = 0.95;

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
  if (!value) return "datum onbekend";
  const parsed = new Date(value.replace(" ", "T"));
  if (isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function daysLabel(days: number): string {
  if (days === 0) return "Vandaag";
  if (days === 1) return "Morgen";
  return `Over ${days} dagen`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-heading tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Verkocht in rood, daarvan in de resale in goud, gereserveerd in grijs. */
function OccupancyBar({ row }: { row: Occupancy }) {
  const width = (value: number) => `${row.capacity > 0 ? Math.min((value / row.capacity) * 100, 100) : 0}%`;
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className="bg-psv-red-primary" style={{ width: width(row.sold - row.resale) }} />
      <div className="bg-psv-gold" style={{ width: width(row.resale) }} />
      <div className="bg-muted-foreground/50" style={{ width: width(row.reserved) }} />
    </div>
  );
}

/** Verschil met een eerdere wedstrijd op hetzelfde aantal dagen voor de aftrap. */
function Delta({ label, own, reference, detail }: { label: string; own: number; reference: number; detail: string }) {
  const diff = own - reference;
  const ahead = diff >= 0;
  const Icon = ahead ? TrendingUp : TrendingDown;
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${ahead ? "text-success" : "text-error"}`} />
      <div>
        <span className="font-medium">{label}: </span>
        <span className={`tabular-nums font-medium ${ahead ? "text-success" : "text-error"}`}>
          {ahead ? "+" : "−"}
          {number.format(Math.abs(diff))}
          {reference > 0 && ` (${ahead ? "+" : "−"}${percent.format(Math.abs(diff) / reference)})`}
        </span>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

/** Het opengeklapte deel van een rij: alles wat niet in de kolommen past. */
function MatchDetail({ match }: { match: MatchRow }) {
  const { total, pace, comparison } = match;
  const mostFree = match.areas
    .filter((area) => area.free > 0)
    .sort((a, b) => b.free - a.free)
    .slice(0, 3);
  const { sameOpponent, previousSeason } = comparison;

  return (
    <div className="space-y-4 bg-muted/30 px-4 py-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground tabular-nums">
          {number.format(total.sold)} van {number.format(total.capacity)} verkocht
        </p>
        <OccupancyBar row={total} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Vrij" value={number.format(total.free)} hint="nog te koop" />
        <Stat label="Gereserveerd" value={number.format(total.reserved)} hint="nog niet afgenomen" />
        <Stat label="In de resale" value={number.format(total.resale)} hint="aangeboden door de houder" />
        <Stat
          label="Laatste 7 dagen"
          value={pace ? number.format(pace.last7Days) : "–"}
          hint={pace ? `${number.format(pace.today)} vandaag` : "nog geen verkoop per dag"}
        />
      </div>

      {(sameOpponent || previousSeason) && (
        <div className="space-y-3 border-t border-border pt-4">
          <p className="label text-xs text-muted-foreground">
            Vergeleken met eerder, {match.daysOut === 0 ? "op de wedstrijddag" : `${match.daysOut} dagen voor de aftrap`}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {sameOpponent && (
              <Delta
                label={`${sameOpponent.name} (${sameOpponent.season})`}
                own={comparison.soldBy}
                reference={sameOpponent.soldBy}
                detail={`Toen ${number.format(sameOpponent.soldBy)} verkocht op dit moment, eindstand ${number.format(sameOpponent.total)}.`}
              />
            )}
            {previousSeason && (
              <Delta
                label={`Gemiddelde ${previousSeason.season}`}
                own={comparison.soldBy}
                reference={previousSeason.soldBy}
                detail={`Gemiddeld ${number.format(previousSeason.soldBy)} op dit moment over ${previousSeason.matches} thuiswedstrijden, eindstand ${number.format(previousSeason.total)}.`}
              />
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm">
        <p className="text-muted-foreground">
          {mostFree.length > 0 ? (
            <>
              Meeste vrije plaatsen:{" "}
              {mostFree.map((area, i) => (
                <span key={area.area}>
                  {i > 0 && ", "}
                  <span className="font-medium text-foreground">{area.area}</span> ({number.format(area.free)})
                </span>
              ))}
            </>
          ) : (
            "Geen vrije plaatsen meer."
          )}
        </p>
        <Link
          href="/dashboard/aangrenzende-stoelen"
          className="inline-flex items-center gap-1.5 text-xs font-heading uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
        >
          <Armchair className="h-3.5 w-3.5" />
          Aangrenzende stoelen
        </Link>
      </div>
    </div>
  );
}

/** Verschil met de vorige keer tegen deze tegenstander, of anders met vorig seizoen. */
function TrendCell({ comparison }: { comparison: Comparison }) {
  const reference = comparison.sameOpponent ?? comparison.previousSeason;
  if (!reference || reference.soldBy <= 0) return <span className="text-xs text-muted-foreground">–</span>;
  const diff = (comparison.soldBy - reference.soldBy) / reference.soldBy;
  const ahead = diff >= 0;
  const Icon = ahead ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center justify-end gap-1 text-sm font-medium tabular-nums ${ahead ? "text-success" : "text-error"}`}
      title={comparison.sameOpponent ? `t.o.v. ${comparison.sameOpponent.name} (${comparison.sameOpponent.season})` : `t.o.v. gemiddelde ${comparison.previousSeason?.season}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {ahead ? "+" : "−"}
      {percent.format(Math.abs(diff))}
    </span>
  );
}

const GRID = "grid grid-cols-[minmax(12rem,1fr)_7rem_6rem_5.5rem_9rem_6.5rem_6rem_1rem] gap-x-4 items-center";

function MatchTable({ matches }: { matches: MatchRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="border border-border rounded-md overflow-hidden overflow-x-auto bg-background">
      <div className="min-w-[880px]">
        <div
          className={`${GRID} px-4 py-2.5 bg-muted/50 border-b border-border text-xs font-heading uppercase tracking-wide text-muted-foreground`}
        >
          <span>Wedstrijd</span>
          <span>Datum</span>
          <span className="text-right">Verkocht</span>
          <span className="text-right">Vrij</span>
          <span>Bezetting</span>
          <span className="text-right">Laatste 7 dagen</span>
          <span className="text-right" title="Verkocht op dit moment, vergeleken met de vorige keer tegen deze tegenstander (of anders het gemiddelde van vorig seizoen)">
            T.o.v. eerder
          </span>
          <span />
        </div>

        <div className="divide-y divide-border">
          {matches.map((match) => {
            const expanded = expandedId === match.eventId;
            const { total } = match;
            const pct = total.capacity > 0 ? total.sold / total.capacity : 0;
            return (
              <div key={match.eventId}>
                <button
                  className={`${GRID} px-4 py-3 w-full text-left hover:bg-muted/30 transition-colors`}
                  onClick={() => setExpandedId(expanded ? null : match.eventId)}
                  aria-expanded={expanded}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{match.name ?? "Onbekende wedstrijd"}</span>
                      {pct >= NEARLY_SOLD_OUT && <span className="tag shrink-0 text-[10px] px-1.5 py-0">{total.free === 0 ? "Uitverkocht" : "Bijna vol"}</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground">{daysLabel(match.daysOut)}</span>
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{formatEventDate(match.eventDate)}</span>
                  <span className="text-sm text-right tabular-nums">{number.format(total.sold)}</span>
                  <span className="text-sm text-right tabular-nums font-medium">{number.format(total.free)}</span>
                  <span className="flex items-center gap-2">
                    <span className="flex-1">
                      <OccupancyBar row={total} />
                    </span>
                    <span className="text-xs text-muted-foreground w-9 text-right tabular-nums">{share(total.sold, total.capacity)}</span>
                  </span>
                  <span className="text-sm text-right tabular-nums">
                    {match.pace ? number.format(match.pace.last7Days) : "–"}
                  </span>
                  <span className="text-right">
                    <TrendCell comparison={match.comparison} />
                  </span>
                  {expanded ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
                {expanded && <MatchDetail match={match} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function TicketingStadion() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ticketing-stadion", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error ??
            (res.status === 502 || res.status === 504
              ? "De server deed er te lang over of liep vast. Probeer het over een minuut opnieuw."
              : `Status ${res.status}`)
        );
      }
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

  if (loading && !overview) {
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
          <span>{error ?? "Het overzicht kon niet worden geladen."}</span>
        </CardContent>
      </Card>
    );
  }

  const { matches, seats, sales } = overview;
  const next = matches[0];
  const soldLast7 = matches.reduce((sum, match) => sum + (match.pace?.last7Days ?? 0), 0);
  const free = matches.reduce((sum, match) => sum + match.total.free, 0);
  const soldOut = matches.filter(
    (match) => match.total.capacity > 0 && match.total.sold / match.total.capacity >= NEARLY_SOLD_OUT
  ).length;

  return (
    <div className="space-y-6">
      {!seats.ready && (
        <div className="alert alert--info text-sm">
          De stoelstatus wordt nog voor het eerst uit Ringside ingelezen. Zodra dat klaar is, staan de wedstrijden hier.
        </div>
      )}
      {seats.ready && (!seats.capacityComplete || !seats.reservationComplete) && (
        <div className="alert alert--warning text-sm">
          Nog niet alle cijfers zijn betrouwbaar: de tool vult eenmalig capaciteit en reserveringen aan. Dat gaat vanzelf
          en duurt een paar uur.
        </div>
      )}
      {!sales.complete && (
        <div className="alert alert--warning text-sm">
          De verkoop per dag is nog niet helemaal ingelezen. Tempo en vergelijkingen zijn tot die tijd ondergrenzen.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <Stat
              label="Volgende wedstrijd"
              value={next ? share(next.total.sold, next.total.capacity) : "–"}
              hint={next ? `${next.name ?? "Onbekend"} · ${daysLabel(next.daysOut).toLowerCase()}` : "geen wedstrijden gepland"}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Stat label="Verkocht laatste 7 dagen" value={number.format(soldLast7)} hint="alle komende thuiswedstrijden" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Stat label="Vrije plaatsen" value={number.format(free)} hint="alle komende thuiswedstrijden" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Stat
              label="(Bijna) uitverkocht"
              value={`${soldOut} van ${matches.length}`}
              hint={`${percent.format(NEARLY_SOLD_OUT)} of meer verkocht`}
            />
          </CardContent>
        </Card>
      </div>

      {seats.ready && matches.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Er staan geen komende thuiswedstrijden van PSV in Ringside.
          </CardContent>
        </Card>
      )}

      {matches.length > 0 && <MatchTable matches={matches} />}

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <p className="max-w-3xl">
          Bezetting is verkocht gedeeld door de capaciteit van de vakken op de plattegrond; parkeren telt niet mee. In de
          balk: rood verkocht, goud verkocht maar in de resale, grijs gereserveerd. Klik op een wedstrijd voor de details. Stoelstatus van{" "}
          {formatDateTime(seats.caughtUpAt)}
          {seats.running && " (er loopt nu een update)"}, verkoop per dag van {formatDateTime(sales.updatedAt)}. De
          vergelijking gebruikt voor beide wedstrijden de verkoop per dag, zonder reserveringen.
        </p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Vernieuwen
        </Button>
      </div>

      {(seats.lastError || sales.lastError) && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-primary" />
          Vorige update uit Ringside gaf een fout: {seats.lastError ?? sales.lastError}. De volgende probeert het opnieuw.
        </p>
      )}
    </div>
  );
}
