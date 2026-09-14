"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, AlertTriangle, X, ArrowUpDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TicketSalesChart } from "@/components/ticket-sales-chart";
import { offsetsToDailyPoints } from "@/lib/ringside/daily-sales";
import { filterMatches, seasonsOf } from "@/lib/ringside/match-filter";
import type { ComparisonInput, ComparisonMode } from "@/lib/ticket-sales-comparison";

interface MatchSummary {
  productId: string;
  name: string;
  eventDate: string;
  season: string;
  category: string;
  total: number;
}

interface MatchDetail extends MatchSummary {
  perOffset: Record<string, number>;
}

interface IngestStatus {
  complete: boolean;
  phase: string;
  salesRowsRead: number;
  runs: number;
  updatedAt: string;
  lastError: string | null;
}

/** Hoeveel wedstrijden er tegelijk naast elkaar mogen; meer wordt onleesbaar. */
const MAX_COMPARISONS = 3;

/** Hoeveel rijen de lijst toont. Verder filteren of zoeken brengt de rest in beeld. */
const VISIBLE_MATCHES = 60;

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
}

/** Verkocht vanaf `offset` dagen voor de wedstrijd tot en met de wedstrijddag. */
function soldWithin(perOffset: Record<string, number>, offset: number): number {
  let total = 0;
  for (const [key, count] of Object.entries(perOffset)) {
    const day = Number(key);
    if (Number.isFinite(day) && day <= offset && day >= 0) total += count;
  }
  return total;
}

