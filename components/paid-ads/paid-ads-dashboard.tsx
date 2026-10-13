"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Eye,
  Gauge,
  Loader2,
  MousePointerClick,
  Plug,
  Percent,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  BENCHMARK_LABELS,
  benchmarkMetrics,
  byPlatform,
  deltaFor,
  derive,
  EMPTY_FILTERS,
  filterCampaigns,
  itemKey,
  narrowResponse,
  optionsFrom,
  quickInsights,
  scoreCampaigns,
  totalsOf,
  withoutPhase,
  type MetricKey,
  type PaidFilters,
  type Tone,
} from "@/lib/paid-ads/derive";
import { eur, longDate, nl, pct, roas, signed } from "@/lib/paid-ads/format";
import {
  BenchmarkKey,
  PaidAdsResponse,
  PaidAdsWarning,
  PaidPlatform,
  PERIODS,
  PeriodKey,
  PLATFORM_LABELS,
} from "@/lib/paid-ads/types";
import type { PaidAdsInsightResult } from "@/lib/insights/paid-ads";
import {
  Badge,
  DataTable,
  EmptySection,
  KpiCard,
  PLATFORM_DOT,
  SectionCard,
  Td,
  Th,
  TONE_MARK,
  TotalTile,
  VolumeBar,
} from "./shared";
import { ExecutiveView } from "./executive-view";
import { CampaignView, PhaseTag } from "./campaign-view";
import { CreativeView } from "./creative-view";
import { AudienceView } from "./audience-view";
import { InsightsPanel } from "./insights-panel";
import { FunnelOverview } from "./funnel-view";
import { MultiSelect, type MultiOption } from "./multi-select";
import { cn } from "@/lib/utils";

