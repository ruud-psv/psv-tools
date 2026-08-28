"use client";

import { useMemo } from "react";
import { quadrant } from "@/lib/paid-ads/derive";
import { eur, nl } from "@/lib/paid-ads/format";
import { PLATFORM_LABELS, PaidPlatform } from "@/lib/paid-ads/types";
import { EmptySection, PLATFORM_DOT, SectionCard } from "./shared";
import type { PaidViewProps } from "./shared";
import { cn } from "@/lib/utils";

/** Hoeken van het kwadrant, met de betekenis erbij. */
const CORNERS = [
  { name: "Sterren", hint: "veel conversies · lage CPA", pos: "left-2 top-2" },
  { name: "Schalen", hint: "veel conversies · hoge CPA", pos: "right-2 top-2 text-right" },
  { name: "Testen", hint: "weinig conversies · lage CPA", pos: "left-2 bottom-2" },
  { name: "Stoppen", hint: "weinig conversies · hoge CPA", pos: "right-2 bottom-2 text-right" },
];

export function PerformanceQuadrant({ scored, avgCpa }: Pick<PaidViewProps, "scored" | "avgCpa">) {
  const q = useMemo(() => quadrant(scored, avgCpa), [scored, avgCpa]);

  const platforms = useMemo(() => {
    const seen = new Set<PaidPlatform>();
    for (const p of q?.points ?? []) seen.add(p.platform);
    return [...seen];
  }, [q]);

  return (
    <SectionCard
      title="Performance quadrant"
      hint="CPA × conversies · bolgrootte = bereik"
      action={
        platforms.length > 0 && (
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {platforms.map((p) => (
              <span key={p} className="flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-full", PLATFORM_DOT[p])} />
                {PLATFORM_LABELS[p]}
              </span>
            ))}
          </div>
        )
      }
    >
      {!q ? (
        <EmptySection>
          Minimaal drie conversiecampagnes nodig om het kwadrant te tekenen.
        </EmptySection>
      ) : (
        <div className="flex gap-2">
          {/* Y-as: aantal conversies */}
          <div className="flex h-64 flex-col justify-between text-right text-[10px] text-muted-foreground">
            {[1, 0.75, 0.5, 0.25, 0].map((f) => (
              <span key={f}>{nl(Math.round(q.maxResults * f))}</span>
            ))}
          </div>

          <div className="min-w-0 flex-1">
            <div className="relative h-64 overflow-hidden border-b border-l border-border bg-muted/30">
              {/* Scheidslijnen: gemiddelde CPA en mediaan aantal conversies */}
              <div
                className="absolute bottom-0 top-0 w-px bg-psv-gray-08"
                style={{ left: `${(q.splitCpa / q.maxCpa) * 100}%` }}
              />
              <div
                className="absolute left-0 right-0 h-px bg-psv-gray-08"
                style={{ bottom: `${(q.splitResults / q.maxResults) * 100}%` }}
              />

              {CORNERS.map((c) => (
                <div key={c.name} className={cn("pointer-events-none absolute", c.pos)}>
                  <p className="font-heading text-sm uppercase tracking-wider text-psv-gray-08">
                    {c.name}
                  </p>
                  <p className="text-[9px] text-psv-gray-08">{c.hint}</p>
                </div>
              ))}

              {q.points.map((p) => {
                // Bolgrootte schaalt met de wortel van het bereik, zodat het
                // oppervlak (en niet de diameter) het bereik weergeeft.
                const size = 14 + Math.sqrt(p.reach / q.maxReach) * 26;
                return (
                  <div
                    key={p.id}
                    title={`${p.name} — CPA ${eur(p.costPerResult, 2)} · ${nl(p.results)} conversies · ${eur(p.spend)} besteed`}
                    className={cn(
                      "absolute rounded-full border-2 border-card opacity-70 transition-opacity hover:opacity-100",
                      PLATFORM_DOT[p.platform]
                    )}
                    style={{
                      left: `${Math.min(96, (p.costPerResult / q.maxCpa) * 100)}%`,
                      bottom: `${Math.min(93, (p.results / q.maxResults) * 100)}%`,
                      width: size,
                      height: size,
                      transform: "translate(-50%, 50%)",
                    }}
                  />
                );
              })}
            </div>

            {/* X-as: kosten per resultaat */}
            <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
              {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                <span key={f}>{eur(q.maxCpa * f, 0)}</span>
              ))}
            </div>
            <p className="mt-1 text-center text-[10px] text-muted-foreground">
              Kosten per resultaat — alleen lead-, registratie- en aankoopcampagnes
            </p>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
