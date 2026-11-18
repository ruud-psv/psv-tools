"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  scoreWeightsLabel,
  winnersAndLosers,
} from "@/lib/paid-ads/derive";
import { eur, eurShort, nl, pct, roas, shortDate } from "@/lib/paid-ads/format";
import { PaidPhase, PHASE_LABELS, PLATFORM_LABELS } from "@/lib/paid-ads/types";
import {
  Badge,
  CHART,
  CHART_TOOLTIP,
  DataTable,
  EmptySection,
  HoverTip,
  PHASE_FILL,
  SectionCard,
  Td,
  Th,
  TONE_BADGE,
} from "./shared";
import type { PaidViewProps } from "./shared";
import { cn } from "@/lib/utils";

/** Gedeelde opmaak van de assen: haarlijnen, recessief. */
const AXIS = { tick: { fontSize: 11 }, stroke: CHART.axis, tickLine: false } as const;

/**
 * De campagnes in het kort: welke campagnes er lopen en wat ze kosten en
 * opleveren, de winnaars en verliezers per exploitatie, en het verloop per
 * dag. Bewust zonder de diepere analyses; die staan in Ads Manager.
 */
export function CampaignView({ data, scored }: PaidViewProps) {
  const daily = useMemo(
    () => data.daily.map((d) => ({ ...d, label: shortDate(d.date) })),
    [data.daily]
  );
  const highlights = useMemo(() => winnersAndLosers(scored, { eur, pct }), [scored]);

  return (
    <div className="space-y-6">
      {/* Campagnetabel */}
      <SectionCard
        title="Campagnes"
        hint={`${scored.length} ${scored.length === 1 ? "campagne" : "campagnes"}`}
      >
        {scored.length === 0 ? (
          <EmptySection />
        ) : (
          <>
          <ScoreExplainer />
          <DataTable>
            <thead>
              <tr className="border-b border-t border-border">
                <Th className="pl-0">Campagne</Th>
                <Th align="right">Score</Th>
                <Th>Exploitatie</Th>
                <Th>Platform</Th>
                <Th>Fase</Th>
                <Th align="right">Resultaten</Th>
                <Th align="right">Kosten / res.</Th>
                <Th align="right">Conv.waarde</Th>
                <Th align="right">ROAS</Th>
                <Th align="right" className="pr-0">Besteed</Th>
              </tr>
            </thead>
            <tbody>
              {scored.map((c) => (
                <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40">
                  <Td className="pl-0 font-medium">{c.name}</Td>
                  <Td align="right">
                    <HoverTip
                      className="inline-block"
                      content={
                        c.score != null
                          ? `Ten opzichte van ${PHASE_LABELS[c.phase].toLowerCase()}campagnes van ${c.businessUnit} · ${scoreWeightsLabel(c.phase)}`
                          : `Geen andere ${PHASE_LABELS[c.phase].toLowerCase()}campagne van ${c.businessUnit} om mee te vergelijken`
                      }
                    >
                      {c.score != null ? <Badge tone={c.scoreTone}>{c.score}</Badge> : "—"}
                    </HoverTip>
                  </Td>
                  <Td className="text-muted-foreground">{c.businessUnit}</Td>
                  <Td className="text-muted-foreground">{PLATFORM_LABELS[c.platform]}</Td>
                  <Td><PhaseTag phase={c.phase} /></Td>
                  <Td align="right">{nl(c.metrics.results)}</Td>
                  <Td align="right" className="text-muted-foreground">{eur(c.derived.costPerResult, 2)}</Td>
                  <Td align="right">{c.metrics.revenue > 0 ? eur(c.metrics.revenue) : "—"}</Td>
                  <Td align="right">{roas(c.derived.roas)}</Td>
                  <Td align="right" className="pr-0 font-semibold">{eur(c.metrics.spend)}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          </>
        )}
      </SectionCard>

      {/* Winnaars & verliezers */}
      <SectionCard title="Winnaars & verliezers" hint="per exploitatie · op campagnescore">
        {highlights.length === 0 ? (
          <EmptySection>
            Verschijnt zodra een exploitatie minstens twee gescoorde campagnes in dezelfde fase
            heeft.
          </EmptySection>
        ) : (
          <div className="space-y-5">
            {highlights.map((group) => (
              <div key={group.unit}>
                <p className="mb-2 font-heading text-xs uppercase tracking-wide text-muted-foreground">
                  {group.unit}
                </p>
                <div className="space-y-2.5">
                  {group.winners.map((w) => (
                    <Highlight key={`w-${w.name}`} name={w.name} platform={w.platform} why={w.why} mark="▲" tone="good" />
                  ))}
                  {group.losers.map((l) => (
                    <Highlight key={`l-${l.name}`} name={l.name} platform={l.platform} why={l.why} mark="▼" tone="bad" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Besteed bedrag & resultaten per dag — twee grafieken met één as elk,
          gekoppeld via syncId zodat de hover op dezelfde dag staat. */}
      <SectionCard title="Besteed bedrag & resultaten per dag">
        {daily.length === 0 ? (
          <EmptySection />
        ) : (
          <div className="space-y-4">
            <MiniChart label="Besteed bedrag">
              <BarChart data={daily} syncId="paid-daily" barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="label" {...AXIS} hide />
                <YAxis {...AXIS} width={52} tickFormatter={(v: number) => eurShort(v)} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP}
                  cursor={{ fill: CHART.grid }}
                  formatter={(value) => [eur(Number(value)), "Besteed bedrag"]}
                />
                <Bar dataKey="spend" name="Besteed bedrag" fill={CHART.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </MiniChart>
            <MiniChart label="Resultaten" height="h-32">
              <LineChart data={daily} syncId="paid-daily">
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} width={52} allowDecimals={false} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP}
                  cursor={{ stroke: CHART.axis }}
                  formatter={(value) => [nl(Number(value)), "Resultaten"]}
                />
                <Line
                  type="monotone"
                  dataKey="results"
                  name="Resultaten"
                  stroke={CHART.primary}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </MiniChart>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function Highlight({
  name,
  platform,
  why,
  mark,
  tone,
}: {
  name: string;
  platform: string;
  why: string;
  mark: string;
  tone: "good" | "bad";
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-sm px-1 text-[9px] font-bold",
          TONE_BADGE[tone]
        )}
      >
        {mark}
      </span>
      <div className="min-w-0">
        <p className="font-sans text-sm font-semibold">
          {name} <span className="font-normal text-muted-foreground">· {platform}</span>
        </p>
        <p className="text-xs text-muted-foreground">{why}</p>
      </div>
    </div>
  );
}

/** Kleine fasetag; kleur is vast per fase, niet afhankelijk van prestatie. */
export function PhaseTag({ phase }: { phase: PaidPhase }) {
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-sm px-2 py-0.5 font-heading text-[10px] uppercase tracking-wide text-white",
        PHASE_FILL[phase]
      )}
    >
      {PHASE_LABELS[phase]}
    </span>
  );
}

/**
 * Hoe de score tot stand komt — staat boven de tabel, zodat niemand hoeft te
 * raden waar een 34 vandaan komt.
 */
function ScoreExplainer() {
  return (
    <div className="mb-4 border border-border bg-muted/40 px-3.5 py-3 text-xs text-muted-foreground">
      <p>
        <span className="font-semibold text-foreground">Score 0-100</span> — een campagne wordt
        alleen vergeleken met campagnes in dezelfde fase én exploitatie. 100 is de beste van die
        groep, 0 de zwakste. Zonder vergelijkingsmateriaal staat er een streepje.
      </p>
      <ul className="mt-1.5 grid gap-x-6 gap-y-0.5 sm:grid-cols-3">
        {(["bereik", "verkeer", "conversie"] as PaidPhase[]).map((phase) => (
          <li key={phase}>
            <span className="font-semibold text-foreground">{PHASE_LABELS[phase]}:</span>{" "}
            {scoreWeightsLabel(phase)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Eén kleine grafiek met zijn naam erboven. Eén reeks per grafiek, dus geen
 * legenda nodig; de hoogte omvat ook de x-as, zodat er niets wegvalt.
 */
function MiniChart({
  label,
  height = "h-40",
  children,
}: {
  label: string;
  height?: string;
  children: React.ReactElement;
}) {
  return (
    <div>
      <p className="mb-1 font-heading text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className={height}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
