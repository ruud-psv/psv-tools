"use client";

import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  budgetOpportunities,
  byPlatform,
  deltaFor,
  derive,
  topAdsByCtr,
  winnersAndLosers,
} from "@/lib/paid-ads/derive";
import { eur, eurShort, nl, pct, shortDate, signed } from "@/lib/paid-ads/format";
import { PaidPlatform, PLATFORM_LABELS } from "@/lib/paid-ads/types";
import {
  Badge,
  DataTable,
  EmptySection,
  MiniKpi,
  PLATFORM_DOT,
  SectionCard,
  Td,
  Th,
  TONE_BADGE,
  VolumeBar,
} from "./shared";
import type { PaidViewProps } from "./shared";
import { PerformanceQuadrant } from "./performance-quadrant";
import { cn } from "@/lib/utils";

/** Tooltipstijl gelijk aan de andere PSV-dashboards. */
const TOOLTIP_STYLE = {
  backgroundColor: "#09101d",
  border: "1px solid #333",
  borderRadius: "6px",
  color: "#fff",
  fontSize: 12,
} as const;

const RED = "#e82026";
const DARK = "#09101d";
const GOLD = "#bb9753";

export function CampaignView({ data, scored, totals, avgCpa, benchmark, benchmarkLabel }: PaidViewProps) {
  const daily = useMemo(
    () => data.daily.map((d) => ({ ...d, label: shortDate(d.date) })),
    [data.daily]
  );
  const weekly = data.weekly;
  const platforms = useMemo(() => byPlatform(scored), [scored]);
  const topAds = useMemo(() => topAdsByCtr(data.ads), [data.ads]);
  const { winners, losers } = useMemo(
    () => winnersAndLosers(scored, avgCpa, { eur, pct }),
    [scored, avgCpa]
  );
  const opportunities = useMemo(() => budgetOpportunities(scored, avgCpa), [scored, avgCpa]);

  const secondary = [
    { key: "clicks" as const, label: "Clicks", value: nl(totals.clicks) },
    { key: "frequency" as const, label: "Frequentie", value: nl(totals.frequency, 2) },
    { key: "cpm" as const, label: "CPM", value: eur(totals.cpm, 2) },
  ].map((kpi) => {
    const d = deltaFor(kpi.key, totals[kpi.key], benchmark?.[kpi.key] ?? null);
    return { ...kpi, delta: d.value != null ? signed(d.value, d.unit) : null, tone: d.tone };
  });

  return (
    <div className="space-y-6">
      {/* Secundaire KPI's */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {secondary.map((kpi) => (
          <MiniKpi key={kpi.key} label={kpi.label} value={kpi.value} delta={kpi.delta} deltaTone={kpi.tone} />
        ))}
      </div>

      {/* Besteed bedrag & resultaten per dag */}
      <SectionCard
        title="Besteed bedrag & resultaten per dag"
        action={
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-psv-red-primary" />Besteed bedrag
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3.5 bg-psv-neutralDark" />Resultaten
            </span>
          </div>
        }
      >
        {daily.length === 0 ? (
          <EmptySection />
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#999" />
                <YAxis
                  yAxisId="spend"
                  tick={{ fontSize: 11 }}
                  stroke="#999"
                  tickFormatter={(v: number) => eurShort(v)}
                />
                <YAxis yAxisId="results" orientation="right" tick={{ fontSize: 11 }} stroke="#999" />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, name) =>
                    name === "Besteed bedrag" ? eur(Number(value)) : nl(Number(value))
                  }
                />
                <Bar yAxisId="spend" dataKey="spend" name="Besteed bedrag" fill={RED} radius={[2, 2, 0, 0]} />
                <Line
                  yAxisId="results"
                  type="monotone"
                  dataKey="results"
                  name="Resultaten"
                  stroke={DARK}
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* CTR & kosten per resultaat */}
        <SectionCard title="CTR & kosten per resultaat" hint="trend per week">
          {weekly.length === 0 ? (
            <EmptySection />
          ) : (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weekly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.2} />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="#999" />
                    <YAxis yAxisId="ctr" tick={{ fontSize: 11 }} stroke="#999" tickFormatter={(v: number) => pct(v, 1)} />
                    <YAxis
                      yAxisId="cpr"
                      orientation="right"
                      tick={{ fontSize: 11 }}
                      stroke="#999"
                      tickFormatter={(v: number) => eur(v)}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value, name) =>
                        name === "CTR" ? pct(Number(value)) : eur(Number(value), 2)
                      }
                    />
                    <Line yAxisId="ctr" type="monotone" dataKey="ctr" name="CTR" stroke={RED} strokeWidth={2} dot={false} />
                    <Line
                      yAxisId="cpr"
                      type="monotone"
                      dataKey="costPerResult"
                      name="Kosten per resultaat"
                      stroke={DARK}
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 bg-psv-red-primary" />CTR %</span>
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 bg-psv-neutralDark" />Kosten per resultaat</span>
              </div>
            </>
          )}
        </SectionCard>

        {/* Platform versus vorige periode */}
        <SectionCard title={`Platform versus ${benchmarkLabel.toLowerCase()}`}>
          {platforms.length === 0 ? (
            <EmptySection />
          ) : (
            <>
              <div className="space-y-4">
                {platforms.map((p) => {
                  const prev = data.benchmarks.previousByPlatform[p.key as PaidPlatform];
                  const prevSpend = prev?.spend ?? null;
                  const max = Math.max(p.metrics.spend, prevSpend ?? 0, 1);
                  const d = deltaFor("spend", p.metrics.spend, prevSpend);
                  // Spend is neutraal geduid; hier is stijgen wél informatief.
                  const tone = d.value == null ? "neutral" : d.value >= 0 ? "good" : "bad";
                  return (
                    <div key={p.key}>
                      <div className="mb-1.5 flex justify-between text-sm">
                        <span className="font-medium text-muted-foreground">{p.label}</span>
                        <span className="flex items-center gap-2 tabular-nums">
                          {eur(p.metrics.spend)}
                          {d.value != null && <Badge tone={tone}>{signed(d.value, d.unit)}</Badge>}
                        </span>
                      </div>
                      <div className="mb-1 h-2 overflow-hidden rounded-sm bg-psv-gray-07">
                        <div
                          className="h-full rounded-sm bg-psv-red-primary"
                          style={{ width: `${(p.metrics.spend / max) * 100}%` }}
                        />
                      </div>
                      <div className="h-1 overflow-hidden rounded-sm bg-psv-gray-07">
                        {prevSpend != null && (
                          <div
                            className="h-full rounded-sm bg-psv-gray-08"
                            style={{ width: `${(prevSpend / max) * 100}%` }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2.5 rounded-sm bg-psv-red-primary" />Deze periode</span>
                <span className="flex items-center gap-1.5"><span className="h-1 w-2.5 rounded-sm bg-psv-gray-08" />Vorige periode</span>
              </div>
            </>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top advertenties */}
        <SectionCard title="Top 10 advertenties" hint="op CTR %">
          {topAds.length === 0 ? (
            <EmptySection />
          ) : (
            <div className="space-y-3">
              {topAds.map((ad, i) => (
                <div key={ad.id} className="flex items-center gap-3">
                  <span className="w-5 text-right font-heading text-base text-psv-gray-08">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex justify-between gap-3 text-sm">
                      <span className="truncate text-muted-foreground">{ad.name}</span>
                      <span className="whitespace-nowrap font-semibold tabular-nums">{pct(ad.derived.ctr)}</span>
                    </div>
                    <div className="flex">
                      <VolumeBar width={ad.width} />
                    </div>
                  </div>
                  <span className="w-28 truncate text-right text-[10px] text-muted-foreground">
                    {PLATFORM_LABELS[ad.platform]} · {nl(ad.results)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Winnaars & verliezers */}
        <SectionCard title="Winnaars & verliezers" hint="op campagnescore">
          {winners.length === 0 ? (
            <EmptySection>Minimaal vier gescoorde campagnes nodig voor een ranglijst.</EmptySection>
          ) : (
            <>
              <div className="space-y-2.5">
                {winners.map((w) => (
                  <Highlight key={w.name} name={w.name} platform={w.platform} why={w.why} mark="▲" tone="good" />
                ))}
              </div>
              <div className="mt-4 space-y-2.5 border-t border-border pt-4">
                {losers.map((l) => (
                  <Highlight key={l.name} name={l.name} platform={l.platform} why={l.why} mark="▼" tone="bad" />
                ))}
              </div>
            </>
          )}
        </SectionCard>
      </div>

      {/* Budget opportunities */}
      <SectionCard
        title="Budget opportunities"
        hint="voorgestelde verschuiving binnen hetzelfde totaalbudget"
      >
        {opportunities.length === 0 ? (
          <EmptySection>
            Voorstellen verschijnen zodra er genoeg conversiecampagnes zijn om te vergelijken.
          </EmptySection>
        ) : (
          <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
            {opportunities.map((o) => (
              <div
                key={`${o.type}-${o.name}`}
                className="flex items-start gap-3 border-b border-border/50 py-2.5"
              >
                <span
                  className={cn(
                    "mt-0.5 shrink-0 rounded-sm px-2 py-0.5 font-heading text-[10px] uppercase tracking-wide",
                    TONE_BADGE[o.tone]
                  )}
                >
                  {o.type}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{o.name}</p>
                  <p className="text-xs text-muted-foreground">{o.platform} · {o.why}</p>
                </div>
                <span
                  className={cn(
                    "whitespace-nowrap font-heading text-lg",
                    o.tone === "good" ? "text-success" : "text-error"
                  )}
                >
                  {o.amount >= 0 ? "+" : "−"} {eur(Math.abs(o.amount))}
                </span>
              </div>
            ))}
          </div>
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

      {/* Campagnetabel */}
      <SectionCard
        title="Campagnes"
        hint={`${scored.length} ${scored.length === 1 ? "campagne" : "campagnes"} · score per fase · CTR 20% · CPC 20% · CVR 30% · CPA 30%`}
      >
        {scored.length === 0 ? (
          <EmptySection />
        ) : (
          <DataTable>
            <thead>
              <tr className="border-b border-t border-border">
                <Th className="pl-0">Campagne</Th>
                <Th align="right">Score</Th>
                <Th>Exploitatie</Th>
                <Th>Platform</Th>
                <Th>Fase</Th>
                <Th>Doelstelling</Th>
                <Th align="right">Bereik</Th>
                <Th align="right">Clicks</Th>
                <Th align="right">CTR %</Th>
                <Th align="right">CPC</Th>
                <Th align="right">CVR %</Th>
                <Th align="right">Resultaten</Th>
                <Th align="right">Kosten / res.</Th>
                <Th align="right" className="pr-0">Besteed</Th>
              </tr>
            </thead>
            <tbody>
              {scored.map((c) => (
                <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40">
                  <Td className="pl-0 font-medium">{c.name}</Td>
                  <Td align="right">
                    {c.score != null ? <Badge tone={c.scoreTone}>{c.score}</Badge> : "—"}
                  </Td>
                  <Td className="text-muted-foreground">{c.businessUnit}</Td>
                  <Td className="text-muted-foreground">{PLATFORM_LABELS[c.platform]}</Td>
                  <Td><PhaseTag phase={c.phase} /></Td>
                  <Td className="text-muted-foreground">{c.objective}</Td>
                  <Td align="right">{nl(c.metrics.reach)}</Td>
                  <Td align="right">{nl(c.metrics.clicks)}</Td>
                  <Td align="right">{pct(c.derived.ctr)}</Td>
                  <Td align="right" className="text-muted-foreground">{eur(c.derived.cpc, 2)}</Td>
                  <Td align="right">{pct(c.derived.cvr, 1)}</Td>
                  <Td align="right">{nl(c.metrics.results)}</Td>
                  <Td align="right" className="text-muted-foreground">{eur(c.derived.costPerResult, 2)}</Td>
                  <Td align="right" className="pr-0 font-semibold">{eur(c.metrics.spend)}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
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
        <p className="text-sm font-semibold">
          {name} <span className="font-normal text-muted-foreground">· {platform}</span>
        </p>
        <p className="text-xs text-muted-foreground">{why}</p>
      </div>
    </div>
  );
}

/** Kleine fasetag; kleur is vast per fase, niet afhankelijk van prestatie. */
export function PhaseTag({ phase }: { phase: "bereik" | "verkeer" | "conversie" }) {
  const styles = {
    bereik: "bg-error-bg text-error",
    verkeer: "bg-muted text-muted-foreground",
    conversie: "bg-success-bg text-success",
  } as const;
  const labels = { bereik: "Bereik", verkeer: "Verkeer", conversie: "Conversie" } as const;
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-sm px-2 py-0.5 font-heading text-[10px] uppercase tracking-wide",
        styles[phase]
      )}
    >
      {labels[phase]}
    </span>
  );
}
