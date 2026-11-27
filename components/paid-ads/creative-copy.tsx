"use client";

import { useEffect, useMemo, useState } from "react";
import { ctaLabel, type CreativeDetails, type CreativeVideo } from "@/lib/meta-ads/creative";
import type { PaidAdsAd } from "@/lib/paid-ads/types";
import { cn } from "@/lib/utils";

/** Wat de route per advertentie teruggeeft; ontbreekt een ID, dan kende Meta hem niet. */
type CopyMap = Record<string, CreativeDetails>;

/** Eén keer per advertentie ophalen, ook als de galerij opnieuw rendert. */
const cache = new Map<string, CreativeDetails | null>();

/** De route accepteert hooguit honderd ID's per aanvraag. */
const BATCH = 100;

/**
 * De copy van de Meta-advertenties in `ads`, opgehaald in één aanvraag per
 * honderd. Zolang die loopt, staat `loading` aan; mislukt hij, dan blijft de
 * copy weg en zegt `failed` dat.
 */
export function useMetaCreativeCopy(ads: PaidAdsAd[]) {
  const ids = useMemo(
    () => [...new Set(ads.filter((a) => a.platform === "meta").map((a) => a.id))].sort(),
    [ads]
  );
  const key = ids.join(",");
  const [, rerender] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const missing = key ? key.split(",").filter((id) => !cache.has(id)) : [];
    if (missing.length === 0) return;
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);

    const batches: string[][] = [];
    for (let i = 0; i < missing.length; i += BATCH) batches.push(missing.slice(i, i + BATCH));

    Promise.all(
      batches.map(async (batch) => {
        const res = await fetch(`/api/paid-ads/meta/creatives?ids=${batch.join(",")}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { creatives?: CopyMap };
        for (const id of batch) cache.set(id, body.creatives?.[id] ?? null);
      })
    )
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.error("[paid-ads] copy van de creatives niet opgehaald", error);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          rerender((n) => n + 1);
        }
      });

    return () => controller.abort();
  }, [key]);

  return {
    get: (ad: PaidAdsAd) => (ad.platform === "meta" ? cache.get(ad.id) ?? null : null),
    loading,
    failed,
  };
}

const SOORT_LABEL: Record<CreativeDetails["soort"], string | null> = {
  afbeelding: null,
  video: "Video",
  carrousel: "Carrousel",
  dynamisch: "Advantage+",
  post: "Bestaande post",
  onbekend: null,
};

/** Hoeveel varianten er nog meer zijn, als tekst achter de eerste. */
function meer(lijst: string[]): string | null {
  return lijst.length > 1 ? `+${lijst.length - 1} ${lijst.length === 2 ? "variant" : "varianten"}` : null;
}

/** De copy van één advertentie onder het voorbeeld in de galerij. */
export function CreativeCopy({
  details,
  loading,
  className,
}: {
  details: CreativeDetails | null;
  loading: boolean;
  className?: string;
}) {
  if (!details) {
    if (!loading) return null;
    return (
      <div className={cn("space-y-1.5", className)} aria-hidden>
        <div className="h-3 w-3/4 animate-pulse rounded-sm bg-muted" />
        <div className="h-3 w-full animate-pulse rounded-sm bg-muted" />
        <div className="h-3 w-5/6 animate-pulse rounded-sm bg-muted" />
      </div>
    );
  }

  const tekst = details.teksten[0];
  const kop = details.koppen[0];
  const cta = details.ctas[0];
  const soort = SOORT_LABEL[details.soort];
  const kaarten = details.kaarten.length;
  const varianten = [meer(details.teksten), meer(details.koppen)].filter(Boolean);
  if (!tekst && !kop && !cta && !soort) return null;

  return (
    <div className={cn("space-y-1.5 text-xs", className)}>
      {tekst && (
        <p className="line-clamp-3 whitespace-pre-line text-foreground" title={details.teksten.join("\n\n—\n\n")}>
          {tekst}
        </p>
      )}
      {kop && (
        <p className="truncate font-bold" title={details.koppen.join("\n")}>
          {kop}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {cta && (
          <span
            className="rounded-sm border border-border px-1.5 py-0.5 font-heading text-[10px] uppercase tracking-wide"
            title={details.ctas.map(ctaLabel).join(", ")}
          >
            {ctaLabel(cta)}
          </span>
        )}
        {soort && (
          <span className="rounded-sm bg-muted px-1.5 py-0.5 font-heading text-[10px] uppercase tracking-wide text-muted-foreground">
            {soort}
            {kaarten > 1 ? ` · ${kaarten}` : ""}
          </span>
        )}
        {varianten.length > 0 && (
          <span className="text-[11px] text-muted-foreground">{varianten.join(" · ")}</span>
        )}
      </div>
    </div>
  );
}

/**
 * Speelt een video van de advertentie af op de plek van het voorbeeld. Het
 * bestand komt via `/api/paid-ads/meta/[adId]/video`, die doorstuurt naar een
 * verse URL bij Meta. Bij meerdere video's (carrousel, Advantage+) kies je
 * eronder welke.
 */
export function CreativeVideoPlayer({
  adId,
  videos,
  index,
  poster,
  onSelect,
  onClose,
}: {
  adId: string;
  videos: CreativeVideo[];
  index: number;
  poster: string | null;
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  const [failed, setFailed] = useState<number | null>(null);
  const src = `/api/paid-ads/meta/${encodeURIComponent(adId)}/video?n=${index}`;

  return (
    <div className="relative bg-psv-black">
      {failed === index ? (
        <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-psv-white">
          <p>Meta gaf deze video niet vrij.</p>
          <p className="text-psv-gray-09">
            Mogelijk mist het token leesrechten op de pagina waar de video bij hoort.
          </p>
        </div>
      ) : (
        <video
          key={src}
          src={src}
          poster={index === 0 ? poster ?? undefined : undefined}
          controls
          autoPlay
          playsInline
          preload="metadata"
          onError={() => setFailed(index)}
          className="aspect-[4/5] w-full object-contain"
        />
      )}
      <button
        type="button"
        onClick={onClose}
        title="Terug naar het voorbeeld"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-sm bg-psv-black/70 hover:bg-psv-black"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/psv/WHITE/2px/ICON_PSV_white_cross_2px.svg" alt="Sluiten" className="h-4 w-4" />
      </button>
      {videos.length > 1 && (
        <div className="flex flex-wrap gap-1 bg-psv-black px-2 pb-2">
          {videos.map((v, i) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onSelect(i)}
              className={cn(
                "rounded-sm px-1.5 py-0.5 font-heading text-[10px] uppercase tracking-wide",
                i === index ? "bg-psv-red-primary text-psv-white" : "bg-psv-white/10 text-psv-white hover:bg-psv-white/20"
              )}
            >
              Video {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