const VIEWS = [
  { key: "executive", label: "Executive" },
  { key: "campaign", label: "Campagne-analyse" },
  { key: "creative", label: "Creative intelligence" },
  { key: "audience", label: "Audience intelligence" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

const BENCHMARKS: BenchmarkKey[] = ["previous", "yearAgo", "target"];

/** Hoe een ontbrekend onderdeel in de waarschuwing heet. */
const WARNING_PARTS: Record<PaidAdsWarning["part"], string> = {
  creatives: "afbeeldingen",
  demographics: "leeftijd en geslacht",
  targeting: "targeting",
  status: "aan/uit-status van advertenties",
};

/** De KPI-tegels bovenaan, met hun eenheid en icoon. */
const KPI_TILES: {
  key: MetricKey;
  label: string;
  sub: string;
  format: (v: number | null) => string;
  icon: React.ReactNode;
}[] = [
  { key: "spend", label: "Besteed bedrag", sub: "mediabudget", format: (v) => eur(v), icon: <Wallet className="h-3.5 w-3.5" /> },
  { key: "revenue", label: "Conversiewaarde", sub: "omzet uit conversies", format: (v) => eur(v), icon: <Banknote className="h-3.5 w-3.5" /> },
  { key: "roas", label: "ROAS", sub: "omzet per bestede euro", format: (v) => roas(v), icon: <Gauge className="h-3.5 w-3.5" /> },
  { key: "results", label: "Resultaten", sub: "conversies en leads", format: (v) => nl(v), icon: <Target className="h-3.5 w-3.5" /> },
  { key: "costPerResult", label: "Kosten per resultaat", sub: "gemiddeld", format: (v) => eur(v, 2), icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { key: "cpc", label: "CPC", sub: "kosten per klik", format: (v) => eur(v, 2), icon: <MousePointerClick className="h-3.5 w-3.5" /> },
  { key: "cvr", label: "Conversieratio", sub: "van klik naar resultaat", format: (v) => pct(v), icon: <Percent className="h-3.5 w-3.5" /> },
  { key: "ctr", label: "CTR", sub: "click-through rate", format: (v) => pct(v), icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { key: "reach", label: "Bereik", sub: "unieke mensen", format: (v) => nl(v), icon: <Users className="h-3.5 w-3.5" /> },
  { key: "impressions", label: "Weergaven", sub: "advertentievertoningen", format: (v) => nl(v), icon: <Eye className="h-3.5 w-3.5" /> },
];

export function PaidAdsDashboard() {
  const [data, setData] = useState<PaidAdsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [view, setView] = useState<ViewKey>("executive");
  const [benchmark, setBenchmark] = useState<BenchmarkKey>("previous");
  const [filters, setFilters] = useState<PaidFilters>(EMPTY_FILTERS);
  const [campaignGroup, setCampaignGroup] = useState<string | null>(null);

  const [insights, setInsights] = useState<PaidAdsInsightResult | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const insightsCache = useRef<Map<string, PaidAdsInsightResult>>(new Map());

  const [answer, setAnswer] = useState<string | null>(null);
  const [answerLoading, setAnswerLoading] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: PeriodKey) => {
    setLoading(true);
    setError(null);
    insightsCache.current.delete(p);
    try {
      const res = await fetch(`/api/paid-ads?period=${p}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `API gaf status ${res.status}`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ophalen mislukt");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(period);
  }, [period, fetchData]);

  useEffect(() => {
    setInsights(null);
    setInsightsError(null);
    setAnswer(null);
    setAnswerError(null);
  }, [period]);

  /* ---------- Afgeleide waarden ---------- */

  const periodLabel = PERIODS.find((p) => p.value === period)?.label ?? period;
  const benchmarkLabel = BENCHMARK_LABELS[benchmark];

  const allCampaigns = data?.campaigns ?? [];
  // Alles wat de weergaven zien volgt de filters: campagnes, advertenties,
  // grafieken én de vergelijkingsperiode.
  const viewData = useMemo(() => (data ? narrowResponse(data, filters) : null), [data, filters]);
  const filtered = viewData?.campaigns ?? [];
  const scored = useMemo(() => scoreCampaigns(filtered), [filtered]);
  const revenuePlatforms = useMemo(() => data?.revenuePlatforms ?? [], [data]);
  const totals = useMemo(() => totalsOf(filtered, revenuePlatforms), [filtered, revenuePlatforms]);
  const avgCpa = totals.costPerResult;
  const benchmarkTotals = useMemo(
    () => (viewData ? benchmarkMetrics(viewData, benchmark) : null),
    [viewData, benchmark]
  );

  // De funnel toont altijd alle fases, binnen de overige filters.
  const funnelCampaigns = useMemo(
    () => (data ? narrowResponse(data, withoutPhase(filters)).campaigns : []),
    [data, filters]
  );

  // Campagnes en advertentiesets om uit te kiezen: alleen wat binnen de andere
  // filters valt. Kies je eerst PSV Play, dan staan hier alleen PSV Play-campagnes.
  const campaignOptions = useMemo<MultiOption[]>(
    () =>
      filterCampaigns(allCampaigns, { ...filters, campaigns: [], adSets: [], query: "" })
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "nl"))
        .map((c) => ({
          value: itemKey(c),
          label: c.name,
          detail: `${PLATFORM_LABELS[c.platform]} · ${c.businessUnit}`,
          dot: PLATFORM_DOT[c.platform],
        })),
    [allCampaigns, filters]
  );
  const adSetOptions = useMemo<MultiOption[]>(() => {
    if (!data) return [];
    const parents = new Map(
      filterCampaigns(allCampaigns, { ...filters, adSets: [], query: "" }).map((c) => [itemKey(c), c.name])
    );
    return data.adSets
      .filter((s) => parents.has(`${s.platform}:${s.campaignId}`))
      .sort((a, b) => a.name.localeCompare(b.name, "nl"))
      .map((s) => ({
        value: itemKey(s),
        label: s.name,
        detail: parents.get(`${s.platform}:${s.campaignId}`),
        dot: PLATFORM_DOT[s.platform],
      }));
  }, [data, allCampaigns, filters]);

  const platformOptions = useMemo(
    () => optionsFrom(allCampaigns, (c) => c.platform) as PaidPlatform[],
    [allCampaigns]
  );
  const unitOptions = useMemo(() => optionsFrom(allCampaigns, (c) => c.businessUnit), [allCampaigns]);
  const objectiveOptions = useMemo(() => optionsFrom(allCampaigns, (c) => c.objective), [allCampaigns]);
  const groupOptions = useMemo(() => optionsFrom(allCampaigns, (c) => c.campaignGroup), [allCampaigns]);

  // Cross-platform campagne: dezelfde campagne die op meerdere kanalen draait.
  const activeGroup = campaignGroup ?? groupOptions[0] ?? null;
  const groupRows = useMemo(
    () => (activeGroup ? allCampaigns.filter((c) => c.campaignGroup === activeGroup) : []),
    [allCampaigns, activeGroup]
  );
  const groupTotals = useMemo(
    () => totalsOf(groupRows, revenuePlatforms),
    [groupRows, revenuePlatforms]
  );

  const quick = useMemo(() => {
    if (!data || scored.length === 0) return [];
    return quickInsights(
      scored,
      byPlatform(filtered),
      totals,
      benchmarkLabel,
      {
        results: deltaFor("results", totals.results, benchmarkTotals?.results ?? null),
        cvr: deltaFor("cvr", totals.cvr, benchmarkTotals?.cvr ?? null),
      },
      { eur, pct, signed }
    );
  }, [data, scored, filtered, totals, benchmarkLabel, benchmarkTotals]);

  const viewProps = {
    data: viewData as PaidAdsResponse,
    scored,
    totals,
    avgCpa,
    benchmark: benchmarkTotals,
    benchmarkLabel,
  };

  /* ---------- AI ---------- */

  const hasData = allCampaigns.length > 0;

  const runAnalysis = useCallback(async () => {
    if (!data || !hasData) return;
    const cached = insightsCache.current.get(period);
    if (cached) {
      setInsights(cached);
      setInsightsError(null);
      return;
    }
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const res = await fetch("/api/paid-ads/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: forAnalysis(data), periodLabel }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `API gaf status ${res.status}`);
      }
      const result: PaidAdsInsightResult = await res.json();
      setInsights(result);
      insightsCache.current.set(period, result);
    } catch (err) {
      setInsightsError(err instanceof Error ? err.message : "Analyse mislukt");
    } finally {
      setInsightsLoading(false);
    }
  }, [data, hasData, period, periodLabel]);

  const askQuestion = useCallback(
    async (question: string) => {
      if (!data || !hasData) return;
      setAnswerLoading(true);
      setAnswerError(null);
      setAnswer(null);
      try {
        const res = await fetch("/api/paid-ads/insights/question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: question }],
            data: forAnalysis(data),
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `API gaf status ${res.status}`);
        }
        const result: { answer: string } = await res.json();
        setAnswer(result.answer);
      } catch (err) {
        setAnswerError(err instanceof Error ? err.message : "Vraag beantwoorden mislukt");
      } finally {
        setAnswerLoading(false);
      }
    },
    [data, hasData]
  );

  /* ---------- Render ---------- */

  const notConnected = data ? data.connectedPlatforms.length === 0 : false;
  // Platforms zonder omzetdata tellen niet mee in omzet en ROAS; dat staat erbij.
  const missingRevenue = data
    ? data.connectedPlatforms.filter((p) => !data.revenuePlatforms.includes(p))
    : [];

  return (
    <div className="space-y-5">
      {/* Weergaven — scrollt op smalle schermen in plaats van af te kappen. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex w-max overflow-hidden rounded-md border border-border">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={cn(
                "whitespace-nowrap px-5 py-2 font-heading text-sm uppercase tracking-wide transition-colors",
                view === v.key
                  ? "bg-psv-red-primary text-white"
                  : "bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <FilterSelect
          value={filters.businessUnit}
          onChange={(v) => setFilters((f) => ({ ...f, businessUnit: v }))}
          allLabel="Alle exploitaties"
          options={unitOptions}
        />
        <FilterSelect
          value={filters.objective}
          onChange={(v) => setFilters((f) => ({ ...f, objective: v }))}
          allLabel="Alle doelstellingen"
          options={objectiveOptions}
        />
        <FilterSelect
          value={filters.platform}
          onChange={(v) => setFilters((f) => ({ ...f, platform: v as PaidPlatform | "alles" }))}
          allLabel="Alle platformen"
          options={platformOptions}
          labelFor={(p) => PLATFORM_LABELS[p as PaidPlatform] ?? p}
        />
        <MultiSelect
          className="w-56"
          value={filters.campaigns}
          onChange={(v) => setFilters((f) => ({ ...f, campaigns: v }))}
          options={campaignOptions}
          allLabel="Alle campagnes"
          unit="campagnes"
        />
        <MultiSelect
          className="w-56"
          value={filters.adSets}
          onChange={(v) => setFilters((f) => ({ ...f, adSets: v }))}
          options={adSetOptions}
          allLabel="Alle advertentiesets"
          unit="advertentiesets"
        />

        <button
          onClick={() => fetchData(period)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Vernieuwen
        </button>

        <div className="ml-auto flex items-center gap-2.5">
          <span className="text-xs text-muted-foreground">Vergelijk met</span>
          <div className="flex overflow-hidden rounded-md border border-border">
            {BENCHMARKS.map((b) => (
              <button
                key={b}
                onClick={() => setBenchmark(b)}
                className={cn(
                  "px-3 py-2 text-xs font-semibold transition-colors",
                  benchmark === b
                    ? "bg-psv-neutralDark text-white"
                    : "bg-card text-muted-foreground hover:bg-muted"
                )}
              >
                {BENCHMARK_LABELS[b]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filters.adSets.length > 0 && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Gefilterd op advertentieset: KPI&apos;s en tabellen gaan over de gekozen sets. De
          dagelijkse grafieken tonen de hele campagne, en de vergelijking met eerdere periodes
          vervalt — die cijfers bestaan alleen op campagneniveau.
        </p>
      )}

      {/* Koppeling ontbreekt */}
      {notConnected && data && (
        <Card className="border-dashed">
          <CardContent className="flex items-start gap-3 py-4">
            <Plug className="mt-0.5 h-5 w-5 shrink-0 text-psv-red-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Nog geen advertentieaccount gekoppeld</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Het dashboard toont zijn volledige structuur, maar er is nog geen data om te laten
                zien. Zet de environment variabelen per platform om de koppeling te leggen:
              </p>
              <ul className="mt-2 space-y-1">
                {Object.entries(data.platformErrors).map(([platform, message]) => (
                  <li key={platform} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span
                      className={cn(
                        "mt-1 h-2 w-2 shrink-0 rounded-full",
                        PLATFORM_DOT[platform as PaidPlatform]
                      )}
                    />
                    {message}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fout */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium">Fout bij ophalen data</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deels opgehaald */}
      {data &&
        !notConnected &&
        (Object.keys(data.platformErrors).length > 0 || data.warnings.length > 0) && (
          <Card className="border-warning/50 bg-warning-bg/40">
            <CardContent className="flex items-start gap-3 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="text-xs text-muted-foreground">
                {Object.values(data.platformErrors).map((message, i) => (
                  <p key={i}>{message}</p>
                ))}
                {data.warnings.map((w, i) => (
                  <p key={`w${i}`}>
                    {PLATFORM_LABELS[w.platform]}: {WARNING_PARTS[w.part]} niet opgehaald — {w.message}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

      {loading && !data ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-16">
            <Loader2 className="h-5 w-5 animate-spin text-psv-red-primary" />
            <span className="text-sm text-muted-foreground">Campagnedata wordt opgehaald…</span>
          </CardContent>
        </Card>
      ) : (
        data && (
          <>
            {/* Funnel — tegelijk het fasefilter */}
            <FunnelOverview
              campaigns={funnelCampaigns}
              active={filters.phase}
              onSelect={(phase) => setFilters((f) => ({ ...f, phase }))}
            />

            {/* Quick insights */}
            <SectionCard title="Quick insights">
              {quick.length === 0 ? (
                <EmptySection>
                  Inzichten verschijnen zodra er campagnedata is voor deze periode.
                </EmptySection>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                  {quick.map((insight, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-sm leading-snug">
                      <Badge tone={insight.tone} className="mt-0.5 justify-center px-1.5">
                        {TONE_MARK[insight.tone]}
                      </Badge>
                      <span className="text-muted-foreground">{insight.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Campagne over alle platformen */}
            <SectionCard
              title="Campagne totaal — alle platformen"
              hint={
                groupRows.length > 0
                  ? `${groupRows.length} kanalen · ${[...new Set(groupRows.map((r) => PLATFORM_LABELS[r.platform]))].join(", ")}`
                  : undefined
              }
              action={
                groupOptions.length > 0 && (
                  <Select value={activeGroup ?? ""} onValueChange={setCampaignGroup}>
                    <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {groupOptions.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }
            >
              {groupRows.length === 0 ? (
                <EmptySection>
                  Campagnes die onder één naam op meerdere kanalen draaien worden hier bij elkaar
                  opgeteld.
                </EmptySection>
              ) : (
                <>
                  <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <TotalTile label="Besteed bedrag" value={eur(groupTotals.spend)} />
                    <TotalTile label="Bereik" value={nl(groupTotals.reach)} />
                    <TotalTile label="Clicks" value={nl(groupTotals.clicks)} />
                    <TotalTile label="Resultaten" value={nl(groupTotals.results)} />
                    <TotalTile label="Kosten per resultaat" value={eur(groupTotals.costPerResult, 2)} />
                    <TotalTile label="ROAS" value={roas(groupTotals.roas)} />
                  </div>
                  <DataTable>
                    <thead>
                      <tr className="border-b border-border">
                        <Th className="pl-0">Platform</Th>
                        <Th>Fase</Th>
                        <Th className="min-w-[150px]">Aandeel budget</Th>
                        <Th align="right">Bereik</Th>
                        <Th align="right">Clicks</Th>
                        <Th align="right">Resultaten</Th>
                        <Th align="right">CPA</Th>
                        <Th align="right" className="pr-0">Besteed</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupRows.map((row) => {
                        const d = derive(row.metrics);
                        const share =
                          groupTotals.spend > 0 ? (row.metrics.spend / groupTotals.spend) * 100 : 0;
                        return (
                          <tr key={row.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40">
                            <Td className="whitespace-nowrap pl-0 font-medium">
                              <span
                                className={cn(
                                  "mr-2 inline-block h-2.5 w-2.5 rounded-full",
                                  PLATFORM_DOT[row.platform]
                                )}
                              />
                              {PLATFORM_LABELS[row.platform]}
                            </Td>
                            <Td><PhaseTag phase={row.phase} /></Td>
                            <Td>
                              <div className="flex items-center gap-2">
                                <VolumeBar width={share} />
                                <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                                  {pct(share, 0)}
                                </span>
                              </div>
                            </Td>
                            <Td align="right">{nl(row.metrics.reach)}</Td>
                            <Td align="right">{nl(row.metrics.clicks)}</Td>
                            <Td align="right">{nl(row.metrics.results)}</Td>
                            <Td align="right" className="text-muted-foreground">{eur(d.costPerResult, 2)}</Td>
                            <Td align="right" className="pr-0 font-semibold">{eur(row.metrics.spend)}</Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </DataTable>
                </>
              )}
            </SectionCard>

            {/* AI inzichten */}
            <InsightsPanel
              insights={insights}
              loading={insightsLoading}
              error={insightsError}
              hasData={hasData}
              periodLabel={periodLabel}
              onAnalyze={runAnalysis}
              onAsk={askQuestion}
              answer={answer}
              answerLoading={answerLoading}
              answerError={answerError}
            />

            {/* KPI's */}
            <div className="grid grid-cols-2 gap-3.5 md:grid-cols-5">
              {KPI_TILES.map((tile) => {
                const value = totals[tile.key] as number | null;
                const d = deltaFor(tile.key, value, (benchmarkTotals?.[tile.key] as number | null) ?? null);
                return (
                  <KpiCard
                    key={tile.key}
                    label={tile.label}
                    value={tile.format(value)}
                    sub={
                      tile.key === "spend" && data.targets.budget != null
                        ? `van ${eur(data.targets.budget)} budget`
                        : (tile.key === "revenue" || tile.key === "roas") && missingRevenue.length > 0
                          ? `excl. ${missingRevenue.map((p) => PLATFORM_LABELS[p]).join(", ")}`
                          : tile.sub
                    }
                    delta={d.value != null ? signed(d.value, d.unit) : null}
                    deltaTone={d.tone as Tone}
                    icon={tile.icon}
                  />
                );
              })}
            </div>

            {/* Zoekveld boven de campagnetabel */}
            {view === "campaign" && (
              <div className="flex justify-end">
                <Input
                  value={filters.query}
                  onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
                  placeholder="Zoek op campagne, platform of exploitatie"
                  className="w-72"
                />
              </div>
            )}

            {view === "executive" && <ExecutiveView {...viewProps} />}
            {view === "campaign" && <CampaignView {...viewProps} />}
            {view === "creative" && <CreativeView {...viewProps} />}
            {view === "audience" && <AudienceView {...viewProps} />}

            <p className="text-xs text-muted-foreground">
              Periode {longDate(data.period.from)} t/m {longDate(data.period.to)} · opgehaald om{" "}
              {new Date(data.fetchedAt).toLocaleTimeString("nl-NL", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </>
        )
      )}
    </div>
  );
}

/**
 * De respons zonder de ruwe dagreeks per campagne en de campagnes van vorig
 * jaar: de analyse gebruikt die niet, en zo blijft het verzoek klein, ook bij
 * een heel seizoen.
 */
function forAnalysis(data: PaidAdsResponse): PaidAdsResponse {
  return {
    ...data,
    campaignDaily: [],
    demographics: [],
    // De vorige periode blijft mee: daaruit komt de ROAS-vergelijking.
    benchmarks: { ...data.benchmarks, yearAgoCampaigns: null },
  };
}

/** Keuzelijst met een "alles"-optie bovenaan. */
function FilterSelect({
  value,
  onChange,
  allLabel,
  options,
  labelFor,
}: {
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: string[];
  labelFor?: (option: string) => string;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={options.length === 0}>
      <SelectTrigger className="w-48"><SelectValue placeholder={allLabel} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="alles">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>{labelFor ? labelFor(o) : o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
