"use client";

import { useMemo } from "react";
import {
  demographicSplit,
  derive,
  toneForCpa,
  type DemographicRow,
} from "@/lib/paid-ads/derive";
import { eur, nl, pct, roas } from "@/lib/paid-ads/format";
import { AUDIENCE_LABELS, PaidTargeting } from "@/lib/paid-ads/types";
import {
  Badge,
  BarRow,
  DataTable,
  EmptySection,
  SectionCard,
  Td,
  Th,
  VolumeBar,
} from "./shared";
import type { PaidViewProps } from "./shared";

/**
 * De doelgroepen: wie elke advertentieset bereikt en wat dat kost, per
 * exploitatie, en de prestaties per leeftijd en geslacht.
 */
export function AudienceView({ data }: PaidViewProps) {
  /**
   * Advertentiesets met hun CPA per exploitatie, van goedkoop naar duur. De
   * kleur zegt hoe een set zich verhoudt tot het gemiddelde van zijn eigen
   * exploitatie: een ticketingset staat niet naast een PSV Connect-set.
   */
  const groups = useMemo(() => {
    const unitOf = new Map(data.campaigns.map((c) => [`${c.platform}:${c.id}`, c.businessUnit]));
    const byUnit = new Map<string, (typeof data.adSets[number] & { derived: ReturnType<typeof derive> })[]>();
    for (const s of data.adSets) {
      const derived = derive(s.metrics);
      if (derived.costPerResult == null) continue;
      const unit = unitOf.get(`${s.platform}:${s.campaignId}`) ?? "Overig";
      byUnit.set(unit, [...(byUnit.get(unit) ?? []), { ...s, derived }]);
    }
    return [...byUnit.entries()]
      .map(([unit, rows]) => {
        const spend = rows.reduce((sum, r) => sum + r.metrics.spend, 0);
        const results = rows.reduce((sum, r) => sum + r.metrics.results, 0);
        return {
          unit,
          spend,
          avg: results > 0 ? spend / results : null,
          max: Math.max(...rows.map((r) => r.derived.costPerResult ?? 0), 1),
          rows: rows.sort((a, b) => (a.derived.costPerResult ?? 0) - (b.derived.costPerResult ?? 0)),
        };
      })
      .sort((a, b) => b.spend - a.spend);
  }, [data]);

  const demographics = useMemo(() => demographicSplit(data.demographics), [data.demographics]);

  return (
    <div className="space-y-6">
      {/* CPA per advertentieset, per exploitatie */}
      <SectionCard
        title="Doelgroep & CPA per advertentieset"
        hint="per exploitatie, met de ingestelde targeting (Meta) · streepje is het gemiddelde van de exploitatie"
      >
        {groups.length === 0 ? (
          <EmptySection />
        ) : (
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2">
            {groups.map((g) => (
              <div key={g.unit}>
                <p className="mb-2 font-heading text-xs uppercase tracking-wide text-muted-foreground">
                  {g.unit}
                  {g.avg != null && <span className="ml-2 normal-case tracking-normal">gemiddeld {eur(g.avg, 2)}</span>}
                </p>
                <div className="space-y-2.5">
                  {g.rows.map((s) => {
                    const tone = toneForCpa(s.derived.costPerResult, g.avg);
                    return (
                      <div key={`${s.platform}-${s.id}`} className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex justify-between gap-3 text-sm">
                            <span className="truncate text-muted-foreground">{s.name}</span>
                            <Badge tone={tone}>{eur(s.derived.costPerResult, 2)}</Badge>
                          </div>
                          <div className="relative flex">
                            <BarRow width={((s.derived.costPerResult ?? 0) / g.max) * 100} tone={tone} />
                            {g.avg != null && (
                              <span
                                className="absolute -top-0.5 bottom-[-2px] w-px bg-psv-gray-10"
                                style={{ left: `${Math.min(100, (g.avg / g.max) * 100)}%` }}
                              />
                            )}
                          </div>
                          {s.targeting && <TargetingLine targeting={s.targeting} />}
                        </div>
                        <span className="w-20 truncate text-right text-[10px] text-muted-foreground">
                          {s.audienceType ? AUDIENCE_LABELS[s.audienceType] : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Leeftijd en geslacht */}
      <SectionCard
        title="Prestaties per leeftijd en geslacht"
        hint="binnen de huidige selectie · kies een exploitatie of advertentieset om één doelgroep te bekijken"
      >
        {demographics.byAge.length === 0 ? (
          <EmptySection>
            Verschijnt zodra Meta-advertentiesets binnen deze selectie vallen. De andere platformen
            leveren deze uitsplitsing nog niet.
          </EmptySection>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
            <DemographicTable title="Leeftijd" rows={demographics.byAge} />
            <DemographicTable title="Geslacht" rows={demographics.byGender} />
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/** Eén regel met wie een advertentieset bereikt. */
function TargetingLine({ targeting: t }: { targeting: PaidTargeting }) {
  const parts = [
    t.audiences.length > 0 && `Doelgroepen: ${t.audiences.join(", ")}`,
    t.excluded.length > 0 && `Uitgesloten: ${t.excluded.join(", ")}`,
    t.interests.length > 0 && `Interesses: ${t.interests.join(", ")}`,
    t.age,
    t.gender,
    t.locations.length > 0 && t.locations.join(", "),
    t.expanded && "Advantage+ mag verbreden",
  ].filter((p): p is string => Boolean(p));
  if (parts.length === 0) return null;
  const text = parts.join(" · ");
  return (
    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground" title={text}>
      {text}
    </p>
  );
}

function DemographicTable({ title, rows }: { title: string; rows: DemographicRow[] }) {
  return (
    <DataTable>
      <thead>
        <tr className="border-b border-border">
          <Th className="pl-0">{title}</Th>
          <Th className="min-w-[120px]">Aandeel budget</Th>
          <Th align="right">Resultaten</Th>
          <Th align="right">ROAS</Th>
          <Th align="right" className="pr-0">CPA</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b border-border/50 last:border-0 hover:bg-muted/40">
            <Td className="whitespace-nowrap pl-0 font-medium">{r.label}</Td>
            <Td>
              <div className="flex items-center gap-2">
                <VolumeBar width={r.spendShare} />
                <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                  {pct(r.spendShare, 0)}
                </span>
              </div>
            </Td>
            <Td align="right">{nl(r.metrics.results)}</Td>
            <Td align="right">{roas(r.derived.roas)}</Td>
            <Td align="right" className="pr-0">
              <Badge tone={r.tone}>{eur(r.derived.costPerResult, 2)}</Badge>
            </Td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
