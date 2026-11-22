"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatAnswer } from "@/components/chat-opmaak";
import { cn } from "@/lib/utils";
import { bronnenVan, slidesVan, type Achtergrond, type Blok, type Slide, type StukInhoud } from "@/lib/stukken/model";
import { Bron, Grafiek, StukWeergave, formatDag, isDonker, vlakKlasse } from "@/components/stuk/stuk-weergave";

/**
 * Een stuk als slide deck: dezelfde blokken, op slides van 1280 × 720. Welk
 * blok op welke slide komt, staat in `slidesVan` (lib/stukken/model.ts). Op het
 * scherm worden de slides geschaald naar de breedte; bij afdrukken is elke
 * slide een pagina van 1280 × 720 (`@page deck` in globals.css).
 * De vormregels staan in packages/psv-branding/open-design/psv/DESIGN.md.
 */

const BREED = 1280;
const HOOG = 720;

/** Schaalt een vaste slide naar de breedte van de kolom. */
function Schaal({ children, schaal }: { children: ReactNode; schaal: number }) {
  return (
    <div className="deck-pagina relative w-full overflow-hidden shadow-card" style={{ aspectRatio: `${BREED} / ${HOOG}` }}>
      <div className="deck-schaal absolute left-0 top-0 origin-top-left" style={{ width: BREED, height: HOOG, transform: `scale(${schaal})` }}>
        {children}
      </div>
    </div>
  );
}

function Voet({ links, rechts, donker }: { links: string; rechts: string; donker: boolean }) {
  return (
    <div
      className={cn(
        "absolute inset-x-0 bottom-0 flex h-9 items-center justify-between border-t px-[72px] text-xs",
        donker ? "border-white/25 text-white" : "border-psv-gray-07 text-muted-foreground"
      )}
    >
      <span className="truncate">{links}</span>
      <span className={cn("font-heading text-sm", donker ? "text-white" : "text-foreground")}>{rechts}</span>
    </div>
  );
}

function Titel({ sectie, titel, donker }: { sectie?: string; titel?: string; donker: boolean }) {
  if (!sectie && !titel) return null;
  return (
    <header className="mb-6 flex-shrink-0">
      {sectie && (
        <p className={cn("mb-2 font-heading text-sm uppercase tracking-wide", donker ? "text-white" : "text-psv-red-primary")}>{sectie}</p>
      )}
      {titel && (
        <h2 className="max-w-[1000px] font-heading text-[36px] uppercase leading-[1.1]">
          {titel}
          <span className={cn("mt-3 block h-1 w-12", donker ? "bg-white" : "bg-psv-red-primary")} />
        </h2>
      )}
    </header>
  );
}

function SlideKerngetallen({ blok, achtergrond, half }: { blok: Extract<Blok, { type: "kerngetallen" }>; achtergrond: Achtergrond; half: boolean }) {
  const donker = isDonker(achtergrond);
  const uitgelicht = blok.items.find((k) => k.label === blok.opmaak?.nadruk);
  const rest = blok.items.filter((k) => k !== uitgelicht);
  const tegel = "flex flex-col border-t-4 px-5 py-4";
  return (
    <div className="flex h-full flex-col">
      <div className={cn("grid min-h-0 flex-1 gap-5", uitgelicht && !half ? "grid-cols-[1fr_1.5fr]" : "grid-cols-1")}>
        {uitgelicht && (
          <div className={cn(tegel, "justify-end border-psv-red-primary bg-psv-black p-6 text-white")}>
            <span className="font-heading text-sm uppercase tracking-wide">{uitgelicht.label}</span>
            <span className="my-1 font-heading text-[120px] leading-none">{uitgelicht.waarde}</span>
            {uitgelicht.toelichting && <span className="text-base text-psv-gray-08">{uitgelicht.toelichting}</span>}
          </div>
        )}
        <div className={cn("grid content-start gap-4", rest.length > 4 || (!uitgelicht && rest.length > 2 && !half) ? "grid-cols-3" : "grid-cols-2", uitgelicht && !half && "grid-cols-2")}>
          {rest.map((k, i) => (
            <div key={i} className={cn(tegel, donker ? "border-white bg-white/10" : "border-psv-black bg-psv-offWhite")}>
              <span className={cn("font-heading text-sm uppercase tracking-wide", donker ? "text-white" : "text-psv-gray-11")}>{k.label}</span>
              <span className="my-1 font-heading text-[52px] leading-none">{k.waarde}</span>
              {k.toelichting && <span className={cn("text-sm", donker ? "text-white" : "text-muted-foreground")}>{k.toelichting}</span>}
            </div>
          ))}
        </div>
      </div>
      <Bron tekst={blok.bron} className="text-xs" />
    </div>
  );
}

