"use client";

import { useMemo } from "react";
import {
  forecastRows,
  targetRows,
} from "@/lib/paid-ads/derive";
import { eur, nl, pct } from "@/lib/paid-ads/format";
import {
  Badge,
  DataTable,
  EmptySection,
  SectionCard,
  Td,
  Th,
  TONE_MARK,
} from "./shared";
import type { PaidViewProps } from "./shared";

const fmt = { eur, nl, pct };

/**
 * Doelen en prognose: staan we op koers, en waar komen we uit aan het einde
 * van de periode. De CPA per exploitatie staat in het overzicht.
 */
export function ExecutiveView({ data, scored, totals }: PaidViewProps) {
  const targets = useMemo(() => targetRows(totals, data.targets, fmt), [totals, data.targets]);
  const forecast = useMemo(
    () => forecastRows(totals, data.period.daysElapsed, data.period.daysTotal),
    [totals, data.period]
  );
  const hasData = scored.length > 0;
  const hasTargets = targets.some((t) => t.target !== null);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* KPI's versus doelstelling */}
        <SectionCard
          title="KPI's versus doelstelling"
          hint={hasTargets ? undefined : "nog geen doelen vastgelegd"}
        >
          {!hasData ? (
            <EmptySection />
          ) : (
            <DataTable>
              <thead>
                <tr className="border-b border-border">
                  <Th className="pl-0">KPI</Th>
                  {/* Status zit in de kleur van de actuele waarde — een aparte
                      kolom past niet naast de funnel en de forecast. */}
                  <Th align="right">Actueel</Th>
                  <Th align="right" className="pr-0">Doel</Th>
                </tr>
              </thead>
              <tbody>
                {targets.map((t) => (
                  <tr key={t.label} className="border-b border-border/50 last:border-0">
                    <Td className="pl-0 text-muted-foreground">{t.label}</Td>
                    <Td align="right">
                      {t.onTrack === null ? (
                        <span className="font-medium">{t.actual}</span>
                      ) : (
                        <Badge
                          tone={t.onTrack ? "good" : "warn"}
                          title={t.onTrack ? "Op koers" : "Achter op doel"}
                        >
                          {TONE_MARK[t.onTrack ? "good" : "warn"]} {t.actual}
                        </Badge>
                      )}
                    </Td>
                    <Td align="right" className="pr-0 text-muted-foreground">{t.target ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </SectionCard>

        {/* Forecast */}
        <SectionCard
          title="Forecast einde periode"
          hint={`dag ${data.period.daysElapsed} van ${data.period.daysTotal} · lineaire projectie`}
        >
          {!hasData ? (
            <EmptySection />
          ) : (
            <DataTable>
              <thead>
                <tr className="border-b border-border">
                  <Th className="pl-0">KPI</Th>
                  <Th align="right">Huidig</Th>
                  <Th align="right" className="pr-0">Verwacht</Th>
                </tr>
              </thead>
              <tbody>
                {forecast.map((row) => {
                  const show = (v: number | null) =>
                    row.kind === "eur" ? eur(v) : row.kind === "eur2" ? eur(v, 2) : nl(v);
                  return (
                    <tr key={row.label} className="border-b border-border/50 last:border-0">
                      <Td className="pl-0 text-muted-foreground">{row.label}</Td>
                      <Td align="right" className="text-muted-foreground">{show(row.now)}</Td>
                      <Td align="right" className="pr-0 font-bold">{show(row.expected)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          )}
        </SectionCard>
      </div>

    </div>
  );
}
