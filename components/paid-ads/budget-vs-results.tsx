"use client";

import { useMemo } from "react";
import { budgetVersusResults } from "@/lib/paid-ads/derive";
import { eur, nl, pct, roas } from "@/lib/paid-ads/format";
import type { PaidAdsCampaign, PaidPlatform } from "@/lib/paid-ads/types";
import { Badge, EmptySection, HoverTip, SectionCard } from "./shared";
import { cn } from "@/lib/utils";

/**
 * Per groep het aandeel in het budget naast het aandeel in de conversies. Ligt
 * de rode balk duidelijk boven de donkere, dan kost die groep meer dan hij
 * oplevert. Twee vaste reeksen, dus een legenda in de kop.
 */
export function BudgetVsResults({
  title,
  campaigns,
  groupBy,
  labelFor,
  revenuePlatforms,
}: {
  title: string;
  campaigns: PaidAdsCampaign[];
  revenuePlatforms: PaidPlatform[];
  groupBy: (c: PaidAdsCampaign) => string | null;
  labelFor: (key: string) => string;
}) {
  const rows = useMemo(
    () => budgetVersusResults(campaigns, groupBy, labelFor, revenuePlatforms),
    [campaigns, groupBy, labelFor, revenuePlatforms]
  );

  return (
    <SectionCard
      title={title}
      hint="alleen lead-, registratie- en aankoopcampagnes"
      action={
        rows.length > 0 && (
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-psv-red-primary" />
              Aandeel budget
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-psv-neutralDark" />
              Aandeel conversies
            </span>
          </div>
        )
      }
    >
      {rows.length === 0 ? (
        <EmptySection>
          Verschijnt zodra er conversiecampagnes met resultaten zijn binnen deze selectie.
        </EmptySection>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <div key={r.key}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium">{r.label}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {r.roas != null && <span className="tabular-nums">ROAS {roas(r.roas)}</span>}
                  CPA <Badge tone={r.tone}>{eur(r.costPerResult, 2)}</Badge>
                </span>
              </div>
              <ShareBar
                share={r.spendShare}
                fill="bg-psv-red-primary"
                tip={`Budget: ${eur(r.spend)} · ${pct(r.spendShare, 1)}`}
              />
              <ShareBar
                share={r.resultShare}
                fill="bg-psv-neutralDark"
                tip={`Conversies: ${nl(r.results)} · ${pct(r.resultShare, 1)}`}
                className="mt-1"
              />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function ShareBar({
  share,
  fill,
  tip,
  className,
}: {
  share: number;
  fill: string;
  tip: string;
  className?: string;
}) {
  return (
    <HoverTip content={tip} className={className}>
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-sm bg-psv-gray-07">
          <div
            className={cn("h-full rounded-r-sm", fill)}
            style={{ width: `${Math.max(0, Math.min(100, share))}%` }}
          />
        </div>
        <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{pct(share, 0)}</span>
      </div>
    </HoverTip>
  );
}
