"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowLeft, Download, Loader2 } from "lucide-react";
import { SUPPLY_SERIES } from "@/components/stadion-supply-chart";
import { formatDateTime, number, share, Stat } from "@/components/ticketing-stadion-parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SeasonMatch, SeasonOverview } from "@/lib/ticketing-stadion/season";

/**
 * Het seizoensoverzicht van Ticketing Stadion: vrije verkoop en resale van alle
 * thuiswedstrijden naast elkaar. Zelfde kleuren als het aanbod
 * (`SUPPLY_SERIES`): rood voor vrije verkoop, goud voor resale. Goud haalt
 * tegen wit geen 3:1; de getallen staan daarom ook in de tabel.
 */

type Payload = SeasonOverview & { sales: { complete: boolean; caughtUpAt: string | null; lastError: string | null } };

const AXIS_TICK = { fontSize: 10, fill: "hsl(var(--muted-foreground))" };

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
      {SUPPLY_SERIES.map((series) => (
        <p key={series.key} className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2 w-2 rounded-sm" style={{ background: series.color }} />
          {series.label}: <span className="text-foreground">{number.format(match[series.key])}</span> ({share(match[series.key], total)})
        </p>
      ))}
    </div>
  );
}

function SeasonChart({ matches }: { matches: SeasonMatch[] }) {
  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {SUPPLY_SERIES.map((series) => (
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
              {SUPPLY_SERIES.map((series, index) => (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  name={series.label}
                  stackId="verkoop"
                  fill={series.color}
                  maxBarSize={36}
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                  radius={index === SUPPLY_SERIES.length - 1 ? [4, 4, 0, 0] : 0}
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

function SeasonTable({ matches, totals }: { matches: SeasonMatch[]; totals: SeasonOverview["totals"] }) {
  const highest = Math.max(1, ...matches.map((match) => match.free + match.resale));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-left text-xs font-heading uppercase tracking-wide text-muted-foreground">
            <th className="py-2 font-normal">Wedstrijd</th>
            <th className="py-2 font-normal">Datum</th>
            <th className="py-2 text-right font-normal">Vrije verkoop</th>
            <th className="py-2 text-right font-normal">Resale</th>
            <th className="py-2 text-right font-normal">Totaal</th>
            <th className="py-2 text-right font-normal">Aandeel resale</th>
            <th className="w-40 py-2 pl-4 font-normal">Verdeling</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((match) => {
            const total = match.free + match.resale;
            return (
              <tr key={match.eventId} className="border-t border-border">
                <td className="py-2">
                  <Link href={`/dashboard/ticketing-stadion/${match.eventId}`} className="font-medium hover:underline">
                    {match.name}
                  </Link>
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
                    {SUPPLY_SERIES.map((series) => (
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
            <td className="py-2 font-heading uppercase tracking-wide" colSpan={2}>
              Totaal
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

export function StadionSeizoen() {
  const [season, setSeason] = useState<string | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (wanted: string | null) => {
    try {
      const res = await fetch(`/api/ticketing-stadion/seizoen${wanted ? `?season=${encodeURIComponent(wanted)}` : ""}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Status ${res.status}`);
      setPayload(body as Payload);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => {
    load(season);
  }, [load, season]);

  const back = (
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

  const { matches, totals, seasons, sales } = payload;
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
          <p className="lead max-w-3xl">Vrije verkoop en resale van alle thuiswedstrijden van PSV 1, naast elkaar.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {seasons.length > 1 && (
            <div className="form-group">
              <label className="form-label" htmlFor="seizoen">
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
            href={`/api/ticketing-stadion/seizoen?season=${encodeURIComponent(payload.season)}&format=csv`}
            className="btn btn--medium btn--outlined inline-flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Download CSV
          </a>
        </div>
      </header>

      {!sales.complete && (
        <div className="alert alert--warning text-sm">
          De verkoop per dag is nog niet helemaal ingelezen. Deze pagina is leeg of onvolledig tot dat klaar is.
        </div>
      )}

      {matches.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Er staan geen thuiswedstrijden van dit seizoen in de verkoop per dag.</CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <Stat label="Thuiswedstrijden" value={number.format(totals.matches)} hint={`${totals.played} gespeeld, ${upcoming} nog te spelen`} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <Stat label="Vrije verkoop" value={number.format(totals.free)} hint={`gemiddeld ${number.format(Math.round(totals.free / totals.matches))} per wedstrijd`} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <Stat label="Resale" value={number.format(totals.resale)} hint={`gemiddeld ${number.format(Math.round(totals.resale / totals.matches))} per wedstrijd`} />
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
              <CardTitle>Per wedstrijd</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <SeasonChart matches={matches} />
              <SeasonTable matches={matches} totals={totals} />
              <p className="text-xs text-muted-foreground">
                Verkochte tickets in de tribunevakken, zonder seizoenkaarten, vrijkaarten en parkeren. Resale is wat via de resale gekocht is; een
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
