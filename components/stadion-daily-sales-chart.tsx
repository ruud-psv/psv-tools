"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import tokens from "@psv/branding/tokens/tokens.json";
import { number } from "@/components/ticketing-stadion-parts";
import { buildDailyBars, DAILY_BARS_DAYS, offsetDateLabel, type DailyBarsRow } from "@/lib/ticketing-stadion/daily-bars";

/**
 * De verkoop per dag als staafdiagram: de laatste 28 dagen voor de aftrap.
 * Standaard alleen deze wedstrijd; elke wedstrijd waarmee je vergelijkt, krijgt
 * per dag een eigen staaf ernaast.
 *
 * Kleuren uit de PSV-tokens. Ze verschillen ook in helderheid, en de getallen
 * staan in de tooltip en de legenda, zodat niets aan kleur alleen hangt.
 */

export interface DailySalesSeries {
  id: string;
  name: string;
  /** Het seizoen, om dezelfde tegenstander uit elkaar te houden. */
  season?: string;
  eventDate: string;
  perOffset: Record<string, number>;
  /** Alleen voor een wedstrijd die nog komt: dagen tot de wedstrijd nu. */
  daysOut?: number;
}

/** Deze wedstrijd eerst, daarna de wedstrijden waarmee vergeleken wordt. */
const COLORS = [tokens.color.red.primary, tokens.color.gray["11"], tokens.color.gold, tokens.color.gray["09"]];

function label(series: DailySalesSeries): string {
  return series.season ? `${series.name} (${series.season})` : series.name;
}

function DayTooltip({
  active,
  payload,
  series,
}: {
  active?: boolean;
  payload?: { payload: DailyBarsRow }[];
  series: DailySalesSeries[];
}) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-heading uppercase tracking-wide">
        {row.offset === 0 ? "Wedstrijddag" : `${row.offset} ${row.offset === 1 ? "dag" : "dagen"} voor de wedstrijd`}
      </p>
      {series.map((entry, index) => (
        <p key={entry.id} className="mt-1 flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: COLORS[index % COLORS.length] }} />
          <span className="text-muted-foreground">
            {label(entry)} · {offsetDateLabel(entry.eventDate, row.offset)}:
          </span>
          <span className="font-bold tabular-nums">
            {row.values[entry.id] === null ? "nog niet" : number.format(row.values[entry.id] ?? 0)}
          </span>
        </p>
      ))}
    </div>
  );
}

export function StadionDailySalesChart({ series }: { series: DailySalesSeries[] }) {
  const bars = useMemo(() => buildDailyBars(series), [series]);
  const own = series[0];

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
        {series.map((entry, index) => (
          <li key={entry.id} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COLORS[index % COLORS.length] }} />
            <span className="font-medium">{label(entry)}</span>
            <span className="text-muted-foreground tabular-nums">
              {number.format(bars.inWindow[entry.id])} in deze {DAILY_BARS_DAYS} dagen · {number.format(bars.before[entry.id])}{" "}
              ervoor
            </span>
          </li>
        ))}
      </ul>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bars.rows} margin={{ top: 8, right: 8, bottom: 16, left: 0 }} barCategoryGap="18%" barGap={1}>
            <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.6} vertical={false} />
            <XAxis
              dataKey="offset"
              interval={0}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              // Elke week een getal, en de wedstrijddag zelf.
              tickFormatter={(offset: number) => (offset === 0 ? "dag" : offset % 7 === 0 ? `-${offset}` : "")}
              label={{
                value: "dagen tot de wedstrijd",
                position: "insideBottom",
                offset: -8,
                fontSize: 10,
                fill: "hsl(var(--muted-foreground))",
              }}
            />
            <YAxis
              allowDecimals={false}
              width={44}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(value: number) => number.format(value)}
            />
            <Tooltip cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }} content={<DayTooltip series={series} />} />
            {series.map((entry, index) => (
              <Bar
                key={entry.id}
                dataKey={(row: DailyBarsRow) => row.values[entry.id]}
                name={label(entry)}
                fill={COLORS[index % COLORS.length]}
                maxBarSize={18}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-muted-foreground">
        Verkochte kaarten per dag in de laatste {DAILY_BARS_DAYS} dagen voor de wedstrijd, zonder seizoenkaarten en
        vrijkaarten.
        {own?.daysOut !== undefined && own.daysOut > 0 && " Dagen die nog moeten komen, zijn leeg."}
      </p>
    </div>
  );
}
