"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Banknote, Check, Gauge, Loader2, Target, Wallet } from "lucide-react";
import {
  adsWithoutResults,
  businessUnitPerformance,
  deltaFor,
  derive,
  type Tone,
} from "@/lib/paid-ads/derive";
import { eur, nl, pct, roas, signed } from "@/lib/paid-ads/format";
import {
  KOOPREDENEN,
  koopredenVan,
  perKoopreden,
  TEST_DREMPEL,
  TESTBUDGET,
  testOverzicht,
  type TestOordeel,
} from "@/lib/paid-ads/methode";
import { PLATFORM_LABELS, type PaidAdsAd } from "@/lib/paid-ads/types";
import {
  Badge,
  CreativeThumb,
  DataTable,
  EmptySection,
  KpiCard,
  PLATFORM_DOT,
  SectionCard,
  Td,
  Th,
  VolumeBar,
} from "./shared";
import type { PaidViewProps } from "./shared";
import { AdHoverPreview } from "./ad-preview";
import { cn } from "@/lib/utils";

/** Zoveel creatives staan er in het overzicht; de rest staat onder Creatives. */
const TOP_CREATIVES = 4;

const OORDEEL: Record<TestOordeel, { label: string; tone: Tone }> = {
  "te-vroeg": { label: `Nog te vroeg (< € ${TEST_DREMPEL})`, tone: "neutral" },
  beter: { label: "Beter dan bewezen", tone: "good" },
  slechter: { label: "Slechter dan bewezen", tone: "bad" },
  "geen-vergelijking": { label: "Niets om mee te vergelijken", tone: "neutral" },
};

export interface OverzichtProps extends PaidViewProps {
  /** Platforms zonder omzetdata: die tellen niet mee in opbrengst en ROAS. */
  missingRevenue: string[];
  onDoel: (exploitatie: string, cpa: number | null) => Promise<void>;
  onNaarCreatives: () => void;
}

/**
 * Het overzicht: wat het kost, wat het oplevert en wat de creatives doen,
 * getoetst aan de afgesproken aanpak (CPA-doel, koopredenen, testbudget).
 * De volledige tabellen staan onder de detailtabbladen.
 */