function SlideTabel({ blok, achtergrond, toonTitel }: { blok: Extract<Blok, { type: "tabel" }>; achtergrond: Achtergrond; toonTitel: boolean }) {
  const donker = isDonker(achtergrond);
  const veel = blok.rijen.length > 10;
  const heelVeel = blok.rijen.length > 16;
  const getalKolom = blok.kolommen.map((_, c) => c > 0 && blok.rijen.every((r) => /^[€\d\s.,%+-]*$/.test(r[c] ?? "")));
  return (
    <div className="flex h-full min-h-0 flex-col">
      {toonTitel && blok.titel && <h3 className="mb-2 font-heading text-lg uppercase tracking-wide">{blok.titel}</h3>}
      <div className="min-h-0 flex-1 overflow-hidden">
        <table className={cn("w-full", heelVeel ? "text-[13px]" : veel ? "text-[15px]" : "text-lg")}>
          <thead>
            <tr className={cn("border-b-2 text-left", donker ? "border-white" : "border-psv-black")}>
              {blok.kolommen.map((k, i) => (
                <th key={i} className={cn("px-3 pb-2 font-heading text-sm uppercase tracking-wide", getalKolom[i] && "text-right")}>
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {blok.rijen.map((rij, r) => {
              const uitgelicht = Boolean(blok.opmaak?.nadruk) && rij[0] === blok.opmaak?.nadruk;
              return (
                <tr
                  key={r}
                  className={cn(
                    "border-b",
                    donker ? "border-white/25" : "border-psv-gray-08",
                    uitgelicht && (donker ? "bg-psv-black font-bold text-white" : "bg-psv-red-primary font-bold text-white")
                  )}
                >
                  {rij.map((cel, c) => (
                    <td key={c} className={cn("px-3", heelVeel ? "py-1" : veel ? "py-1.5" : "py-2.5", getalKolom[c] && "text-right tabular-nums")}>
                      {cel}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Bron tekst={blok.bron} className="text-xs" />
    </div>
  );
}

function SlideConclusie({ blok, toonTitel }: { blok: Extract<Blok, { type: "conclusie" }>; toonTitel: boolean }) {
  return (
    <div>
      {toonTitel && <h3 className="mb-3 font-heading text-lg uppercase tracking-wide">Conclusie</h3>}
      <ol className="grid max-w-[1080px] gap-5">
        {blok.punten.map((p, i) => (
          <li key={i} className={cn("grid grid-cols-[64px_1fr] leading-snug", blok.punten.length > 4 ? "text-[21px]" : "text-[24px]")}>
            <span className="font-heading text-[32px] leading-none">{String(i + 1).padStart(2, "0")}</span>
            <span>{p}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SlideBlok({ blok, slide, alleen }: { blok: Blok; slide: Slide; alleen: boolean }) {
  // Staat de titel van het blok al als titel op de slide, dan niet nog een keer.
  const eigenTitel = !alleen || (slide.titel !== undefined && slide.titel !== ("titel" in blok ? blok.titel : undefined));
  switch (blok.type) {
    case "kerngetallen":
      return <SlideKerngetallen blok={blok} achtergrond={slide.achtergrond} half={!alleen} />;
    case "tabel":
      return <SlideTabel blok={blok} achtergrond={slide.achtergrond} toonTitel={eigenTitel} />;
    case "grafiek":
      return (
        <div className="flex h-full min-h-0 flex-col">
          {eigenTitel && <p className="mb-2 text-base text-muted-foreground">{blok.titel}{blok.eenheid ? `, in ${blok.eenheid}` : ""}</p>}
          <div className="min-h-0 flex-1">
            <Grafiek blok={blok} achtergrond={slide.achtergrond} hoogte="h-full" toonTitel={false} deck />
          </div>
        </div>
      );
    case "conclusie":
      return <SlideConclusie blok={blok} toonTitel={!alleen && !slide.titel} />;
    case "tekst":
      return <div className={cn("max-w-[1000px] space-y-3 leading-relaxed", slide.groot ? "text-[26px]" : "text-[20px]")}>{formatAnswer(blok.tekst)}</div>;
    case "kop":
      return null;
  }
}

function InhoudSlide({ slide, nummer, titel }: { slide: Slide; nummer: number; titel: string }) {
  const donker = isDonker(slide.achtergrond);
  const alleen = slide.blokken.length === 1;
  return (
    <div className={cn("relative flex h-full flex-col px-[72px] pb-[60px] pt-[52px]", slide.achtergrond === "wit" ? "bg-white" : vlakKlasse(slide.achtergrond))}>
      <Titel sectie={slide.sectie} titel={slide.titel} donker={donker} />
      <div className={cn("min-h-0 flex-1", !alleen && "grid grid-cols-2 gap-10")}>
        {slide.blokken.map((blok) => (
          <div key={blok.id} className="h-full min-h-0 min-w-0">
            <SlideBlok blok={blok} slide={slide} alleen={alleen} />
          </div>
        ))}
      </div>
      <Voet links={titel} rechts={String(nummer).padStart(2, "0")} donker={donker} />
    </div>
  );
}

function TitelSlide({ stuk, peildatum }: { stuk: StukInhoud; peildatum: string }) {
  return (
    <div className="relative h-full overflow-hidden bg-psv-black text-white">
      <div className="absolute right-0 top-0 h-full w-[46%] bg-psv-red-primary [clip-path:polygon(38%_0,100%_0,100%_100%,0_100%)]" />
      <div className="absolute right-0 top-0 h-full w-[46%] bg-psv-red-dark [clip-path:polygon(72%_0,100%_0,100%_100%,44%_100%)]" />
      <div className="absolute bottom-[110px] left-[72px] max-w-[860px]">
        <span className="tag mb-5">PSV</span>
        <h1 className="mb-6 font-heading text-[80px] uppercase leading-[0.9]">{stuk.titel}</h1>
        {stuk.ondertitel && <p className="max-w-[640px] text-xl leading-normal text-psv-gray-07">{stuk.ondertitel}</p>}
      </div>
      <Voet links="Gemaakt met de assistent van PSV Tools" rechts={`Peildatum ${formatDag(peildatum)}`} donker />
    </div>
  );
}

function BronnenSlide({ bronnen, peildatum, nummer, titel, voetnoot }: { bronnen: string[]; peildatum: string; nummer: number; titel: string; voetnoot?: ReactNode }) {
  return (
    <div className="relative h-full bg-psv-black px-[72px] pt-[52px] text-white">
      <Titel titel="Bronnen" donker />
      <ul className="max-w-[1000px]">
        {bronnen.map((b) => (
          <li key={b} className="border-b border-psv-gray-11 py-3 text-base leading-snug">
            {b}
          </li>
        ))}
      </ul>
      <p className="mt-8 text-psv-gray-08">
        Peildatum {formatDag(peildatum)}. Gemaakt met de assistent van PSV Tools.
        {voetnoot}
      </p>
      <Voet links={titel} rechts={String(nummer).padStart(2, "0")} donker />
    </div>
  );
}

export function DeckWeergave({ stuk, peildatum, voetnoot, className }: { stuk: StukInhoud; peildatum: string; voetnoot?: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [schaal, setSchaal] = useState(0.5);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const meet = () => setSchaal(el.clientWidth / BREED);
    meet();
    const observer = new ResizeObserver(meet);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const slides = slidesVan(stuk);
  const bronnen = bronnenVan(stuk);
  return (
    <div ref={ref} className={cn("deck mx-auto w-full max-w-5xl space-y-4", className)}>
      <Schaal schaal={schaal}>
        <TitelSlide stuk={stuk} peildatum={peildatum} />
      </Schaal>
      {slides.map((slide, i) => (
        <Schaal key={slide.blokken.map((b) => b.id).join("-")} schaal={schaal}>
          <InhoudSlide slide={slide} nummer={i + 2} titel={stuk.titel} />
        </Schaal>
      ))}
      {bronnen.length > 0 && (
        <Schaal schaal={schaal}>
          <BronnenSlide bronnen={bronnen} peildatum={peildatum} nummer={slides.length + 2} titel={stuk.titel} voetnoot={voetnoot} />
        </Schaal>
      )}
    </div>
  );
}

/** Het stuk in zijn eigen vorm: rapport of deck. */
export function StukVoorbeeld(props: { stuk: StukInhoud; peildatum: string; voetnoot?: ReactNode; className?: string }) {
  return props.stuk.soort === "deck" ? <DeckWeergave {...props} /> : <StukWeergave {...props} />;
}
