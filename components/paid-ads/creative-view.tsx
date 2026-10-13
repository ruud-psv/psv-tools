"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  adsByAdSet,
  adsWithoutResults,
  byFormat,
  derive,
  saturation,
  toneForCpa,
  type AdSetGroup,
} from "@/lib/paid-ads/derive";
import { eur, nl, pct, roas } from "@/lib/paid-ads/format";
import {
  AUDIENCE_LABELS,
  PLATFORM_LABELS,
  type PaidAdsAd,
  type PaidAdsAdSet,
} from "@/lib/paid-ads/types";
import {
  Badge,
  BarRow,
  CreativeThumb,
  DataTable,
  EmptySection,
  PLATFORM_DOT,
  SectionCard,
  Td,
  Th,
  VolumeBar,
} from "./shared";
import type { PaidViewProps } from "./shared";
import { cn } from "@/lib/utils";

/** Zoveel advertentiesets staan er standaard; de rest achter "Toon alle". */
const VISIBLE_SETS = 8;
/** Zoveel advertenties staan er standaard in de galerij. */
const VISIBLE_ADS = 8;

export function CreativeView({ data, scored, avgCpa }: PaidViewProps) {
  const formats = useMemo(() => byFormat(data.ads), [data.ads]);
  const maxFormatResults = useMemo(
    () => Math.max(...formats.map((f) => f.metrics.results), 1),
    [formats]
  );
  const saturated = useMemo(() => saturation(scored), [scored]);
  const idle = useMemo(
    () => adsWithoutResults(data.ads, data.adSets, data.campaigns),
    [data.ads, data.adSets, data.campaigns]
  );
  const sets = useMemo(() => adsByAdSet(data.adSets, data.ads), [data.adSets, data.ads]);
  const [showAllSets, setShowAllSets] = useState(false);

  return (
    <div className="space-y-6">
      <AdGallery ads={data.ads} adSets={data.adSets} />

      {/* Format performance */}
      <SectionCard title="Format performance" hint="welk format levert het resultaat op">
        {formats.length === 0 ? (
          <EmptySection>
            Formats verschijnen zodra advertenties met een formatlabel binnenkomen.
          </EmptySection>
        ) : (
          <div className="grid grid-cols-[1.6fr_repeat(4,minmax(72px,0.55fr))] items-center gap-x-4 gap-y-3">
            <p className="font-heading text-[10px] uppercase tracking-wider text-muted-foreground">Format</p>
            <p className="text-right font-heading text-[10px] uppercase tracking-wider text-muted-foreground">CTR</p>
            <p className="text-right font-heading text-[10px] uppercase tracking-wider text-muted-foreground">CVR</p>
            <p className="text-right font-heading text-[10px] uppercase tracking-wider text-muted-foreground">CPA</p>
            <p className="text-right font-heading text-[10px] uppercase tracking-wider text-muted-foreground">Besteed</p>

            {formats.map((f) => (
              <FormatRow
                key={f.key}
                label={f.label}
                results={f.metrics.results}
                width={(f.metrics.results / maxFormatResults) * 100}
                ctr={f.derived.ctr}
                cvr={f.derived.cvr}
                cpa={f.derived.costPerResult}
                spend={f.metrics.spend}
                avgCpa={avgCpa}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Saturation monitor */}
        <SectionCard title="Saturation monitor" hint="frequentie per campagne">
          {saturated.length === 0 ? (
            <EmptySection>
              Frequentie is beschikbaar zodra een platform bereik én weergaven rapporteert.
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
                      {/* Schaal tot 8: daarboven is elke campagne verzadigd. */}
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

        {/* Besteed zonder resultaat */}
        <SectionCard
          title="Besteed zonder resultaat"
          hint={
            idle.count > 0
              ? `${nl(idle.count)} ${idle.count === 1 ? "advertentie" : "advertenties"} · ${eur(idle.spend)}${
                  idle.share != null ? ` · ${pct(idle.share, 0)} van het conversiebudget` : ""
                }`
              : "conversiecampagnes"
          }
        >
          {idle.rows.length === 0 ? (
            <EmptySection>
              Geen advertenties in conversiecampagnes die budget verbruiken zonder resultaat.
            </EmptySection>
          ) : (
            <div className="space-y-3">
              {idle.rows.map((a) => (
                <div key={`${a.platform}-${a.id}`} className="flex items-center gap-3">
                  <CreativeThumb src={a.thumbnailUrl} alt={a.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{a.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {PLATFORM_LABELS[a.platform]}
                      {a.adSetName ? ` · ${a.adSetName}` : ""} · {nl(a.clicks)} clicks · CTR {pct(a.ctr)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{eur(a.spend)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Advertenties per advertentieset */}
      <SectionCard
        title="Advertenties per advertentieset"
        hint="CPA afgezet tegen het gemiddelde van de eigen set"
      >
        {sets.length === 0 ? (
          <EmptySection>
            Verschijnt zodra advertenties binnenkomen. LinkedIn levert nog geen advertentieniveau.
          </EmptySection>
        ) : (
          <>
            <div className="divide-y divide-border border-y border-border">
              {(showAllSets ? sets : sets.slice(0, VISIBLE_SETS)).map((group, i) => (
                <AdSetBlock key={`${group.adSet.platform}-${group.adSet.id}`} group={group} defaultOpen={i === 0} />
              ))}
            </div>
            {sets.length > VISIBLE_SETS && (
              <button
                onClick={() => setShowAllSets((v) => !v)}
                className="mt-3 font-heading text-xs uppercase tracking-wide text-psv-red-primary hover:underline"
              >
                {showAllSets ? "Toon minder" : `Toon alle ${nl(sets.length)} advertentiesets`}
              </button>
            )}
          </>
        )}
      </SectionCard>
    </div>
  );
}

/**
 * De advertenties zelf, op volgorde van besteding. Alleen advertenties waarvan
 * het platform een afbeelding levert; een klik opent de afbeelding volledig.
 */
function AdGallery({ ads, adSets }: { ads: PaidAdsAd[]; adSets: PaidAdsAdSet[] }) {
  const [showAll, setShowAll] = useState(false);
  const setNames = useMemo(
    () => new Map(adSets.map((s) => [`${s.platform}:${s.id}`, s.name])),
    [adSets]
  );
  const withImage = useMemo(
    () =>
      ads
        .filter((a) => a.thumbnailUrl)
        .sort((a, b) => b.metrics.spend - a.metrics.spend),
    [ads]
  );
  const visible = showAll ? withImage : withImage.slice(0, VISIBLE_ADS);

  return (
    <SectionCard
      title="Advertentievoorbeelden"
      hint={withImage.length > 0 ? `${nl(withImage.length)} met afbeelding · op besteding` : undefined}
    >
      {withImage.length === 0 ? (
        <EmptySection>
          Afbeeldingen verschijnen zodra Meta-advertenties binnenkomen. Google Ads, TikTok en LinkedIn
          leveren nog geen afbeeldingen.
        </EmptySection>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((ad) => (
              <AdPreview
                key={`${ad.platform}-${ad.id}`}
                ad={ad}
                adSetName={setNames.get(`${ad.platform}:${ad.adSetId}`) ?? null}
              />
            ))}
          </div>
          {withImage.length > VISIBLE_ADS && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-4 font-heading text-xs uppercase tracking-wide text-psv-red-primary hover:underline"
            >
              {showAll ? "Toon minder" : `Toon alle ${nl(withImage.length)} advertenties`}
            </button>
          )}
        </>
      )}
    </SectionCard>
  );
}

function AdPreview({ ad, adSetName }: { ad: PaidAdsAd; adSetName: string | null }) {
  const d = derive(ad.metrics);
  return (
    <figure className="flex min-w-0 flex-col overflow-hidden rounded-sm border border-border">
      <a
        href={ad.thumbnailUrl ?? undefined}
        target="_blank"
        rel="noreferrer"
        title="Open de afbeelding"
        className="block bg-muted"
      >
        <CreativeThumb
          src={ad.thumbnailUrl}
          alt={ad.name}
          className="aspect-[4/5] h-auto w-full rounded-none [&>img]:object-contain [&>svg]:h-6 [&>svg]:w-6"
        />
      </a>
      <figcaption className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={ad.name}>
            {ad.name}
          </p>
          <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", PLATFORM_DOT[ad.platform])} />
            <span className="truncate">
              {PLATFORM_LABELS[ad.platform]}
              {ad.format ? ` · ${ad.format}` : ""}
              {adSetName ? ` · ${adSetName}` : ""}
            </span>
          </p>
        </div>
        <dl className="mt-auto grid grid-cols-3 gap-x-2 gap-y-1.5 text-xs tabular-nums">
          <Stat label="Besteed" value={eur(ad.metrics.spend)} />
          <Stat label="CTR" value={pct(d.ctr)} />
          <Stat label="Res." value={nl(ad.metrics.results)} />
          <Stat label="CPC" value={eur(d.cpc, 2)} />
          <Stat label="CPA" value={eur(d.costPerResult, 2)} />
          <Stat label="ROAS" value={roas(d.roas)} />
        </dl>
      </figcaption>
    </figure>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-heading text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}

/** Eén advertentieset: totalen in de kop, de advertenties eronder. */
function AdSetBlock({ group, defaultOpen }: { group: AdSetGroup; defaultOpen: boolean }) {
  const { adSet, derived, ads } = group;
  return (
    <details open={defaultOpen} className="group/set">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <ChevronRight className="h-4 w-4 shrink-0 text-psv-red-primary transition-transform group-open/set:rotate-90" />
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", PLATFORM_DOT[adSet.platform])} />
          <span className="truncate text-sm font-medium">{adSet.name}</span>
          {adSet.audienceType && (
            <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 font-heading text-[10px] uppercase tracking-wide text-muted-foreground">
              {AUDIENCE_LABELS[adSet.audienceType]}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-4 pl-6 text-xs tabular-nums text-muted-foreground">
          <span>
            {nl(ads.length)} {ads.length === 1 ? "advertentie" : "advertenties"}
          </span>
          <span>{eur(adSet.metrics.spend)}</span>
          <span>{nl(adSet.metrics.results)} res.</span>
          {adSet.metrics.revenue > 0 && <span>{eur(adSet.metrics.revenue)} waarde</span>}
          {derived.roas != null && <span>ROAS {roas(derived.roas)}</span>}
          <span className="font-semibold text-foreground">CPA {eur(derived.costPerResult, 2)}</span>
        </span>
      </summary>
      <div className="pb-4 pl-6">
        <DataTable>
          <thead>
            <tr className="border-b border-border">
              <Th className="pl-0">Advertentie</Th>
              <Th className="min-w-[140px]">Aandeel budget</Th>
              <Th align="right">CTR</Th>
              <Th align="right">CPC</Th>
              <Th align="right">Resultaten</Th>
              <Th align="right">Conv.waarde</Th>
              <Th align="right">ROAS</Th>
              <Th align="right" className="pr-0">CPA</Th>
            </tr>
          </thead>
          <tbody>
            {ads.map(({ ad, derived: d, spendShare, tone }) => (
              <tr key={ad.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40">
                <Td className="max-w-[320px] pl-0">
                  <div className="flex items-center gap-3">
                    <CreativeThumb src={ad.thumbnailUrl} alt={ad.name} />
                    <div className="min-w-0">
                      <p className="truncate">{ad.name}</p>
                      {ad.format && <p className="text-[11px] text-muted-foreground">{ad.format}</p>}
                    </div>
                  </div>
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <VolumeBar width={spendShare} />
                    <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                      {pct(spendShare, 0)}
                    </span>
                  </div>
                </Td>
                <Td align="right">{pct(d.ctr)}</Td>
                <Td align="right">{eur(d.cpc, 2)}</Td>
                <Td align="right">{nl(ad.metrics.results)}</Td>
                <Td align="right">{ad.metrics.revenue > 0 ? eur(ad.metrics.revenue) : "—"}</Td>
                <Td align="right">{roas(d.roas)}</Td>
                <Td align="right" className="pr-0">
                  <Badge tone={tone}>{eur(d.costPerResult, 2)}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </details>
  );
}

function FormatRow({
  label,
  results,
  width,
  ctr,
  cvr,
  cpa,
  spend,
  avgCpa,
}: {
  label: string;
  results: number;
  width: number;
  ctr: number | null;
  cvr: number | null;
  cpa: number | null;
  spend: number;
  avgCpa: number | null;
}) {
  return (
    <>
      <div className="min-w-0">
        <div className="mb-1 flex justify-between gap-3 text-sm">
          <span className="truncate text-muted-foreground">{label}</span>
          <span className="font-semibold tabular-nums">{nl(results)}</span>
        </div>
        <div className="flex">
          <VolumeBar width={width} />
        </div>
      </div>
      <p className="text-right text-sm tabular-nums">{pct(ctr)}</p>
      <p className="text-right text-sm tabular-nums">{pct(cvr)}</p>
      <p className="text-right">
        <Badge tone={toneForCpa(cpa, avgCpa)}>{eur(cpa, 2)}</Badge>
      </p>
      <p className="text-right text-sm tabular-nums text-muted-foreground">{eur(spend)}</p>
    </>
  );
}
