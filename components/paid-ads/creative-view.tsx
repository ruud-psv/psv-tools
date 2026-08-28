"use client";

import { useMemo } from "react";
import { byFormat, hookPerformance, saturation, toneForCpa } from "@/lib/paid-ads/derive";
import { eur, nl, pct } from "@/lib/paid-ads/format";
import { Badge, BarRow, EmptySection, SectionCard, VolumeBar } from "./shared";
import type { PaidViewProps } from "./shared";

export function CreativeView({ data, scored, avgCpa }: PaidViewProps) {
  const formats = useMemo(() => byFormat(data.ads), [data.ads]);
  const maxFormatResults = useMemo(
    () => Math.max(...formats.map((f) => f.metrics.results), 1),
    [formats]
  );
  const saturated = useMemo(() => saturation(scored), [scored]);
  const hooks = useMemo(() => hookPerformance(data.ads, avgCpa), [data.ads, avgCpa]);
  const maxHookRate = useMemo(() => Math.max(...hooks.map((h) => h.rate ?? 0), 1), [hooks]);

  return (
    <div className="space-y-6">
      {/* Format performance */}
      <SectionCard title="Format performance" hint="welk format levert het resultaat op">
        {formats.length === 0 ? (
          <EmptySection>
            Formats verschijnen zodra advertenties met een formatlabel binnenkomen.
          </EmptySection>
        ) : (
          <div className="grid grid-cols-[1.6fr_repeat(4,minmax(72px,0.55fr))] items-center gap-x-4 gap-y-3">
            <p className="font-heading text-[10px] uppercase tracking-wider text-muted-foreground">Format</p>
            <p className="text-right font-heading text-[10px] uppercase tracking-wider text-muted-foreground">CTR</p>
            <p className="text-right font-heading text-[10px] uppercase tracking-wider text-muted-foreground">CVR</p>
            <p className="text-right font-heading text-[10px] uppercase tracking-wider text-muted-foreground">CPA</p>
            <p className="text-right font-heading text-[10px] uppercase tracking-wider text-muted-foreground">Besteed</p>

            {formats.map((f) => (
              <FormatRow
                key={f.key}
                label={f.label}
                results={f.metrics.results}
                width={(f.metrics.results / maxFormatResults) * 100}
                ctr={f.derived.ctr}
                cvr={f.derived.cvr}
                cpa={f.derived.costPerResult}
                spend={f.metrics.spend}
                avgCpa={avgCpa}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Saturation monitor */}
        <SectionCard title="Saturation monitor" hint="frequentie per campagne">
          {saturated.length === 0 ? (
            <EmptySection>
              Frequentie is beschikbaar zodra een platform bereik én weergaven rapporteert.
            </EmptySection>
          ) : (
            <>
              <div className="space-y-3">
                {saturated.map((s) => (
                  <div key={`${s.platform}-${s.name}`}>
                    <div className="mb-1.5 flex justify-between gap-3 text-sm">
                      <span className="truncate text-muted-foreground">
                        {s.name} <span className="text-psv-gray-09">· {s.platform}</span>
                      </span>
                      <Badge tone={s.tone}>{nl(s.frequency, 2)}</Badge>
                    </div>
                    <div className="flex">
                      {/* Schaal tot 8: daarboven is elke campagne verzadigd. */}
                      <BarRow width={(s.frequency / 8) * 100} tone={s.tone} />
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">{s.status}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Groen onder 3,0 · oranje 3,0-6,0 · rood boven 6,0
              </p>
            </>
          )}
        </SectionCard>

        {/* Hook performance */}
        <SectionCard title="Hook performance" hint="kijkt langer dan 3 seconden">
          {hooks.length === 0 ? (
            <EmptySection>
              Hooks verschijnen zodra videoadvertenties een hooklabel en 3-secondenweergaven meesturen.
            </EmptySection>
          ) : (
            <div className="space-y-3.5">
              {hooks.map((h) => (
                <div key={h.label}>
                  <div className="mb-1.5 flex justify-between gap-3 text-sm">
                    <span className="truncate text-muted-foreground">{h.label}</span>
                    <span className="font-semibold tabular-nums">{pct(h.rate, 1)}</span>
                  </div>
                  <div className="flex">
                    <BarRow width={((h.rate ?? 0) / maxHookRate) * 100} tone={h.tone} className="h-2" />
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">CPA {eur(h.costPerResult, 2)}</p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function FormatRow({
  label,
  results,
  width,
  ctr,
  cvr,
  cpa,
  spend,
  avgCpa,
}: {
  label: string;
  results: number;
  width: number;
  ctr: number | null;
  cvr: number | null;
  cpa: number | null;
  spend: number;
  avgCpa: number | null;
}) {
  return (
    <>
      <div className="min-w-0">
        <div className="mb-1 flex justify-between gap-3 text-sm">
          <span className="truncate text-muted-foreground">{label}</span>
          <span className="font-semibold tabular-nums">{nl(results)}</span>
        </div>
        <div className="flex">
          <VolumeBar width={width} />
        </div>
      </div>
      <p className="text-right text-sm tabular-nums">{pct(ctr)}</p>
      <p className="text-right text-sm tabular-nums">{pct(cvr)}</p>
      <p className="text-right">
        <Badge tone={toneForCpa(cpa, avgCpa)}>{eur(cpa, 2)}</Badge>
      </p>
      <p className="text-right text-sm tabular-nums text-muted-foreground">{eur(spend)}</p>
    </>
  );
}
