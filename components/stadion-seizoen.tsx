"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowLeft, Check, Download, Link2, Loader2 } from "lucide-react";
import tokens from "@psv/branding/tokens/tokens.json";
import { formatDateTime, number, share, Stat } from "@/components/ticketing-stadion-parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SeasonMatch, SeasonOverview } from "@/lib/ticketing-stadion/season";

/**
 * Het seizoensoverzicht van Ticketing Stadion: de verkochte tickets van alle
 * thuiswedstrijden naast elkaar, gesplitst in gekocht in de vrije verkoop en
 * gekocht via de resale. Dit is verkoop, niet het aanbod dat nog te koop is.
 *
 * Rood voor vrije verkoop, goud voor resale. Goud haalt tegen wit geen 3:1; de
 * getallen staan daarom ook in de tabel.
 *
 * Met `shareToken` de openbare versie via een deellink: zonder vinkjes, zonder
 * seizoenkeuze en zonder links naar de wedstrijdpagina's.
 */

const SALES_SERIES = [
  { key: "free", label: "Verkocht in de vrije verkoop", short: "Vrije verkoop", color: tokens.color.red.secondary },
  { key: "resale", label: "Verkocht via de resale", short: "Resale", color: tokens.color.gold },
] as const;

type Payload = SeasonOverview & { sales: { complete: boolean; caughtUpAt: string | null; lastError: string | null } };

const AXIS_TICK = { fontSize: 10, fill: "hsl(var(--muted-foreground))" };

function storageKey(season: string): string {
  return `stadion-seizoen-uit:${season}`;
}

function dateLabel(eventDate: string, options: Intl.DateTimeFormatOptions): string {
  const parsed = new Date(`${eventDate.slice(0, 10)}T12:00:00Z`);
  return isNaN(parsed.getTime()) ? eventDate : parsed.toLocaleDateString("nl-NL", { ...options, timeZone: "UTC" });
}

/** `PSV - Ajax` → `Ajax`, voor onder de staaf. */
function shortName(name: string): string {
  return name.replace(/^\s*psv\s*[-–]\s*/i, "") || name;
}

function MatchTooltip({ active, payload }: { active?: boolean; payload?: { payload: SeasonMatch }[] }) {
  const match = active ? payload?.[0]?.payload : undefined;
  if (!match) return null;
  const total = match.free + match.resale;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-heading uppercase tracking-wide">{match.name}</p>
      <p className="text-muted-foreground">
        {dateLabel(match.eventDate, { weekday: "short", day: "numeric", month: "long" })}
        {match.played ? "" : " · nog te spelen"}
      </p>
      <p className="mt-1 text-sm font-bold">{number.format(total)} verkocht</p>
      {SALES_SERIES.map((series) => (
        <p key={series.key} className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2 w-2 rounded-sm" style={{ background: series.color }} />
          {series.short}: <span className="text-foreground">{number.format(match[series.key])}</span> ({share(match[series.key], total)})
        </p>
      ))}
    </div>
  );
}

