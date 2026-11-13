"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisTicks, SUPPLY_SERIES } from "@/components/stadion-supply-chart";
import { number } from "@/components/ticketing-stadion-parts";
import type { SupplyPoint } from "@/lib/ticketing-stadion/supply-history";

/**
 * Het aanbod per dag: per dag één gestapelde staaf met wat er aan het eind van
 * die dag nog te koop was, in de vrije verkoop en in de resale. Vandaag is de
 * stand van nu. Zelfde kleuren als het aanbod per vak (`SUPPLY_SERIES`).
 *
 * De cron legt het aanbod pas vast sinds deze grafiek bestaat; eerdere dagen
 * zijn niet terug te rekenen. Een dag zonder meting blijft leeg.
 */

interface Row {
  date: string;
  daysOut: number | null;
  free: number | null;
  resale: number | null;
  total: number | null;
}

function dateLabel(date: string, options: Intl.DateTimeFormatOptions): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  return isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("nl-NL", { ...options, timeZone: "UTC" });
}

function daysOutLabel(daysOut: number | null): string | null {
  if (daysOut === null) return null;
  if (daysOut === 0) return "Wedstrijddag";
  return `${daysOut} ${daysOut === 1 ? "dag" : "dagen"} voor de wedstrijd`;
}

function HistoryTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  const when = daysOutLabel(row.daysOut);
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-heading uppercase tracking-wide">{dateLabel(row.date, { weekday: "short", day: "numeric", month: "short" })}</p>
      {when && <p className="text-muted-foreground">{when}</p>}
      {row.total === null ? (
        <p className="mt-1 text-muted-foreground">Die dag niet gemeten</p>
      ) : (
        <>
          <p className="mt-1 text-sm font-bold">{number.format(row.total)} te koop</p>
          {SUPPLY_SERIES.map((series) => (
            <p key={series.key} className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-sm" style={{ background: series.color }} />
              {series.label}: <span className="text-foreground">{number.format(row[series.key] ?? 0)}</span>
            </p>
          ))}
        </>
      )}
    </div>
  );
}

export function StadionSupplyHistoryChart({ points }: { points: SupplyPoint[] }) {
  const rows = useMemo<Row[]>(
    () =>
      points.map((point) => ({
        ...point,
        total: point.free === null || point.resale === null ? null : point.free + point.resale,
      })),
    [points]
  );
  const max = rows.reduce((highest, row) => Math.max(highest, row.total ?? 0), 0);
  const ticks = axisTicks(max);
  const first = rows[0];

  if (!first) {
    return <p className="text-sm text-muted-foreground">Er is nog geen aanbod per dag vastgelegd.</p>;
  }

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

      {/* Bij veel dagen schuift de grafiek op een smal scherm, zodat de staven niet te dun worden. */}
      <div className="overflow-x-auto">
        <div className="h-64" style={{ minWidth: rows.length * 14 + 56 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
              <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.6} vertical={false} />
              <XAxis
                dataKey="date"
                interval="preserveStartEnd"
                minTickGap={12}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(date: string) => dateLabel(date, { day: "numeric", month: "short" })}
              />
              <YAxis
                allowDecimals={false}
                ticks={ticks}
                domain={[0, ticks[ticks.length - 1]]}
                width={44}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(value: number) => number.format(value)}
              />
              <Tooltip cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }} content={<HistoryTooltip />} />
              {SUPPLY_SERIES.map((series, index) => (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  name={series.label}
                  stackId="aanbod"
                  fill={series.color}
                  maxBarSize={28}
                  // Een rand in de kleur van de kaart houdt de segmenten uit elkaar.
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

      <p className="text-xs text-muted-foreground">
        De stand aan het eind van elke dag; vandaag is de stand van nu.{" "}
        {rows.length === 1
          ? "Het aanbod wordt vanaf vandaag elke dag vastgelegd, dus de grafiek vult zich vanzelf aan. Eerdere dagen zijn niet terug te halen: Ringside bewaart niet wanneer een kaart in de resale is gezet."
          : `Vastgelegd sinds ${dateLabel(first.date, { day: "numeric", month: "long" })}; eerdere dagen zijn niet terug te halen.`}
      </p>

      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-heading uppercase tracking-wide text-muted-foreground">
          Als tabel
        </summary>
        <div className="mt-2 max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-heading uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pr-3">Dag</th>
                <th className="py-1.5 pr-3 text-right">Dagen tot de wedstrijd</th>
                <th className="py-1.5 pr-3 text-right">Vrije verkoop</th>
                <th className="py-1.5 pr-3 text-right">Resale</th>
                <th className="py-1.5 text-right">Totaal</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((row) => (
                <tr key={row.date} className="border-t border-border">
                  <td className="py-1.5 pr-3">{dateLabel(row.date, { weekday: "short", day: "numeric", month: "short" })}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{row.daysOut ?? "–"}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{row.free === null ? "–" : number.format(row.free)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{row.resale === null ? "–" : number.format(row.resale)}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.total === null ? "niet gemeten" : number.format(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
