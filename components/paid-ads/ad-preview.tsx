"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import type { PaidAdsAd } from "@/lib/paid-ads/types";
import { cn } from "@/lib/utils";

/** De plaatsingen in het voorbeeld, met de verhouding erbij zoals in Ads Manager. */
const FORMATS = [
  { value: "INSTAGRAM_STANDARD", label: "Feed", ratio: "1:1 · 4:5" },
  { value: "INSTAGRAM_STORY", label: "Story", ratio: "9:16" },
  { value: "MOBILE_FEED_STANDARD", label: "Facebook", ratio: "feed" },
] as const;

type Format = (typeof FORMATS)[number]["value"];

type PreviewAd = Pick<PaidAdsAd, "id" | "name" | "platform">;

interface Preview {
  src: string;
  width: number;
  height: number;
}

/** Hoogte van het voorbeeld; grotere iframes worden geschaald. */
const MAX_HEIGHT = 520;
const PANEL_WIDTH = 340;
const OPEN_DELAY_MS = 300;
const CLOSE_DELAY_MS = 150;

/**
 * Gedeeld over alle advertenties: een voorbeeld dat al is opgehaald hoeft bij
 * de volgende keer hoveren niet opnieuw naar Meta. `null` = Meta heeft er geen.
 */
const cache = new Map<string, Promise<Preview | null>>();

function loadPreview(adId: string, format: Format): Promise<Preview | null> {
  const key = `${adId}:${format}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = fetch(`/api/paid-ads/meta/${encodeURIComponent(adId)}/preview?format=${format}`)
      .then((res) => (res.ok ? (res.json() as Promise<Preview>) : null))
      .catch(() => null);
    // Een mislukte poging niet bewaren, zodat de volgende hover het opnieuw probeert.
    pending.then((p) => {
      if (!p) cache.delete(key);
    });
    cache.set(key, pending);
  }
  return pending;
}

/**
 * Hover over de creative en Meta's eigen voorbeeld van de advertentie
 * verschijnt ernaast, in feed- of storyformaat. Alleen voor Meta; bij andere
 * platforms staat alleen de afbeelding er.
 */
export function AdHoverPreview({
  ad,
  children,
  className,
}: {
  ad: PreviewAd;
  children: ReactNode;
  className?: string;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = useCallback(() => {
    clear();
    timer.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  }, []);
  const hide = useCallback(() => {
    clear();
    timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, []);

  useEffect(() => clear, []);

  if (ad.platform !== "meta") return <>{children}</>;

  return (
    <span
      ref={triggerRef}
      className={cn("inline-flex", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      tabIndex={0}
      aria-label={`Voorbeeld van ${ad.name}`}
    >
      {children}
      {open && (
        <PreviewPanel
          ad={ad}
          anchor={triggerRef.current}
          onEnter={clear}
          onLeave={hide}
        />
      )}
    </span>
  );
}

function PreviewPanel({
  ad,
  anchor,
  onEnter,
  onLeave,
}: {
  ad: PreviewAd;
  anchor: HTMLElement | null;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [format, setFormat] = useState<Format>("INSTAGRAM_STANDARD");
  const [state, setState] = useState<{ format: Format; preview: Preview | null; loading: boolean }>({
    format,
    preview: null,
    loading: true,
  });
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ format, preview: null, loading: true });
    loadPreview(ad.id, format).then((preview) => {
      if (!cancelled) setState({ format, preview, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [ad.id, format]);

  // Naast de creative, binnen het scherm: rechts als het past, anders links.
  useLayoutEffect(() => {
    if (!anchor || !panelRef.current) return;
    const rect = anchor.getBoundingClientRect();
    const panel = panelRef.current.getBoundingClientRect();
    const gap = 12;
    const fitsRight = rect.right + gap + panel.width <= window.innerWidth - 8;
    const left = fitsRight ? rect.right + gap : Math.max(8, rect.left - gap - panel.width);
    const top = Math.min(Math.max(8, rect.top + rect.height / 2 - panel.height / 2), window.innerHeight - panel.height - 8);
    setPos({ top, left });
  }, [anchor, state]);

  const preview = state.preview;
  const scale = preview ? Math.min(1, MAX_HEIGHT / preview.height, (PANEL_WIDTH - 24) / preview.width) : 1;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Voorbeeld van ${ad.name}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: PANEL_WIDTH }}
      className="fixed z-50 rounded-sm border border-border bg-background p-3 shadow-xl"
    >
      <div className="mb-3 flex gap-1" role="tablist">
        {FORMATS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={format === f.value}
            onClick={() => setFormat(f.value)}
            className={cn(
              "flex-1 rounded-sm px-2 py-1.5 font-heading text-[11px] uppercase tracking-wide transition-colors",
              format === f.value
                ? "bg-psv-red-primary text-white"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
            <span className="ml-1 font-sans normal-case tracking-normal opacity-80">{f.ratio}</span>
          </button>
        ))}
      </div>

      <div className="flex min-h-[240px] items-center justify-center overflow-hidden rounded-sm bg-muted">
        {state.loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-psv-gray-09" aria-label="Voorbeeld laden" />
        ) : preview ? (
          <div style={{ width: preview.width * scale, height: preview.height * scale }}>
            <iframe
              key={preview.src}
              src={preview.src}
              title={`Voorbeeld van ${ad.name}`}
              width={preview.width}
              height={preview.height}
              scrolling="no"
              referrerPolicy="no-referrer"
              style={{ transform: `scale(${scale})`, transformOrigin: "top left", border: 0 }}
            />
          </div>
        ) : (
          <p className="px-4 text-center text-xs text-muted-foreground">
            Meta heeft geen voorbeeld van deze advertentie in deze plaatsing.
          </p>
        )}
      </div>

      <p className="mt-2 truncate text-[11px] text-muted-foreground" title={ad.name}>
        {ad.name}
      </p>
    </div>,
    document.body
  );
}
