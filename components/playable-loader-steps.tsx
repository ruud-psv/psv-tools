"use client";

import { cn } from "@/lib/utils";

/**
 * De stappen van de Playable loader, als pijlen naast elkaar (naar het
 * voorbeeld van de flow in Maileon). Rood is waar je bent, groen is klaar,
 * oranje vraagt aandacht, grijs komt nog.
 */

export type StapId = "campagne" | "aanpassen" | "publiceren" | "code";
export type StapStaat = "huidig" | "klaar" | "aandacht" | "open";

export interface Stap {
  id: StapId;
  label: string;
  staat: StapStaat;
  /** Uit zolang er nog geen campagne is geopend. */
  disabled?: boolean;
  /** Korte uitleg bij de staat, voor schermlezers en als tooltip. */
  hint?: string;
}

const PUNT = 14;

const KLEUR: Record<StapStaat, string> = {
  huidig: "bg-primary text-primary-foreground",
  klaar: "bg-success text-white",
  aandacht: "bg-warning text-white",
  open: "bg-muted text-muted-foreground hover:bg-secondary",
};

export function StappenBalk({ stappen, onKies }: { stappen: Stap[]; onKies: (id: StapId) => void }) {
  return (
    <nav aria-label="Stappen" className="overflow-x-auto">
      <ol className="flex min-w-max gap-1">
        {stappen.map((stap, i) => {
          const eerste = i === 0;
          const clipPath = eerste
            ? `polygon(0 0, calc(100% - ${PUNT}px) 0, 100% 50%, calc(100% - ${PUNT}px) 100%, 0 100%)`
            : `polygon(0 0, calc(100% - ${PUNT}px) 0, 100% 50%, calc(100% - ${PUNT}px) 100%, 0 100%, ${PUNT}px 50%)`;
          return (
            <li key={stap.id} className={cn(!eerste && "-ml-1")}>
              <button
                type="button"
                onClick={() => onKies(stap.id)}
                disabled={stap.disabled}
                aria-current={stap.staat === "huidig" ? "step" : undefined}
                title={stap.hint}
                className={cn(
                  "flex h-10 min-w-[150px] items-center justify-center gap-2 font-heading text-sm uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  eerste ? "pl-4 pr-6" : "pl-7 pr-6",
                  KLEUR[stap.staat]
                )}
                style={{ clipPath }}
              >
                <span aria-hidden="true">{i + 1}</span>
                {stap.label}
                {stap.hint && <span className="sr-only">: {stap.hint}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