function SeasonChart({ matches }: { matches: SeasonMatch[] }) {
  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {SALES_SERIES.map((series) => (
          <li key={series.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: series.color }} />
            {series.label}
          </li>
        ))}
      </ul>
      <div className="overflow-x-auto">
        <div className="h-80" style={{ minWidth: matches.length * 34 + 56 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={matches} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
              <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.6} vertical={false} />
              <XAxis
                dataKey="eventId"
                interval={0}
                height={90}
                angle={-45}
                textAnchor="end"
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tick={AXIS_TICK}
                tickFormatter={(id: string) => {
                  const name = shortName(matches.find((match) => match.eventId === id)?.name ?? "");
                  return name.length > 16 ? `${name.slice(0, 15)}…` : name;
                }}
              />
              <YAxis allowDecimals={false} width={48} tickLine={false} axisLine={false} tick={AXIS_TICK} tickFormatter={(value: number) => number.format(value)} />
              <Tooltip cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }} content={<MatchTooltip />} />
              {SALES_SERIES.map((series, index) => (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  name={series.label}
                  stackId="verkoop"
                  fill={series.color}
                  maxBarSize={36}
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                  radius={index === SALES_SERIES.length - 1 ? [4, 4, 0, 0] : 0}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function SeasonTable({
  matches,
  totals,
  excluded,
  shared,
  onToggle,
  onToggleAll,
}: {
  matches: SeasonMatch[];
  totals: SeasonOverview["totals"];
  excluded: ReadonlySet<string>;
  /** De openbare versie: geen vinkjes en geen links naar de wedstrijdpagina. */
  shared: boolean;
  onToggle: (eventId: string) => void;
  onToggleAll: (include: boolean) => void;
}) {
  const highest = Math.max(1, ...matches.map((match) => match.free + match.resale));
  const allIncluded = matches.every((match) => !excluded.has(match.eventId));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-left text-xs font-heading uppercase tracking-wide text-muted-foreground">
            {!shared && <th className="w-8 py-2 font-normal">
              <input
                type="checkbox"
                className="h-4 w-4 accent-psv-red-primary"
                checked={allIncluded}
                onChange={(event) => onToggleAll(event.target.checked)}
                aria-label="Alle wedstrijden meetellen"
                title="Alle wedstrijden meetellen"
              />
            </th>}
            <th className="py-2 font-normal">Wedstrijd</th>
            <th className="py-2 font-normal">Datum</th>
            <th className="py-2 text-right font-normal">Verkocht vrije verkoop</th>
            <th className="py-2 text-right font-normal">Verkocht resale</th>
            <th className="py-2 text-right font-normal">Totaal verkocht</th>
            <th className="py-2 text-right font-normal">Aandeel resale</th>
            <th className="w-40 py-2 pl-4 font-normal">Verdeling</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((match) => {
            const total = match.free + match.resale;
            const included = !excluded.has(match.eventId);
            return (
              <tr key={match.eventId} className={`border-t border-border ${included ? "" : "opacity-50"}`}>
                {!shared && (
                  <td className="py-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-psv-red-primary"
                      checked={included}
                      onChange={() => onToggle(match.eventId)}
                      aria-label={`${match.name} meetellen in het overzicht`}
                    />
                  </td>
                )}
                <td className="py-2">
                  {shared ? (
                    <span className="font-medium">{match.name}</span>
                  ) : (
                    <Link href={`/dashboard/ticketing-stadion/${match.eventId}`} className="font-medium hover:underline">
                      {match.name}
                    </Link>
                  )}
                  {!match.played && <span className="tag tag--outlined ml-2 px-1.5 py-0 text-[10px]">Nog te spelen</span>}
                </td>
                <td className="whitespace-nowrap py-2 text-xs text-muted-foreground">
                  {dateLabel(match.eventDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                </td>
                <td className="py-2 text-right tabular-nums">{number.format(match.free)}</td>
                <td className="py-2 text-right tabular-nums">{number.format(match.resale)}</td>
                <td className="py-2 text-right font-medium tabular-nums">{number.format(total)}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{total > 0 ? share(match.resale, total) : "–"}</td>
                <td className="py-2 pl-4">
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    {SALES_SERIES.map((series) => (
                      <div key={series.key} style={{ background: series.color, width: `${(match[series.key] / highest) * 100}%` }} />
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border font-medium">
            <td className="py-2 font-heading uppercase tracking-wide" colSpan={shared ? 2 : 3}>
              Totaal{totals.matches < matches.length ? ` (${totals.matches} van ${matches.length} wedstrijden)` : ""}
            </td>
            <td className="py-2 text-right tabular-nums">{number.format(totals.free)}</td>
            <td className="py-2 text-right tabular-nums">{number.format(totals.resale)}</td>
            <td className="py-2 text-right tabular-nums">{number.format(totals.free + totals.resale)}</td>
            <td className="py-2 text-right tabular-nums">{totals.free + totals.resale > 0 ? share(totals.resale, totals.free + totals.resale) : "–"}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Maakt een deellink van het seizoen met de huidige selectie en zet hem op het klembord. */
function ShareButton({ season, exclude }: { season: string; exclude: string[] }) {
  const [state, setState] = useState<"idle" | "busy" | "copied" | "shown">("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selection = exclude.join(",");

  // Een andere selectie is een andere link; de oude niet laten staan.
  useEffect(() => {
    setUrl(null);
    setState("idle");
  }, [season, selection]);

  async function create() {
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/ticketing-stadion/seizoen/deel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season, exclude }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error ?? `Status ${res.status}`);
      setUrl(data.url);
      try {
        await navigator.clipboard.writeText(data.url);
        setState("copied");
      } catch {
        // Geen toegang tot het klembord: dan de link tonen om zelf te kopiëren.
        setState("shown");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setState("idle");
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={create} disabled={state === "busy"} className="btn btn--medium btn--outlined inline-flex items-center justify-center gap-2 whitespace-nowrap">
        {state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" /> : state === "copied" ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
        {state === "copied" ? "Link gekopieerd" : "Deel link"}
      </button>
      {url && (
        <p className="max-w-md break-all text-xs text-muted-foreground">
          Iedereen met deze link ziet dit overzicht zonder in te loggen
          {exclude.length ? `, zonder de ${exclude.length} uitgezette ${exclude.length === 1 ? "wedstrijd" : "wedstrijden"}` : ""}:{" "}
          <a href={url} target="_blank" rel="noreferrer" className="text-foreground underline">
            {url}
          </a>
        </p>
      )}
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}

export function StadionSeizoen({ shareToken }: { shareToken?: string } = {}) {
  const shared = Boolean(shareToken);
  const [season, setSeason] = useState<string | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Wedstrijden die niet meetellen in de cijfers en de grafiek. Per seizoen
  // onthouden in deze browser.
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const shownSeason = payload?.season ?? null;

  useEffect(() => {
    if (!shownSeason || shared) return;
    let stored: string[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey(shownSeason)) ?? "[]");
      if (Array.isArray(raw)) stored = raw.filter((id): id is string => typeof id === "string");
    } catch {
      // Geen opslag of onleesbaar: dan telt alles mee.
    }
    setExcluded(new Set(stored));
  }, [shownSeason, shared]);

  const updateExcluded = useCallback(
    (next: Set<string>) => {
      setExcluded(next);
      if (!shownSeason) return;
      try {
        localStorage.setItem(storageKey(shownSeason), JSON.stringify([...next]));
      } catch {
        // Niet te bewaren; de keuze geldt dan tot de pagina sluit.
      }
    },
    [shownSeason]
  );

  const included = useMemo(() => (payload?.matches ?? []).filter((match) => !excluded.has(match.eventId)), [payload, excluded]);

  const load = useCallback(async (wanted: string | null) => {
    try {
      const url = shareToken
        ? `/api/share/stadion/seizoen?token=${encodeURIComponent(shareToken)}`
        : `/api/ticketing-stadion/seizoen${wanted ? `?season=${encodeURIComponent(wanted)}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Status ${res.status}`);
      setPayload(body as Payload);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [shareToken]);

  useEffect(() => {
    load(season);
  }, [load, season]);

  const back = shared ? null : (
    <Link
      href="/dashboard/ticketing-stadion"
      className="inline-flex items-center gap-1.5 text-xs font-heading uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Ticketing Stadion
    </Link>
  );

  if (error) {
    return (
      <div className="space-y-4">
        {back}
        <div className="alert alert--error flex items-start gap-2" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      </div>
    );
  }
  if (!payload) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Laden…
      </div>
    );
  }

  const { matches: allMatches, seasons, sales } = payload;
  const matches = included;
  const totals = {
    matches: matches.length,
    played: matches.filter((match) => match.played).length,
    free: matches.reduce((sum, match) => sum + match.free, 0),
    resale: matches.reduce((sum, match) => sum + match.resale, 0),
  };
  const left = allMatches.filter((match) => excluded.has(match.eventId));
  const total = totals.free + totals.resale;
  const withSales = matches.filter((match) => match.free + match.resale > 0);
  const topResale = withSales.reduce<SeasonMatch | null>(
    (top, match) => (!top || match.resale / (match.free + match.resale) > top.resale / (top.free + top.resale) ? match : top),
    null
  );
  const upcoming = totals.matches - totals.played;

  return (
    <div className="space-y-6">
      {back}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-heading text-3xl uppercase">Seizoen {payload.season}</h1>
          <p className="lead max-w-3xl">
            Verkochte tickets van alle thuiswedstrijden van PSV 1: gekocht in de vrije verkoop en gekocht via de resale.
          </p>
        </div>
        {!shared && <div className="flex flex-wrap items-start gap-3">
          {seasons.length > 1 && (
            <div>
              <label className="sr-only" htmlFor="seizoen">
                Seizoen
              </label>
              <select
                id="seizoen"
                className="h-10 border border-input bg-background px-3 text-sm"
                value={payload.season}
                onChange={(event) => setSeason(event.target.value)}
              >
                {seasons.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          )}
          <a
            href={`/api/ticketing-stadion/seizoen?season=${encodeURIComponent(payload.season)}&format=csv${left.length ? `&exclude=${left.map((match) => match.eventId).join(",")}` : ""}`}
            className="btn btn--medium btn--outlined inline-flex items-center gap-2 whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            Download CSV
          </a>
          <ShareButton season={payload.season} exclude={left.map((match) => match.eventId)} />
        </div>}
      </header>

      {!sales.complete && (
        <div className="alert alert--warning text-sm">
          De verkoop per dag is nog niet helemaal ingelezen. Deze pagina is leeg of onvolledig tot dat klaar is.
        </div>
      )}

      {allMatches.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Er staan geen thuiswedstrijden van dit seizoen in de verkoop per dag.</CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <Stat
                  label="Thuiswedstrijden"
                  value={number.format(totals.matches)}
                  hint={`${totals.played} gespeeld, ${upcoming} nog te spelen${left.length ? `; ${left.length} uitgezet` : ""}`}
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <Stat label="Verkocht vrije verkoop" value={number.format(totals.free)} hint={totals.matches ? `gemiddeld ${number.format(Math.round(totals.free / totals.matches))} per wedstrijd` : undefined} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <Stat label="Verkocht via resale" value={number.format(totals.resale)} hint={totals.matches ? `gemiddeld ${number.format(Math.round(totals.resale / totals.matches))} per wedstrijd` : undefined} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <Stat
                  label="Aandeel resale"
                  value={total > 0 ? share(totals.resale, total) : "–"}
                  hint={topResale ? `hoogst bij ${shortName(topResale.name)}: ${share(topResale.resale, topResale.free + topResale.resale)}` : undefined}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Verkochte tickets per wedstrijd</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {matches.length > 0 ? (
                <SeasonChart matches={matches} />
              ) : (
                <p className="text-sm text-muted-foreground">Alle wedstrijden staan uit. Vink er hieronder een aan.</p>
              )}
              <SeasonTable
                matches={allMatches}
                totals={totals}
                excluded={excluded}
                shared={shared}
                onToggle={(eventId) => {
                  const next = new Set(excluded);
                  if (!next.delete(eventId)) next.add(eventId);
                  updateExcluded(next);
                }}
                onToggleAll={(include) => updateExcluded(include ? new Set() : new Set(allMatches.map((match) => match.eventId)))}
              />
              <p className="text-xs text-muted-foreground">
                {!shared &&
                  "Met het vinkje bepaal je of een wedstrijd meetelt in de cijfers, de grafiek, het totaal, de CSV en de deellink; de keuze wordt in deze browser onthouden. "}
                Dit is verkoop, niet het aanbod dat nog te koop is. Verkochte tickets in de tribunevakken, zonder seizoenkaarten, vrijkaarten en parkeren. Resale is wat via de resale gekocht is; een
                doorverkocht ticket telt alleen daar. {upcoming > 0 && "Bij wedstrijden die nog gespeeld moeten worden is het de stand tot nu toe; die kan iets te hoog zijn, omdat een retour er nog niet af gaat en een gewijzigd ticket dubbel kan tellen. "}
                {sales.caughtUpAt && `Bijgewerkt tot ${formatDateTime(sales.caughtUpAt)}.`}
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
