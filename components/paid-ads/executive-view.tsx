"use client";

import { useMemo } from "react";
import {
  businessUnitPerformance,
  byPlatform,
  forecastRows,
  funnelSteps,
  targetRows,
} from "@/lib/paid-ads/derive";
import { eur, nl, pct } from "@/lib/paid-ads/format";
import {
  Badge,
  DataTable,
  EmptySection,
  PLATFORM_DOT,
  SectionCard,
  Td,
  Th,
  TONE_MARK,
  VolumeBar,
} from "./shared";
import type { PaidViewProps } from "./shared";
import { PerformanceQuadrant } from "./performance-quadrant";
import { PaidPlatform } from "@/lib/paid-ads/types";
import { cn } from "@/lib/utils";

const fmt = { eur, nl, pct };

export function ExecutiveView({ data, scored, totals, avgCpa }: PaidViewProps) {
  const targets = useMemo(() => targetRows(totals, data.targets, fmt), [totals, data.targets]);
  const funnel = useMemo(() => funnelSteps(totals, fmt), [totals]);
  const forecast = useMemo(
    () => forecastRows(totals, data.period.daysElapsed, data.period.daysTotal),
    [totals, data.period]
  );
  const units = useMemo(
    () => businessUnitPerformance(scored, data.targets),
    [scored, data.targets]
  );
  const platforms = useMemo(() => byPlatform(scored), [scored]);
  const hasData = scored.length > 0;
  const hasTargets = targets.some((t) => t.target !== null);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:grid-cols-3">
        {/* Pas bij 2xl drie naast elkaar: daaronder wordt de doeltabel te smal. */}
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

        {/* Funnel health */}
        <SectionCard title="Funnel health" hint="waar valt het verkeer weg">
          {!hasData ? (
            <EmptySection />
          ) : (
            <div className="space-y-2">
              {funnel.map((step) => (
                <div key={step.label}>
                  <p className="h-4 text-[10px] text-muted-foreground">{step.step ?? ""}</p>
                  <div className="flex items-center gap-3">
                    <div
                      className="h-9 rounded-sm bg-psv-red-primary/90"
                      style={{ width: `${step.width}%`, minWidth: "6%" }}
                    />
                    <div className="min-w-0">
                      <p className="font-heading text-lg uppercase leading-none">{nl(step.value)}</p>
                      <p className="text-xs text-muted-foreground">{step.label}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
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

      {/* Prestatie per exploitatie */}
      <SectionCard title="Prestatie per exploitatie" hint="index 100 = op doelstelling">
        {units.length === 0 ? (
          <EmptySection />
        ) : (
          <DataTable>
            <thead>
              <tr className="border-b border-border">
                <Th className="pl-0">Exploitatie</Th>
                <Th className="min-w-[160px]">Besteed</Th>
                <Th align="right">Resultaten</Th>
                <Th align="right">CPA</Th>
                <Th align="right">Doel</Th>
                <Th align="right">Index</Th>
                <Th align="right" className="pr-0">Status</Th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.key} className="border-b border-border/50 last:border-0 hover:bg-muted/40">
                  <Td className="whitespace-nowrap pl-0 font-medium">{u.label}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <VolumeBar width={u.spendShare} />
                      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                        {eur(u.metrics.spend)}
                      </span>
                    </div>
                  </Td>
                  <Td align="right">{nl(u.metrics.results)}</Td>
                  <Td align="right" className="whitespace-nowrap">{eur(u.derived.costPerResult, 2)}</Td>
                  <Td align="right" className="whitespace-nowrap text-muted-foreground">
                    {u.target != null ? `≤ ${eur(u.target, 2)}` : "—"}
                  </Td>
                  <Td align="right">
                    {u.index != null ? <Badge tone={u.tone}>{u.index}%</Badge> : "—"}
                  </Td>
                  <Td align="right" className="pr-0">
                    <Badge tone={u.tone}>{u.status}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PerformanceQuadrant scored={scored} avgCpa={avgCpa} />

        {/* Verdeling besteed bedrag */}
        <SectionCard title="Verdeling besteed bedrag">
          {platforms.length === 0 ? (
            <EmptySection />
          ) : (
            <>
              <div className="mb-5 flex h-3.5 overflow-hidden rounded-sm">
                {platforms.map((p) => (
                  <div
                    key={p.key}
                    title={`${p.label} — ${pct(p.spendShare, 1)}`}
                    className={cn("h-full", PLATFORM_DOT[p.key as PaidPlatform])}
                    style={{ width: `${p.spendShare}%` }}
                  />
                ))}
              </div>
              <div className="space-y-3">
                {platforms.map((p) => (
                  <div key={p.key} className="flex items-center gap-3 text-sm">
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", PLATFORM_DOT[p.key as PaidPlatform])} />
                    <span className="flex-1 text-muted-foreground">{p.label}</span>
                    <span className="tabular-nums text-muted-foreground">{eur(p.metrics.spend)}</span>
                    <span className="w-14 text-right font-bold tabular-nums">{pct(p.spendShare, 1)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
