"use client";

import { useMemo } from "react";
import {
  byAudienceType,
  demographicSplit,
  derive,
  saturation,
  toneForCpa,
  type DemographicRow,
} from "@/lib/paid-ads/derive";
import { eur, nl, pct, roas } from "@/lib/paid-ads/format";
import { AUDIENCE_LABELS, AudienceType, PaidTargeting } from "@/lib/paid-ads/types";
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

export function AudienceView({ data, avgCpa }: PaidViewProps) {
  const audiences = useMemo(() => byAudienceType(data.adSets), [data.adSets]);

  /** Advertentiesets met hun CPA, gesorteerd van goedkoop naar duur. */
  const adSets = useMemo(() => {
    const rows = data.adSets
      .map((s) => ({ ...s, derived: derive(s.metrics) }))
      .filter((s) => s.derived.costPerResult != null)
      .sort((a, b) => (a.derived.costPerResult ?? 0) - (b.derived.costPerResult ?? 0));
    const max = Math.max(...rows.map((r) => r.derived.costPerResult ?? 0), 1);
    return { rows, max };
  }, [data.adSets]);

  const demographics = useMemo(() => demographicSplit(data.demographics), [data.demographics]);

  // Retargeting en kleine doelgroepen raken het eerst verzadigd.
  const saturated = useMemo(() => saturation(data.adSets, 8), [data.adSets]);

  const maxAudienceCpa = useMemo(
    () => Math.max(...audiences.map((a) => a.derived.costPerResult ?? 0), 1),
    [audiences]
  );

  return (
    <div className="space-y-6">
      {/* Audience efficiency */}
      <SectionCard
        title="Audience efficiency"
        hint="broad versus lookalike versus CRM versus retargeting"
      >
        {audiences.length === 0 ? (
          <EmptySection>
            Doelgroeptypes verschijnen zodra advertentiesets met een doelgroeplabel binnenkomen.
          </EmptySection>
        ) : (
          <DataTable>
            <thead>
              <tr className="border-b border-border">
                <Th className="pl-0">Doelgroeptype</Th>
                <Th className="min-w-[160px]">CPA</Th>
                <Th align="right">CTR</Th>
                <Th align="right">CVR</Th>
                <Th align="right" className="pr-0">Besteed</Th>
              </tr>
            </thead>
            <tbody>
              {audiences.map((a) => {
                const tone = toneForCpa(a.derived.costPerResult, avgCpa);
                return (
                  <tr key={a.key} className="border-b border-border/50 last:border-0 hover:bg-muted/40">
                    <Td className="whitespace-nowrap pl-0 font-medium">
                      {AUDIENCE_LABELS[a.key as AudienceType] ?? a.label}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <BarRow
                          width={((a.derived.costPerResult ?? 0) / maxAudienceCpa) * 100}
                          tone={tone}
                        />
                        <Badge tone={tone}>{eur(a.derived.costPerResult, 2)}</Badge>
                      </div>
                    </Td>
                    <Td align="right">{pct(a.derived.ctr)}</Td>
                    <Td align="right">{pct(a.derived.cvr)}</Td>
                    <Td align="right" className="whitespace-nowrap pr-0 text-muted-foreground">
                      {eur(a.metrics.spend)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* CPA per advertentieset */}
        <SectionCard title="Doelgroep & CPA per advertentieset" hint="met de ingestelde targeting (Meta)">
          {adSets.rows.length === 0 ? (
            <EmptySection />
          ) : (
            <>
              <div className="space-y-2.5">
                {adSets.rows.map((s) => {
                  const tone = toneForCpa(s.derived.costPerResult, avgCpa);
                  return (
                    <div key={s.id} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex justify-between gap-3 text-sm">
                          <span className="truncate text-muted-foreground">{s.name}</span>
                          <Badge tone={tone}>{eur(s.derived.costPerResult, 2)}</Badge>
                        </div>
                        <div className="relative flex">
                          <BarRow
                            width={((s.derived.costPerResult ?? 0) / adSets.max) * 100}
                            tone={tone}
                          />
                          {/* Streepje op de gemiddelde CPA over alle campagnes. */}
                          {avgCpa != null && (
                            <span
                              className="absolute -top-0.5 bottom-[-2px] w-px bg-psv-gray-10"
                              style={{ left: `${Math.min(100, (avgCpa / adSets.max) * 100)}%` }}
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
              {avgCpa != null && (
                <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="h-3 w-px bg-psv-gray-10" />
                  Gemiddelde kosten per resultaat: {eur(avgCpa, 2)}
                </p>
              )}
            </>
          )}
        </SectionCard>

        {/* Verzadiging per advertentieset */}
        <SectionCard title="Verzadiging per advertentieset" hint="frequentie · hoe vaak dezelfde persoon de advertentie zag">
          {saturated.length === 0 ? (
            <EmptySection>
              Frequentie is beschikbaar zodra een platform bereik én weergaven per advertentieset
              rapporteert.
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
                      {/* Schaal tot 8: daarboven is elke advertentieset verzadigd. */}
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
      </div>

      {/* Leeftijd en geslacht */}
      <SectionCard
        title="Prestaties per leeftijd en geslacht"
        hint="binnen de huidige selectie · kies een advertentieset om één doelgroep te bekijken"
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
