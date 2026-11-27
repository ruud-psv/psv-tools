"use client";

import { useState } from "react";
import Link from "next/link";
import type { AssistentCreative } from "@/lib/assistent/creative-tools";
import { AdHoverPreview } from "@/components/paid-ads/ad-preview";
import { CreativeCopy, CreativeVideoPlayer } from "@/components/paid-ads/creative-copy";
import { CreativeThumb } from "@/components/paid-ads/shared";

/**
 * De advertenties die de assistent laat zien, als kaarten onder het antwoord:
 * de afbeelding (of video, af te spelen op de kaart) en de copy. Beeld en
 * video komen via de routes van Paid Ads, die steeds een verse URL bij Meta
 * ophalen; zo werken ze ook in een oud gesprek.
 */
export function AssistentCreatives({ creatives }: { creatives: AssistentCreative[] }) {
  if (creatives.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {creatives.map((c) => (
        <CreativeKaart key={c.adId} creative={c} />
      ))}
    </div>
  );
}

function CreativeKaart({ creative }: { creative: AssistentCreative }) {
  const { adId, naam, campagne, details } = creative;
  const [playing, setPlaying] = useState<number | null>(null);
  const videos = details.videoLijst ?? [];
  const beeld = `/api/paid-ads/meta/${encodeURIComponent(adId)}/image`;
  const titel = naam ?? `Advertentie ${adId}`;

  return (
    <figure className="flex min-w-0 flex-col overflow-hidden rounded-sm border border-border bg-card">
      {playing != null && videos.length > 0 ? (
        <CreativeVideoPlayer
          adId={adId}
          videos={videos}
          index={playing}
          poster={beeld}
          onSelect={setPlaying}
          onClose={() => setPlaying(null)}
        />
      ) : (
        <div className="relative bg-muted">
          <a href={beeld} target="_blank" rel="noreferrer" title="Open de afbeelding" className="block">
            <AdHoverPreview ad={{ id: adId, name: titel, platform: "meta" }} className="flex w-full">
              <CreativeThumb
                src={beeld}
                alt={titel}
                className="aspect-[4/5] h-auto w-full rounded-none [&>img]:object-contain [&>svg]:h-6 [&>svg]:w-6"
              />
            </AdHoverPreview>
          </a>
          {videos.length > 0 && (
            <button
              type="button"
              onClick={() => setPlaying(0)}
              className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-sm bg-psv-red-primary py-1 pl-1 pr-2 font-heading text-[11px] uppercase tracking-wide text-psv-white shadow hover:bg-psv-red-secondary"
              title="Speel de video af"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/psv/WHITE/ICON_PSV_white_video_PSV-play_button.svg" alt="" className="h-5 w-5" />
              {videos.length > 1 ? `${videos.length} video's` : "Video"}
            </button>
          )}
        </div>
      )}
      <figcaption className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold" title={titel}>
            {titel}
          </p>
          {campagne && (
            <p className="truncate text-[11px] text-muted-foreground" title={campagne}>
              {campagne}
            </p>
          )}
        </div>
        <CreativeCopy details={details} loading={false} />
        <Link
          href="/dashboard/paid-ads"
          className="mt-auto font-heading text-[11px] uppercase tracking-wide text-psv-red-primary hover:underline"
        >
          Naar Paid Ads
        </Link>
      </figcaption>
    </figure>
  );
}