export function OverzichtView({
  data,
  scored,
  totals,
  benchmark,
  benchmarkLabel,
  missingRevenue,
  onDoel,
  onNaarCreatives,
}: OverzichtProps) {
  // Alleen wat aan staat; advertenties met een onbekende status tellen mee.
  const ads = useMemo(() => data.ads.filter((a) => a.active !== false), [data.ads]);
  const units = useMemo(() => businessUnitPerformance(scored, data.targets), [scored, data.targets]);
  const redenen = useMemo(() => perKoopreden(ads, data.adSets), [ads, data.adSets]);
  const tests = useMemo(() => testOverzicht(ads, data.adSets, data.campaigns), [ads, data.adSets, data.campaigns]);
  const idle = useMemo(() => adsWithoutResults(ads, data.adSets, data.campaigns), [ads, data.adSets, data.campaigns]);
  const sets = useMemo(() => new Map(data.adSets.map((s) => [`${s.platform}:${s.id}`, s])), [data.adSets]);
  const top = useMemo(
    () =>
      [...ads]
        .filter((a) => a.metrics.results > 0)
        .sort((a, b) => b.metrics.results - a.metrics.results || b.metrics.spend - a.metrics.spend)
        .slice(0, TOP_CREATIVES),
    [ads]
  );

  const delta = (key: "spend" | "revenue" | "results" | "costPerResult") => {
    const d = deltaFor(key, totals[key], benchmark?.[key] ?? null);
    return { delta: d.value != null ? signed(d.value, d.unit) : null, deltaTone: d.tone as Tone };
  };
  const excl = missingRevenue.length ? ` · excl. ${missingRevenue.join(", ")}` : "";
  const onbekend = redenen.find((r) => r.key === "onbekend");
  const benoemd = redenen.filter((r) => r.key !== "onbekend");
  const maxSpend = Math.max(...redenen.map((r) => r.metrics.spend), 1);

  return (
    <div className="space-y-6">
      {/* Kosten en opbrengst */}
      <div>
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <KpiCard
            label="Kost"
            value={eur(totals.spend)}
            sub={data.targets.budget != null ? `van ${eur(data.targets.budget)} budget` : "mediabudget"}
            icon={<Wallet className="h-3.5 w-3.5" />}
            {...delta("spend")}
          />
          <KpiCard
            label="Levert op"
            value={eur(totals.revenue)}
            sub={`conversiewaarde · ROAS ${roas(totals.roas)}${excl}`}
            icon={<Banknote className="h-3.5 w-3.5" />}
            {...delta("revenue")}
          />
          <KpiCard
            label="Resultaten"
            value={nl(totals.results)}
            sub="aankopen, leads en aanmeldingen"
            icon={<Target className="h-3.5 w-3.5" />}
            {...delta("results")}
          />
          <KpiCard
            label="Kost per resultaat"
            value={eur(totals.costPerResult, 2)}
            sub="CPA, gemiddeld over alles"
            icon={<Gauge className="h-3.5 w-3.5" />}
            {...delta("costPerResult")}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Verschil ten opzichte van {benchmarkLabel.toLowerCase()}. Meta meet op het attributievenster van het
          account; de workshop spreekt 7-day click af.
        </p>
      </div>

      {/* Per exploitatie, met CPA-doel */}
      <SectionCard title="Per exploitatie" hint="CPA tegen het doel dat vooraf is vastgelegd">
        {units.length === 0 ? (
          <EmptySection />
        ) : (
          <DataTable>
            <thead>
              <tr className="border-b border-border">
                <Th className="pl-0">Exploitatie</Th>
                <Th align="right">Kost</Th>
                <Th align="right">Levert op</Th>
                <Th align="right">ROAS</Th>
                <Th align="right">Resultaten</Th>
                <Th align="right">CPA</Th>
                <Th align="right" className="pr-0">CPA-doel</Th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.key} className="border-b border-border/50 last:border-0">
                  <Td className="pl-0 font-medium">{u.label}</Td>
                  <Td align="right">{eur(u.metrics.spend)}</Td>
                  <Td align="right">{u.metrics.revenue > 0 ? eur(u.metrics.revenue) : "—"}</Td>
                  <Td align="right">{roas(u.derived.roas)}</Td>
                  <Td align="right">{nl(u.metrics.results)}</Td>
                  <Td align="right">
                    {u.target != null ? (
                      <Badge tone={u.tone} title={u.status}>{eur(u.derived.costPerResult, 2)}</Badge>
                    ) : (
                      eur(u.derived.costPerResult, 2)
                    )}
                  </Td>
                  <Td align="right" className="pr-0">
                    <DoelInvoer waarde={u.target} onOpslaan={(cpa) => onDoel(u.key, cpa)} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </SectionCard>

      {/* Wat de creatives doen */}
      <SectionCard
        title="Wat de creatives doen"
        hint="meeste resultaat, alleen advertenties die aan staan"
        action={
          <button
            type="button"
            onClick={onNaarCreatives}
            className="inline-flex items-center gap-1 font-heading text-xs uppercase tracking-wide text-psv-red-primary hover:underline"
          >
            Alle creatives <ArrowRight className="h-3.5 w-3.5" />
          </button>
        }
      >
        {top.length === 0 ? (
          <EmptySection>Nog geen advertenties met resultaat in deze periode.</EmptySection>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {top.map((ad) => (
              <TopCreative
                key={`${ad.platform}-${ad.id}`}
                ad={ad}
                koopreden={KOOPREDENEN.find((k) => k.key === koopredenVan(ad, sets.get(`${ad.platform}:${ad.adSetId}`)))?.label ?? null}
              />
            ))}
          </div>
        )}
        {idle.count > 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              {nl(idle.count)} {idle.count === 1 ? "advertentie" : "advertenties"}
            </span>{" "}
            in conversiecampagnes {idle.count === 1 ? "kost" : "kosten"} {eur(idle.spend)} zonder één resultaat.{" "}
            <button type="button" onClick={onNaarCreatives} className="text-psv-red-primary hover:underline">
              Bekijk welke
            </button>
          </p>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Koopredenen */}
        <SectionCard title="Koopredenen" hint="waarom een fan koopt, uit de naam van advertentie of set">
          {redenen.length === 0 ? (
            <EmptySection />
          ) : (
            <>
              <DataTable>
                <thead>
                  <tr className="border-b border-border">
                    <Th className="pl-0">Koopreden</Th>
                    <Th className="min-w-[110px]">Kost</Th>
                    <Th align="right">Resultaten</Th>
                    <Th align="right">CPA</Th>
                    <Th align="right" className="pr-0">ROAS</Th>
                  </tr>
                </thead>
                <tbody>
                  {redenen.map((r) => (
                    <tr
                      key={r.key}
                      className={cn("border-b border-border/50 last:border-0", r.key === "onbekend" && "text-muted-foreground")}
                    >
                      <Td className="pl-0">
                        <p className="font-medium">{r.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {r.uitleg} · {nl(r.advertenties)} {r.advertenties === 1 ? "advertentie" : "advertenties"}
                        </p>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <VolumeBar width={(r.metrics.spend / maxSpend) * 100} />
                          <span className="text-xs tabular-nums">{eur(r.metrics.spend)}</span>
                        </div>
                      </Td>
                      <Td align="right">{nl(r.metrics.results)}</Td>
                      <Td align="right">{eur(r.derived.costPerResult, 2)}</Td>
                      <Td align="right" className="pr-0">{roas(r.derived.roas)}</Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
              <p className="mt-3 text-xs text-muted-foreground">
                {benoemd.length === 0
                  ? "Nog geen koopreden herkend. "
                  : `${nl(benoemd.length)} van de ${KOOPREDENEN.length} koopredenen in gebruik. `}
                {onbekend && tests.totaalSpend > 0
                  ? `${pct((onbekend.metrics.spend / Math.max(tests.totaalSpend, 1)) * 100, 0)} van het budget heeft nog geen koopreden in de naam. `
                  : ""}
                Zet de koopreden in de naam, bijvoorbeeld &quot;| Matchday |&quot;. Vergelijk koopredenen bij voorkeur
                binnen één exploitatie: filter daarvoor bovenaan.
              </p>
            </>
          )}
        </SectionCard>

        {/* Testen */}
        <SectionCard
          title="Testen"
          hint={`${TESTBUDGET.min}-${TESTBUDGET.max}% van het budget, beoordelen vanaf € ${TEST_DREMPEL}`}
        >
          <TestBalk aandeel={tests.aandeel} testSpend={tests.testSpend} />
          {tests.rijen.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Geen tests in deze periode. Een test herkent het dashboard aan &quot;test&quot; in de naam van de
              advertentie, set of campagne.
            </p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {tests.rijen.slice(0, 6).map((t) => (
                <li key={`${t.ad.platform}-${t.ad.id}`} className="flex items-center gap-3">
                  <AdHoverPreview ad={t.ad}>
                    <CreativeThumb src={t.ad.thumbnailUrl} alt={t.ad.name} />
                  </AdHoverPreview>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm" title={t.ad.name}>{t.ad.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {t.koopreden ? `${KOOPREDENEN.find((k) => k.key === t.koopreden)?.label} · ` : ""}
                      {eur(t.ad.metrics.spend)} · CPA {eur(t.derived.costPerResult, 2)}
                      {t.vergelijkCpa != null ? ` tegen ${eur(t.vergelijkCpa, 2)} bewezen` : ""}
                    </p>
                  </div>
                  <Badge tone={OORDEEL[t.oordeel].tone} className="shrink-0">{OORDEEL[t.oordeel].label}</Badge>
                </li>
              ))}
            </ul>
          )}
          {tests.rijen.length > 6 && (
            <p className="mt-3 text-xs text-muted-foreground">
              En nog {nl(tests.rijen.length - 6)} tests. Vergeleken met bewezen advertenties uit dezelfde exploitatie en fase.
            </p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function TopCreative({ ad, koopreden }: { ad: PaidAdsAd; koopreden: string | null }) {
  const d = derive(ad.metrics);
  return (
    <figure className="flex min-w-0 flex-col overflow-hidden rounded-sm border border-border">
      <AdHoverPreview ad={ad} className="flex w-full">
        <CreativeThumb
          src={ad.thumbnailUrl}
          alt={ad.name}
          className="aspect-[4/5] h-auto w-full rounded-none [&>img]:object-contain [&>svg]:h-6 [&>svg]:w-6"
        />
      </AdHoverPreview>
      <figcaption className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="truncate text-sm font-medium" title={ad.name}>{ad.name}</p>
        <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", PLATFORM_DOT[ad.platform])} />
          <span className="truncate">
            {PLATFORM_LABELS[ad.platform]}
            {koopreden ? ` · ${koopreden}` : ""}
          </span>
        </p>
        <p className="mt-auto text-xs tabular-nums">
          <span className="font-semibold">{nl(ad.metrics.results)} res.</span> · CPA {eur(d.costPerResult, 2)}
          {d.roas != null ? ` · ROAS ${roas(d.roas)}` : ""}
        </p>
      </figcaption>
    </figure>
  );
}

/** Het testbudget op een balk, met de afgesproken bandbreedte erin gemarkeerd. */
function TestBalk({ aandeel, testSpend }: { aandeel: number | null; testSpend: number }) {
  const waarde = aandeel ?? 0;
  const binnen = waarde >= TESTBUDGET.min && waarde <= TESTBUDGET.max;
  // De balk loopt tot 50%: daarboven is het geen test meer maar de hoofdzaak.
  const schaal = (v: number) => `${Math.min(v, 50) * 2}%`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-heading text-3xl uppercase leading-none">{aandeel != null ? pct(aandeel, 0) : "—"}</p>
        <Badge tone={aandeel == null ? "neutral" : binnen ? "good" : "warn"}>
          {aandeel == null
            ? "Geen besteding"
            : binnen
              ? "Binnen de afspraak"
              : waarde < TESTBUDGET.min
                ? "Minder dan afgesproken"
                : "Meer dan afgesproken"}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{eur(testSpend)} naar tests</p>
      <div className="relative mt-3 h-2.5 rounded-sm bg-muted">
        <div
          className="absolute inset-y-0 border-x border-psv-neutralDark/60 bg-psv-neutralDark/10"
          style={{ left: schaal(TESTBUDGET.min), width: `${(TESTBUDGET.max - TESTBUDGET.min) * 2}%` }}
          title={`Afspraak: ${TESTBUDGET.min}-${TESTBUDGET.max}%`}
        />
        <div className="absolute inset-y-0 left-0 rounded-sm bg-psv-red-primary" style={{ width: schaal(waarde) }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>0%</span>
        <span>afspraak {TESTBUDGET.min}-{TESTBUDGET.max}%</span>
        <span>50%</span>
      </div>
    </div>
  );
}

/** Het CPA-doel van één exploitatie, direct aan te passen. Leeg haalt het doel weg. */
function DoelInvoer({ waarde, onOpslaan }: { waarde: number | null; onOpslaan: (cpa: number | null) => Promise<void> }) {
  const [tekst, setTekst] = useState(waarde != null ? String(waarde).replace(".", ",") : "");
  const [status, setStatus] = useState<"rust" | "bezig" | "ok" | "fout">("rust");

  async function opslaan() {
    const schoon = tekst.trim().replace(/[€\s.]/g, "").replace(",", ".");
    const cpa = schoon === "" ? null : Number(schoon);
    if (cpa != null && (!Number.isFinite(cpa) || cpa <= 0)) {
      setStatus("fout");
      return;
    }
    if (cpa === waarde) return;
    setStatus("bezig");
    try {
      await onOpslaan(cpa);
      setStatus("ok");
      setTimeout(() => setStatus("rust"), 1500);
    } catch {
      setStatus("fout");
    }
  }

  return (
    <div className="inline-flex items-center justify-end gap-1.5">
      <span className="text-xs text-muted-foreground">€</span>
      <input
        value={tekst}
        onChange={(e) => {
          setTekst(e.target.value);
          setStatus("rust");
        }}
        onBlur={opslaan}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        inputMode="decimal"
        placeholder="geen"
        aria-label="CPA-doel"
        className={cn(
          "w-20 rounded-sm border bg-background px-2 py-1 text-right text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          status === "fout" ? "border-destructive" : "border-input"
        )}
      />
      <span className="w-4">
        {status === "bezig" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {status === "ok" && <Check className="h-3.5 w-3.5 text-success" />}
      </span>
    </div>
  );
}
