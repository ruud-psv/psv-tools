"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Crosshair, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fotoStijl } from "@/components/stuk/afbeelding";
import type { Uitsnede } from "@/lib/stukken/model";

/**
 * De uitsnede van een foto kiezen: klik of sleep op de foto om het punt te
 * kiezen dat in beeld moet blijven (bijvoorbeeld een gezicht), en zoom in met
 * de schuif. Het voorbeeld rechts toont het vak; de slide of het blok zelf
 * kan live meekijken via `onChange`.
 */

const MIDDEN: Uitsnede = { x: 50, y: 50, zoom: 1 };

export function UitsnedeKiezer({
  url,
  positie,
  onChange,
  onOpslaan,
  onAnnuleer,
  bezig = false,
  verhouding = "16 / 9",
}: {
  url: string;
  positie?: Uitsnede;
  onChange: (positie: Uitsnede) => void;
  /** Zonder: geen eigen knoppen (de uitsnede gaat mee met een ander Opslaan). */
  onOpslaan?: () => void;
  onAnnuleer?: () => void;
  bezig?: boolean;
  /** De verhouding van het vak in het voorbeeld, als CSS aspect-ratio. */
  verhouding?: string;
}) {
  const p = positie ?? MIDDEN;
  const vlak = useRef<HTMLDivElement>(null);
  const slepen = useRef(false);

  function zetPunt(e: ReactPointerEvent) {
    const r = vlak.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
    onChange({ ...p, x: Math.round(x), y: Math.round(y) });
  }

  return (
    <div className="space-y-3 border border-border bg-card p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <div>
          <p className="mb-1 font-heading text-[11px] uppercase tracking-wide text-muted-foreground">Klik of sleep naar wat in beeld moet blijven</p>
          <div
            ref={vlak}
            className="relative inline-block max-w-full cursor-crosshair touch-none select-none"
            onPointerDown={(e) => {
              slepen.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              zetPunt(e);
            }}
            onPointerMove={(e) => slepen.current && zetPunt(e)}
            onPointerUp={() => (slepen.current = false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- de hele foto, om het punt te kiezen */}
            <img src={url} alt="" draggable={false} className="block max-h-[260px] max-w-full" />
            <span
              className="pointer-events-none absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[#e30713]/80 text-white shadow"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              <Crosshair className="h-4 w-4" />
            </span>
          </div>
        </div>
        <div>
          <p className="mb-1 font-heading text-[11px] uppercase tracking-wide text-muted-foreground">Zo valt hij in het vak</p>
          <div className="relative w-full overflow-hidden bg-muted" style={{ aspectRatio: verhouding }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- voorbeeld van de uitsnede */}
            <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" style={fotoStijl(p)} />
          </div>
        </div>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <span className="w-16 font-heading text-[11px] uppercase tracking-wide text-muted-foreground">Zoom</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={p.zoom}
          onChange={(e) => onChange({ ...p, zoom: Number(e.target.value) })}
          className="flex-1 accent-[#e30713]"
          aria-label="Zoom"
        />
        <span className="w-12 text-right tabular-nums">{Math.round(p.zoom * 100)}%</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange(MIDDEN)} disabled={bezig}>
          Midden, niet ingezoomd
        </Button>
        {onOpslaan && (
          <>
            <Button type="button" size="sm" onClick={onOpslaan} disabled={bezig} className="ml-auto">
              {bezig && <Loader2 className="animate-spin" />}
              Uitsnede opslaan
            </Button>
            {onAnnuleer && (
              <Button type="button" size="sm" variant="ghost" onClick={onAnnuleer} disabled={bezig}>
                Annuleren
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
