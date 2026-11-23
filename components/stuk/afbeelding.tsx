"use client";

import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ImagePlus, Images, Loader2, Minus, Plus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Uitsnede } from "@/lib/stukken/model";
import { FileflowKiezer } from "@/components/stuk/fileflow-kiezer";

/**
 * Foto's toevoegen in het voorbeeld van een stuk. Het paneel naast de chat
 * geeft deze acties door; op de afdrukpagina en de deellink zijn ze er niet,
 * en dan verdwijnt een lege plek gewoon (een gedeeld stuk toont geen gaten).
 */

export interface AfbeeldingActies {
  /** `doel` is een blok-id of "titel". */
  upload: (doel: string, bestand: File) => void;
  /** Een foto uit FileFlow: de server haalt hem op en zet een kopie in het stuk. */
  uitFileflow: (doel: string, fileflowId: number) => void;
  /** De uitsnede van een foto opslaan (na slepen of zoomen); zonder: niet te verslepen. */
  positie?: (doel: string, positie: Uitsnede | null) => void;
  /** Het doel waarvoor nu een upload loopt. */
  bezig: string | null;
  uit?: boolean;
}

const Context = createContext<AfbeeldingActies | null>(null);

/**
 * De stijl van een foto met zijn uitsnede: het focuspunt blijft in beeld
 * (object-position) en de zoom schaalt vanuit dat punt. Voor een <img> met
 * object-cover in een vak met overflow hidden.
 */
export function fotoStijl(positie?: Uitsnede): CSSProperties {
  if (!positie) return {};
  const punt = `${positie.x}% ${positie.y}%`;
  return { objectPosition: punt, ...(positie.zoom > 1 && { transform: `scale(${positie.zoom})`, transformOrigin: punt }) };
}

/** Met `acties={null}`: geen knoppen (bijvoorbeeld in een kleine slide die zelf een knop is). */
export function AfbeeldingProvider({ acties, children }: { acties: AfbeeldingActies | null; children: ReactNode }) {
  return <Context.Provider value={acties}>{children}</Context.Provider>;
}

export function useAfbeeldingActies(): AfbeeldingActies | null {
  return useContext(Context);
}

function Kiezer({ doel, children, className }: { doel: string; children: (open: () => void, bezig: boolean) => ReactNode; className?: string }) {
  const acties = useAfbeeldingActies();
  const input = useRef<HTMLInputElement>(null);
  if (!acties) return null;
  const bezig = acties.bezig === doel;
  return (
    <span className={className}>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const bestand = e.target.files?.[0];
          e.target.value = "";
          if (bestand) acties.upload(doel, bestand);
        }}
      />
      {children(() => !acties.uit && !bezig && input.current?.click(), bezig || Boolean(acties.uit))}
    </span>
  );
}

/** Knop die de FileFlow-kiezer opent, met de wens als eerste zoekterm. */
function ZoekInFileflow({ doel, wens, className, klein = false }: { doel: string; wens?: string; className?: string; klein?: boolean }) {
  const acties = useAfbeeldingActies();
  const [open, setOpen] = useState(false);
  if (!acties) return null;
  const uit = Boolean(acties.uit) || acties.bezig === doel;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!uit) setOpen(true);
        }}
        disabled={uit}
        className={cn("btn inline-flex items-center gap-2 disabled:opacity-60", klein ? "btn--white text-xs shadow-card" : "btn--secondary", className)}
      >
        <Images className={klein ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {klein ? "FileFlow" : "Zoek in FileFlow"}
      </button>
      {open && (
        <FileflowKiezer
          wens={wens}
          onSluit={() => setOpen(false)}
          onKies={(beeld) => {
            setOpen(false);
            acties.uitFileflow(doel, beeld.id);
          }}
        />
      )}
    </>
  );
}

/** Een lege plek voor een foto, met wat erop moet en een knop. Alleen in het voorbeeld. */
export function AfbeeldingPlek({ doel, wens, groot = false, className, style }: { doel: string; wens?: string; groot?: boolean; className?: string; style?: CSSProperties }) {
  const acties = useAfbeeldingActies();
  if (!acties) return null;
  return (
    <div
      style={style}
      className={cn(
        "flex h-full flex-col items-center justify-center gap-3 border-2 border-dashed print:hidden border-psv-gray-09 bg-psv-gray-07 p-6 text-center text-psv-gray-11",
        groot ? "min-h-[240px]" : "min-h-[180px]",
        className
      )}
    >
      <ImagePlus className={cn("text-psv-red-primary", groot ? "h-12 w-12" : "h-8 w-8")} />
      {wens && <p className={cn("max-w-md", groot ? "text-xl" : "text-sm")}>{wens}</p>}
      <Kiezer doel={doel}>
        {(open, bezig) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              open();
            }}
            disabled={bezig}
            className={cn("btn inline-flex items-center gap-2 disabled:opacity-60", groot && "btn--medium text-lg")}
          >
            {acties.bezig === doel ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            Foto toevoegen
          </button>
        )}
      </Kiezer>
      <ZoekInFileflow doel={doel} wens={wens?.replace(/^Titelfoto: /, "")} className={groot ? "btn--medium text-lg" : undefined} />
      <p className={cn("text-psv-gray-10", groot ? "text-sm" : "text-xs")}>JPG, PNG of WebP, hooguit 4 MB</p>
    </div>
  );
}