export function RingsideMatchSales() {
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [status, setStatus] = useState<IngestStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [season, setSeason] = useState<string>("alle");
  const [newestFirst, setNewestFirst] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState<Record<string, MatchDetail>>({});
  const [mode, setMode] = useState<ComparisonMode>("perDag");

  useEffect(() => {
    fetch("/api/ringside/matches", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setMatches(data.matches ?? []);
        setStatus(data.status ?? null);
        setError(data.error ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Ophalen mislukt"))
      .finally(() => setLoading(false));
  }, []);

  // Alleen de geselecteerde wedstrijden hebben hun verkoopreeks nodig; de lijst
  // zelf blijft daardoor klein, ook met duizenden wedstrijden.
  useEffect(() => {
    const missing = selected.filter((id) => !details[id]);
    if (missing.length === 0) return;

    fetch(`/api/ringside/matches?ids=${missing.join(",")}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { matches?: MatchDetail[] }) => {
        if (!data.matches?.length) return;
        setDetails((current) => {
          const next = { ...current };
          for (const match of data.matches!) next[match.productId] = match;
          return next;
        });
      })
      .catch(() => {
        /* Een mislukte reeks laat de rest van de pagina staan. */
      });
  }, [selected, details]);

  const seasons = useMemo(() => seasonsOf(matches), [matches]);

  const filtered = useMemo(
    () => filterMatches(matches, { season, query, newestFirst, limit: VISIBLE_MATCHES }),
    [matches, query, season, newestFirst]
  );

  const primary = selected[0] ? details[selected[0]] : undefined;

  const points = useMemo(
    () => (primary ? offsetsToDailyPoints(primary.perOffset, primary.eventDate) : []),
    [primary]
  );

  const comparisons = useMemo<ComparisonInput[]>(
    () =>
      selected
        .slice(1)
        .map((id) => details[id])
        .filter((match): match is MatchDetail => Boolean(match))
        .map((match) => ({
          id: match.productId,
          name: match.name,
          season: match.season,
          eventDate: match.eventDate,
          perOffset: new Map(
            Object.entries(match.perOffset).map(([offset, count]) => [Number(offset), count])
          ),
          total: match.total,
          unfilteredTotal: match.total,
        })),
    [selected, details]
  );

  function toggle(id: string) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id);
      if (current.length > MAX_COMPARISONS) return current;
      return [...current, id];
    });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Wedstrijden laden…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {status && !status.complete && (
        <div className="alert alert--warning flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-heading uppercase tracking-wide text-xs">Nog aan het inlezen</p>
            <p className="text-sm mt-1">
              {status.salesRowsRead.toLocaleString("nl-NL")} verkoopregels verwerkt in{" "}
              {status.runs} {status.runs === 1 ? "ronde" : "rondes"}. De verkooptabel is niet op
              datum geordend, dus de regels van één wedstrijd liggen verspreid — pas als alles
              doorlopen is, kloppen de totalen. Tot die tijd zijn het ondergrenzen.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert--error flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {matches.length === 0 && !error && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Nog geen wedstrijden ingelezen. Open eenmalig{" "}
            <code className="text-xs">/api/ringside/ingest</code> — die leest de verkoop in en
            zet zichzelf door tot alles binnen is. Daarna houdt de cron het bij.
          </CardContent>
        </Card>
      )}

      {matches.length > 0 && (
        <>
          <div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Zoek een wedstrijd…"
                className="pl-9"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Kies een wedstrijd, en tot {MAX_COMPARISONS} andere om mee te vergelijken.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSeason("alle")}
              className={`tag ${season === "alle" ? "" : "tag--outlined"}`}
            >
              Alle seizoenen
            </button>
            {seasons.map((option) => (
              <button
                key={option}
                onClick={() => setSeason(option)}
                className={`tag ${season === option ? "" : "tag--outlined"}`}
              >
                {option}
              </button>
            ))}
            <span className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setNewestFirst((current) => !current)}
                className="inline-flex items-center gap-1.5 text-xs font-heading uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                {newestFirst ? "Nieuwste eerst" : "Oudste eerst"}
              </button>
            </span>
          </div>

          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selected.map((id, index) => {
                const match = details[id] ?? matches.find((m) => m.productId === id);
                return (
                  <button
                    key={id}
                    onClick={() => toggle(id)}
                    className={`tag ${index === 0 ? "" : "tag--outlined"} inline-flex items-center gap-1.5`}
                  >
                    {match?.name ?? id}
                    <X className="h-3 w-3" />
                  </button>
                );
              })}
            </div>
          )}

          <div className="grid gap-2 max-h-72 overflow-y-auto pr-1">
            {filtered.rows.map((match) => {
              const active = selected.includes(match.productId);
              return (
                <button
                  key={match.productId}
                  onClick={() => toggle(match.productId)}
                  className={`flex items-center justify-between gap-4 rounded-md border px-3 py-2 text-left transition-colors ${
                    active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{match.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(match.eventDate)} · {match.season}
                    </span>
                  </span>
                  <span className="shrink-0 font-heading text-sm">
                    {match.total.toLocaleString("nl-NL")}
                  </span>
                </button>
              );
            })}
            {filtered.rows.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Geen wedstrijd gevonden{season !== "alle" ? ` in seizoen ${season}` : ""}.
              </p>
            )}
          </div>

          {filtered.total > filtered.rows.length && (
            <p className="text-xs text-muted-foreground">
              {filtered.rows.length} van {filtered.total} wedstrijden getoond — filter op seizoen
              of zoek om de rest in beeld te krijgen.
            </p>
          )}

          {primary && (
            <>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <Stat label="Totaal verkocht" value={primary.total} />
                <Stat label="Verkocht in laatste week" value={soldWithin(primary.perOffset, 7)} />
                <Stat label="Verkocht op de wedstrijddag" value={primary.perOffset["0"] ?? 0} />
                <Stat label="Verkoopdagen" value={points.filter((p) => (p.sold ?? 0) > 0).length} />
              </div>

              <div className="flex gap-2">
                {(["perDag", "tempo"] as ComparisonMode[]).map((option) => (
                  <button
                    key={option}
                    onClick={() => setMode(option)}
                    className={`btn btn--medium ${mode === option ? "" : "btn--outlined"}`}
                  >
                    {option === "perDag" ? "Per dag" : "Tempo"}
                  </button>
                ))}
              </div>

              <Card>
                <CardContent className="p-4 sm:p-6">
                  <TicketSalesChart
                    eventId={primary.productId}
                    eventDate={primary.eventDate}
                    points={points}
                    comparisons={comparisons}
                    liveName={primary.name}
                    comparisonMode={mode}
                    comparisonWindow="full"
                  />
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="label text-muted-foreground">{label}</p>
        <p className="text-2xl font-heading mt-1">{value.toLocaleString("nl-NL")}</p>
      </CardContent>
    </Card>
  );
}
