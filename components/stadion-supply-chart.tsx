"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import tokens from "@psv/branding/tokens/tokens.json";
import { number, share, Stat } from "@/components/ticketing-stadion-parts";
import type { AreaOccupancy, Occupancy } from "@/lib/ticketing-herdgang/occupancy";

/**
 * Het aanbod van een wedstrijd: wat er nu nog te koop is, verdeeld over de
 * vrije verkoop (vrije plaatsen) en de resale (door de houder aangeboden).
 *
 * Bovenaan het totaal met de verdeling in één balk, daaronder per vak een
 * gestapelde staaf. Het is de stand van nu; het verloop over de dagen staat in
 * `stadion-supply-history-chart.tsx`, met dezelfde kleuren.
 *
 * Kleuren uit de PSV-tokens. Goud haalt tegen wit geen 3:1; daarom staan de
 * getallen er altijd bij (legenda, tooltip en tabel) en hangt niets aan kleur
 * alleen.
 */
export const SUPPLY_SERIES = [
  { key: "free", label: "Vrije verkoop", color: tokens.color.red.secondary },
  { key: "resale", label: "Resale", color: tokens.color.gold },
] as const;

/** Meer staven dan dit worden onleesbaar; de rest staat in de tabel. */
const MAX_BARS = 30;

interface Row {
  area: string;
  free: number;
  resale: number;
  total: number;
}

/** Ronde stappen voor de as: 0, 50, 100, … tot net boven het hoogste vak. */
export function axisTicks(max: number): number[] {
  if (max <= 4) return Array.from({ length: Math.max(max, 1) + 1 }, (_, i) => i);
  const rough = max / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= rough) ?? 10) * magnitude;
  const ticks: number[] = [];
  // Stopt bij de eerste stap op of boven het hoogste vak.
  for (let value = 0; ; value += step) {
    ticks.push(value);
    if (value >= max) return ticks;
  }
}

function SupplyTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-heading uppercase tracking-wide">Vak {row.area}</p>
      <p className="mt-1 text-sm font-bold">{number.format(row.total)} te koop</p>
      {SUPPLY_SERIES.map((series) => (
        <p key={series.key} className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2 w-2 rounded-sm" style={{ background: series.color }} />
          {series.label}: <span className="text-foreground">{number.format(row[series.key])}</span>
        </p>
      ))}
    </div>
  );
}

export function StadionSupplyChart({ total, areas }: { total: Occupancy; areas: AreaOccupancy[] }) {
  const rows = useMemo<Row[]>(
    () =>
      areas
        .map((area) => ({ area: area.area, free: area.free, resale: area.resale, total: area.free + area.resale }))
        .filter((row) => row.total > 0)
        .sort((a, b) => b.total - a.total || a.area.localeCompare(b.area, "nl", { numeric: true })),
    [areas]
  );
  const supply = total.free + total.resale;
  const bars = rows.slice(0, MAX_BARS);
  const ticks = axisTicks(bars[0]?.total ?? 0);

  if (supply === 0) {
    return <p className="text-sm text-muted-foreground">Er is op dit moment niets te koop: geen vrije plaatsen en niets in de resale.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Totaal aanbod" value={number.format(supply)} hint={`${share(supply, total.capacity)} van de capaciteit`} />
        <Stat label="Vrije verkoop" value={number.format(total.free)} hint={`${share(total.free, supply)} van het aanbod`} />
        <Stat label="Resale" value={number.format(total.resale)} hint={`${share(total.resale, supply)} van het aanbod`} />
      </div>

      <div>
        <div
          className="flex h-3 w-full gap-0.5 overflow-hidden rounded-sm"
          role="img"
          aria-label={`Van de ${number.format(supply)} plaatsen te koop: ${number.format(total.free)} in de vrije verkoop en ${number.format(total.resale)} in de resale.`}
        >
          {SUPPLY_SERIES.map((series) =>
            total[series.key] > 0 ? (
              <div key={series.key} style={{ background: series.color, flexGrow: total[series.key] }} className="min-w-0.5 basis-0" />
            ) : null
          )}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          {SUPPLY_SERIES.map((series) => (
            <li key={series.key} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: series.color }} />
              {series.label}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-xs font-heading uppercase tracking-wide text-muted-foreground">
          Per vak{rows.length > bars.length ? `, de ${bars.length} vakken met het meeste aanbod` : ""}
        </h3>
        {/* Op een smal scherm schuift de grafiek, zodat de vaknamen leesbaar blijven. */}
        <div className="mt-2 overflow-x-auto">
          <div className="h-64" style={{ minWidth: bars.length * 22 + 56 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
              <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.6} vertical={false} />
              <XAxis
                dataKey="area"
                interval={0}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                allowDecimals={false}
                ticks={ticks}
                domain={[0, ticks[ticks.length - 1]]}
                width={40}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(value: number) => number.format(value)}
              />
              <Tooltip cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }} content={<SupplyTooltip />} />
              {SUPPLY_SERIES.map((series, index) => (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  name={series.label}
                  stackId="aanbod"
                  fill={series.color}
                  maxBarSize={24}
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
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-heading uppercase tracking-wide text-muted-foreground">
          Als tabel
        </summary>
        <div className="mt-2 max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-heading uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pr-3">Vak</th>
                <th className="py-1.5 pr-3 text-right">Vrije verkoop</th>
                <th className="py-1.5 pr-3 text-right">Resale</th>
                <th className="py-1.5 text-right">Totaal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.area} className="border-t border-border">
                  <td className="py-1.5 pr-3">{row.area}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{number.format(row.free)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{number.format(row.resale)}</td>
                  <td className="py-1.5 text-right tabular-nums">{number.format(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