/** Kleine knoppen over een foto heen om hem te vervangen: uploaden of uit FileFlow. Alleen in het voorbeeld. */
export function VervangFoto({
  doel,
  wens,
  className,
  style,
  positie,
  zoom = false,
}: {
  doel: string;
  wens?: string;
  className?: string;
  style?: CSSProperties;
  positie?: Uitsnede;
  /** Ook − en + voor de zoom (als er een foto is). */
  zoom?: boolean;
}) {
  const acties = useAfbeeldingActies();
  if (!acties) return null;
  return (
    <span className={cn("absolute right-2 top-2 z-10 flex gap-1.5 print:hidden", className)} style={style}>
      {zoom && <Zoom doel={doel} positie={positie} />}
      <ZoekInFileflow doel={doel} wens={wens} klein />
      <VervangUpload doel={doel} />
    </span>
  );
}

function VervangUpload({ doel }: { doel: string }) {
  const acties = useAfbeeldingActies();
  if (!acties) return null;
  return (
    <Kiezer doel={doel}>
      {(open, bezig) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
          disabled={bezig}
          className="btn btn--white inline-flex items-center gap-1.5 text-xs shadow-card disabled:opacity-60"
        >
          {acties.bezig === doel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Uploaden
        </button>
      )}
    </Kiezer>
  );
}


const MIDDEN: Uitsnede = { x: 50, y: 50, zoom: 1 };
const isMidden = (p: Uitsnede) => p.x === 50 && p.y === 50 && p.zoom === 1;

/**
 * Een foto die je in het voorbeeld kunt verslepen: slepen verschuift welk deel
 * in beeld staat (de uitsnede), loslaten slaat het op. Buiten het voorbeeld
 * (deellink, afdruk, presentatie) een gewone foto.
 */
export function SleepbareFoto({ src, alt, positie, doel, className }: { src: string; alt: string; positie?: Uitsnede; doel: string; className?: string }) {
  const acties = useAfbeeldingActies();
  const [live, setLive] = useState<Uitsnede>(positie ?? MIDDEN);
  const start = useRef<{ x: number; y: number; px: number; py: number; w: number; h: number; bewogen: boolean } | null>(null);
  useEffect(() => setLive(positie ?? MIDDEN), [positie]);
  const kan = Boolean(acties?.positie) && !acties?.uit;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- een foto van onze CDN, ook in de afdruk
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={cn(className, kan && "cursor-move touch-none")}
      style={fotoStijl(live)}
      title={kan ? "Sleep om te bepalen welk deel in beeld staat" : undefined}
      onClick={(e) => kan && e.stopPropagation()}
      onPointerDown={(e) => {
        if (!kan) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        start.current = { x: live.x, y: live.y, px: e.clientX, py: e.clientY, w: r.width, h: r.height, bewogen: false };
      }}
      onPointerMove={(e) => {
        const b = start.current;
        if (!b) return;
        const dx = e.clientX - b.px;
        const dy = e.clientY - b.py;
        if (Math.abs(dx) + Math.abs(dy) > 3) b.bewogen = true;
        // Naar rechts slepen schuift de foto naar rechts: het focuspunt gaat naar links.
        const k = 150 / live.zoom;
        setLive((l) => ({
          ...l,
          x: Math.round(Math.min(100, Math.max(0, b.x - (dx / b.w) * k))),
          y: Math.round(Math.min(100, Math.max(0, b.y - (dy / b.h) * k))),
        }));
      }}
      onPointerUp={() => {
        const b = start.current;
        start.current = null;
        if (b?.bewogen && acties?.positie) acties.positie(doel, isMidden(live) ? null : live);
      }}
    />
  );
}

/** − en + om in te zoomen op een foto in het voorbeeld. */
function Zoom({ doel, positie }: { doel: string; positie?: Uitsnede }) {
  const acties = useAfbeeldingActies();
  if (!acties?.positie) return null;
  const p = positie ?? MIDDEN;
  const zet = (zoom: number) => {
    const nieuw = { ...p, zoom: Math.round(Math.min(3, Math.max(1, zoom)) * 100) / 100 };
    acties.positie!(doel, isMidden(nieuw) ? null : nieuw);
  };
  const knop = "btn btn--white inline-flex items-center px-2 text-xs shadow-card disabled:opacity-40";
  return (
    <>
      <button type="button" className={knop} title="Uitzoomen" disabled={p.zoom <= 1 || acties.uit} onClick={(e) => (e.stopPropagation(), zet(p.zoom - 0.2))}>
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={knop} title="Inzoomen" disabled={p.zoom >= 3 || acties.uit} onClick={(e) => (e.stopPropagation(), zet(p.zoom + 0.2))}>
        <Plus className="h-3.5 w-3.5" />
      </button>
    </>
  );
}
