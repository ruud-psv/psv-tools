"use client";

import { createContext, useContext, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ImagePlus, Images, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
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
  /** Het doel waarvoor nu een upload loopt. */
  bezig: string | null;
  uit?: boolean;
}

const Context = createContext<AfbeeldingActies | null>(null);

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
export function VervangFoto({ doel, wens, className, style }: { doel: string; wens?: string; className?: string; style?: CSSProperties }) {
  const acties = useAfbeeldingActies();
  if (!acties) return null;
  return (
    <span className={cn("absolute right-2 top-2 z-10 flex gap-1.5 print:hidden", className)} style={style}>
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
