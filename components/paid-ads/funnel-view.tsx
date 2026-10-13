"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import { byPhase, type DerivedMetrics } from "@/lib/paid-ads/derive";
import { eur, nl, pct } from "@/lib/paid-ads/format";
import { PaidAdsCampaign, PaidPhase, PHASE_LABELS } from "@/lib/paid-ads/types";
import { EmptySection, PHASE_FILL, SectionCard, SegmentBar } from "./shared";
import { cn } from "@/lib/utils";

const PHASES: PaidPhase[] = ["bereik", "verkeer", "conversie"];

/**
 * De funnel versmalt per fase; op smalle schermen minder sterk, zodat de tekst
 * in de onderste bak blijft passen.
 */
const STAGE_WIDTH: Record<PaidPhase, string> = {
  bereik: "w-full",
  verkeer: "w-[90%] sm:w-[84%]",
  conversie: "w-[80%] sm:w-[68%]",
};

/** Schuine zijkanten: elke bak loopt onderaan iets in, als een trechter. */
const TRAPEZOID = "polygon(0 0, 100% 0, calc(100% - 18px) 100%, 18px 100%)";

/**
 * Per fase de uitkomst waar die fase op stuurt, met de bijbehorende kosten.
 * Google Ads rapporteert geen bereik; dan vallen we terug op weergaven.
 */
function phaseOutcome(phase: PaidPhase, d: DerivedMetrics) {
  if (phase === "bereik") {
    return d.reach > 0
      ? { value: nl(d.reach), label: "bereikt", cost: `CPM ${eur(d.cpm, 2)}` }
      : { value: nl(d.impressions), label: "weergaven", cost: `CPM ${eur(d.cpm, 2)}` };
  }
  if (phase === "verkeer") {
    return { value: nl(d.clicks), label: "clicks", cost: `CPC ${eur(d.cpc, 2)}` };
  }
  return { value: nl(d.results), label: "resultaten", cost: `CPA ${eur(d.costPerResult, 2)}` };
}

/**
 * De funnelbakken bereik, verkeer en conversie onder elkaar, met hoe het budget
 * over de bakken verdeeld is. Een bak aanklikken filtert het hele dashboard op
 * die fase. Krijgt de campagnes na alle filters behalve de fase, zodat de
 * funnel altijd alle drie de bakken naast elkaar laat zien.
 */
export function FunnelOverview({
  campaigns,
  active,
  onSelect,
}: {
  campaigns: PaidAdsCampaign[];
  active: PaidPhase | "alles";
  onSelect: (phase: PaidPhase | "alles") => void;
}) {
  const stages = useMemo(() => {
    const rows = byPhase(campaigns);
    return PHASES.map((phase) => {
      const row = rows.find((r) => r.key === phase);
      return {
        phase,
        count: campaigns.filter((c) => c.phase === phase).length,
        spendShare: row?.spendShare ?? 0,
        derived: row?.derived ?? null,
      };
    });
  }, [campaigns]);

  const totalSpend = stages.reduce((sum, s) => sum + (s.derived?.spend ?? 0), 0);
  const filtered = active !== "alles";

  return (
    <SectionCard
      title="Funnelverdeling"
      hint={
        active !== "alles"
          ? `Gefilterd op ${PHASE_LABELS[active].toLowerCase()} · klik nogmaals om op te heffen`
          : "Klik op een fase om het dashboard te filteren"
      }
      action={
        filtered && (
          <button
            onClick={() => onSelect("alles")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-heading text-xs uppercase tracking-wide transition-colors hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
            Alle fases
          </button>
        )
      }
    >
      {campaigns.length === 0 ? (
        <EmptySection>De funnel verschijnt zodra er campagnedata is voor deze selectie.</EmptySection>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          {/* De bakken */}
          <div className="flex flex-col items-center gap-1.5">
            {stages.map((stage) => {
              const isActive = active === stage.phase;
              const outcome = stage.derived ? phaseOutcome(stage.phase, stage.derived) : null;
              return (
                <button
                  key={stage.phase}
                  onClick={() => onSelect(isActive ? "alles" : stage.phase)}
                  disabled={stage.count === 0 && !isActive}
                  aria-pressed={isActive}
                  style={{ clipPath: TRAPEZOID }}
                  className={cn(
                    "px-7 py-3.5 text-left text-white transition-opacity disabled:cursor-not-allowed sm:px-9",
                    STAGE_WIDTH[stage.phase],
                    PHASE_FILL[stage.phase],
                    filtered && !isActive ? "opacity-35 hover:opacity-60" : "hover:opacity-90"
                  )}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-heading text-base uppercase tracking-wide">
                      {PHASE_LABELS[stage.phase]}
                    </p>
                    <p className="text-xs">
                      {nl(stage.count)} {stage.count === 1 ? "campagne" : "campagnes"}
                    </p>
                  </div>
                  {outcome ? (
                    <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="font-heading text-2xl uppercase leading-none">
                        {outcome.value}{" "}
                        <span className="text-xs tracking-wide">{outcome.label}</span>
                      </p>
                      <p className="text-xs tabular-nums">
                        {eur(stage.derived!.spend)} · {outcome.cost}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs">Geen campagnes in deze fase</p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Budgetverdeling over de bakken */}
          <div>
            <p className="mb-2 font-heading text-xs uppercase tracking-wide text-muted-foreground">
              Budgetverdeling
            </p>
            <SegmentBar
              segments={stages.map((stage) => ({
                key: stage.phase,
                share: stage.spendShare,
                fill: PHASE_FILL[stage.phase],
                tip: `${PHASE_LABELS[stage.phase]} — ${eur(stage.derived?.spend ?? 0)} · ${pct(stage.spendShare, 0)}`,
              }))}
            />
            <ul className="mt-3 space-y-2">
              {stages.map((stage) => (
                <li key={stage.phase} className="flex items-center gap-2 text-sm">
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", PHASE_FILL[stage.phase])} />
                  <span className="text-muted-foreground">{PHASE_LABELS[stage.phase]}</span>
                  <span className="ml-auto tabular-nums">{eur(stage.derived?.spend ?? 0)}</span>
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                    {pct(stage.spendShare, 0)}
                  </span>
                </li>
              ))}
              <li className="flex items-center gap-2 border-t border-border pt-2 text-sm font-semibold">
                <span>Totaal</span>
                <span className="ml-auto tabular-nums">{eur(totalSpend)}</span>
                <span className="w-10" />
              </li>
            </ul>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
