"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AfbeeldingProvider } from "@/components/stuk/afbeelding";
import { SlideInhoud, zichtbareSlides } from "@/components/stuk/deck-weergave";
import type { StukInhoud } from "@/lib/stukken/model";

/**
 * Een deck presenteren: schermvullend, slide voor slide, zwart eromheen.
 * Verder met →, spatie, Enter, Page Down of een klik rechts; terug met ←,
 * Page Up of een klik links; Home en End voor de eerste en laatste slide;
 * Esc stopt. De balk onderaan verschijnt als je de muis beweegt.
 */
export function Presentatie({ stuk, start = 0, onSluit }: { stuk: StukInhoud; start?: number; onSluit: () => void }) {
  const slides = zichtbareSlides(stuk, false);
  const [index, setIndex] = useState(Math.min(Math.max(0, start), Math.max(0, slides.length - 1)));
  const [schaal, setSchaal] = useState(1);
  const [balk, setBalk] = useState(true);
  const verberg = useRef<ReturnType<typeof setTimeout> | null>(null);
  const element = useRef<HTMLDivElement>(null);

  const naar = useCallback((i: number) => setIndex(Math.min(Math.max(0, i), slides.length - 1)), [slides.length]);

  function toonBalk() {
    setBalk(true);
    if (verberg.current) clearTimeout(verberg.current);
    verberg.current = setTimeout(() => setBalk(false), 2200);
  }

  useEffect(() => {
    const meet = () => setSchaal(Math.min(window.innerWidth / 1280, window.innerHeight / 720));
    meet();
    window.addEventListener("resize", meet);
    // Schermvullend als de browser dat toestaat; anders vult het venster het scherm.
    element.current?.requestFullscreen?.().catch(() => undefined);
    const uitScherm = () => !document.fullscreenElement && onSluit();
    document.addEventListener("fullscreenchange", uitScherm);
    toonBalk();
    return () => {
      window.removeEventListener("resize", meet);
      document.removeEventListener("fullscreenchange", uitScherm);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
      if (verberg.current) clearTimeout(verberg.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) naar(index + 1);
      else if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)) naar(index - 1);
      else if (e.key === "Home") naar(0);
      else if (e.key === "End") naar(slides.length - 1);
      else if (e.key === "Escape") onSluit();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  }, [index, naar, onSluit, slides.length]);

  const huidig = slides[index];
  const venster = (
    <div
      ref={element}
      className={cn("fixed inset-0 z-[100] flex items-center justify-center bg-black", !balk && "cursor-none")}
      onMouseMove={toonBalk}
      onClick={(e) => naar(e.clientX > window.innerWidth / 2 ? index + 1 : index - 1)}
      role="dialog"
      aria-label="Presentatie"
    >
      {huidig && (
        <div className="relative overflow-hidden bg-white" style={{ width: 1280 * schaal, height: 720 * schaal }}>
          <div className="absolute left-0 top-0 origin-top-left" style={{ width: 1280, height: 720, transform: `scale(${schaal})` }}>
            <AfbeeldingProvider acties={null}>
              <SlideInhoud key={huidig.slide.id} slide={huidig.slide} bronnen={huidig.bronnen} toonLeeg={false} />
            </AfbeeldingProvider>
          </div>
        </div>
      )}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/70 to-transparent p-4 text-white transition-opacity",
          balk ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={() => naar(index - 1)} disabled={index === 0} aria-label="Vorige slide" className="rounded p-2 hover:bg-white/15 disabled:opacity-30">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <span className="min-w-[70px] text-center font-heading text-lg tabular-nums">
          {index + 1} / {slides.length}
        </span>
        <button type="button" onClick={() => naar(index + 1)} disabled={index === slides.length - 1} aria-label="Volgende slide" className="rounded p-2 hover:bg-white/15 disabled:opacity-30">
          <ChevronRight className="h-6 w-6" />
        </button>
        <button type="button" onClick={onSluit} aria-label="Stoppen" className="absolute right-4 rounded p-2 hover:bg-white/15">
          <X className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(venster, document.body);
}

/** Een knop die het deck schermvullend presenteert. */
export function PresenteerKnop({ stuk, start = 0, className, label = "Presenteren" }: { stuk: StukInhoud; start?: number; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  if (stuk.soort !== "deck" || !stuk.slides?.length) return null;
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} className={className} title="Schermvullend presenteren (Esc stopt)">
        <Play />
        <span className="hidden sm:inline">{label}</span>
      </Button>
      {open && <Presentatie stuk={stuk} start={start} onSluit={() => setOpen(false)} />}
    </>
  );
}
