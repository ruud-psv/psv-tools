"use client";

import { useMemo } from "react";
import { byAudienceType, derive, toneForCpa } from "@/lib/paid-ads/derive";
import { eur, nl, pct } from "@/lib/paid-ads/format";
import { AUDIENCE_LABELS, AudienceType } from "@/lib/paid-ads/types";
import {
  Badge,
  BarRow,
  DataTable,
  EmptySection,
  SectionCard,
  Td,
  Th,
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
        <SectionCard title="CPA per advertentieset" hint="advertentiesetniveau">
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

        {/* Audience overlap */}
        <SectionCard title="Audience overlap" hint="dubbel bereikte mensen">
          {data.audienceOverlap.length === 0 ? (
            <EmptySection>
              Overlap komt niet uit de rapportage-API&apos;s; die vraagt een aparte export uit
              Meta Audience Overlap.
            </EmptySection>
          ) : (
            <div className="space-y-3.5">
              {data.audienceOverlap.map((o) => {
                const tone = o.percentage >= 30 ? "bad" : o.percentage >= 15 ? "warn" : "good";
                return (
                  <div key={o.label}>
                    <div className="mb-1.5 flex justify-between gap-3 text-sm">
                      <span className="truncate text-muted-foreground">{o.label}</span>
                      <Badge tone={tone}>{nl(o.percentage)}%</Badge>
                    </div>
                    <div className="flex">
                      {/* Schaal tot 50%: daarboven overlappen doelgroepen structureel. */}
                      <BarRow width={(o.percentage / 50) * 100} tone={tone} className="h-2" />
                    </div>
                    {o.note && <p className="mt-1 text-[10px] text-muted-foreground">{o.note}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
