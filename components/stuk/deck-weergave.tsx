"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { formatAnswer } from "@/components/chat-opmaak";
import { cn } from "@/lib/utils";
import { AfbeeldingPlek, VervangFoto, useAfbeeldingActies } from "@/components/stuk/afbeelding";
import { bronnenVan, isLegeAfbeelding, slidesVan, type Achtergrond, type Blok, type Slide, type StukInhoud } from "@/lib/stukken/model";
import { Bron, Grafiek, StukWeergave, formatDag, isDonker } from "@/components/stuk/stuk-weergave";

/**
 * Een stuk als slide deck, in de vorm van het PowerPoint-template van PSV
 * (seizoen 2026-2027): titels wit op een zwart blok, de grijze schuine vorm,
 * het embleem rechtsonder, geen voetregel. Welk blok op welke slide komt,
 * staat in `slidesVan` (lib/stukken/model.ts); de vormregels in
 * packages/psv-branding/open-design/psv/DESIGN.md.
 *
 * Slides zijn 1280 × 720 (het template is 13,333 × 7,5 inch: 96 px per inch).
 * Op het scherm worden ze geschaald naar de breedte; bij afdrukken is elke
 * slide een pagina van 1280 × 720 (`@page deck` in globals.css).
 */

const BREED = 1280;
const HOOG = 720;

/**
 * De PSV-schuine vorm uit het template (de "1" uit 1913), gemeten in het
 * template: bovenaan op 38,8% van de breedte, onderaan op 30,3%, met de
 * inkeping op 23% van de hoogte.
 */
const SCHUIN = "polygon(38.8% 0, 100% 0, 100% 100%, 30.3% 100%, 42.76% 23.06%, 34.97% 23.06%)";

/** Dezelfde vorm als masker voor een foto: begint links onderaan het vlak en loopt tot de rechterrand. */
function fotoVorm(): string {
  const px = (pct: number) => `${Math.round((pct / 100) * BREED)}px`;
  return `polygon(${px(8.5)} 0, 100% 0, 100% 100%, 0 100%, ${px(12.46)} 23.06%, ${px(4.67)} 23.06%)`;
}

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

function Embleem({ className, style }: { className?: string; style?: CSSProperties }) {
  // eslint-disable-next-line @next/next/no-img-element -- het embleem, ook in de afdruk
  return <img src="/images/psv-embleem.svg" alt="PSV" className={className} style={style} />;
}

/**
 * De titel: PSV Condensed in hoofdletters, wit op een zwart blok dat om de
 * tekst past. In het template 50 pt (67 px) op één regel; een langere titel
 * wordt kleiner en mag over twee regels, met het blok per regel.
 */
function TitelBlok({ tekst, rood = false, className, groot = 67 }: { tekst: string; rood?: boolean; className?: string; groot?: number }) {
  const grootte = tekst.length <= 22 ? groot : tekst.length <= 34 ? Math.round(groot * 0.78) : Math.round(groot * 0.62);
  return (
    <h2 className={cn("max-w-[1100px] font-heading uppercase", className)} style={{ fontSize: grootte, lineHeight: 1.22 }}>
      <span
        className={cn("px-[11px] text-white [-webkit-box-decoration-break:clone] [box-decoration-break:clone]", rood ? "bg-psv-red-primary" : "bg-psv-black")}
      >
        {tekst}
      </span>
    </h2>
  );
}

/** Rood vlak met links de donkerdere schuine band, zoals de hoofdstuk- en afsluitslide. */
function RoodVlak({ children }: { children?: ReactNode }) {
  return (
    <div className="relative h-full overflow-hidden bg-psv-red-primary text-white">
      <div className="absolute inset-y-0 left-0 w-[34%] bg-psv-red-secondary [clip-path:polygon(0_0,100%_0,62%_100%,0_100%)]" />
      {children}
    </div>
  );
}

/** Het patroon van de welkomstslide: rijen "PSV EINDHOVEN" in grote schuine letters, rood op rood. */
function Patroon() {
  const regel = "PSV EINDHOVEN PSV EINDHOVEN PSV EINDHOVEN ";
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {Array.from({ length: 7 }, (_, i) => (
        <p
          key={i}
          className="whitespace-nowrap font-heading text-[118px] uppercase leading-[0.86] text-black/[0.07]"
          style={{ transform: `translateX(${-((i * 230) % 690)}px) skewX(-12deg)` }}
        >
          {regel}
        </p>
      ))}
    </div>
  );
}

/* ---------- Inhoud ---------- */

function SlideKerngetallen({ blok, achtergrond, smal }: { blok: Extract<Blok, { type: "kerngetallen" }>; achtergrond: Achtergrond; smal: boolean }) {
  const donker = isDonker(achtergrond);
  const uitgelicht = blok.items.find((k) => k.label === blok.opmaak?.nadruk);
  const rest = blok.items.filter((k) => k !== uitgelicht);
  return (
    <div className="flex h-full flex-col">
      <div className={cn("grid min-h-0 flex-1 gap-5", uitgelicht && !smal ? "grid-cols-[1fr_1.5fr]" : "grid-cols-1")}>
        {uitgelicht && (
          <div className="flex flex-col justify-end bg-psv-black p-6 text-white">
            <span className="text-[22px] font-bold text-psv-red-primary">{uitgelicht.label}</span>
            <span className="my-1 font-heading text-[120px] leading-none">{uitgelicht.waarde}</span>
            {uitgelicht.toelichting && <span className="text-lg text-psv-gray-08">{uitgelicht.toelichting}</span>}
          </div>
        )}
        <div className={cn("grid content-start gap-4", !smal && !uitgelicht && rest.length > 2 ? "grid-cols-3" : "grid-cols-2")}>
          {rest.map((k, i) => (
            <div key={i} className={cn("flex flex-col px-5 py-4", donker ? "bg-white/10" : "bg-white shadow-card")}>
              <span className={cn("text-lg font-bold", donker ? "text-white" : "text-psv-red-primary")}>{k.label}</span>
              <span className="my-1 font-heading text-[52px] leading-none">{k.waarde}</span>
              {k.toelichting && <span className={cn("text-sm", donker ? "text-white" : "text-psv-gray-10")}>{k.toelichting}</span>}
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
  const veel = blok.rijen.length > 9;
  const heelVeel = blok.rijen.length > 14;
  const getalKolom = blok.kolommen.map((_, c) => c > 0 && blok.rijen.every((r) => /^[€\d\s.,%+-]*$/.test(r[c] ?? "")));
  return (
    <div className="flex h-full min-h-0 flex-col">
      {toonTitel && blok.titel && <Subkop>{blok.titel}</Subkop>}
      <div className={cn("min-h-0 flex-1 overflow-hidden", !donker && "bg-white p-3 shadow-card")}>
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

/** Subkop uit het template: PSV Text Bold, rood. */
function Subkop({ children, donker = false }: { children: ReactNode; donker?: boolean }) {
  return <p className={cn("mb-3 text-[28px] font-bold leading-tight", donker ? "text-white" : "text-psv-red-primary")}>{children}</p>;
}

function SlideConclusie({ blok, donker, toonTitel }: { blok: Extract<Blok, { type: "conclusie" }>; donker: boolean; toonTitel: boolean }) {
  return (
    <div>
      {toonTitel && <Subkop donker={donker}>Conclusie</Subkop>}
      <ul className={cn("max-w-[1050px] list-disc space-y-[19px] pl-7", blok.punten.length > 4 ? "text-[22px]" : "text-[26px]")}>
        {blok.punten.map((p, i) => (
          <li key={i} className="leading-[1.2]">
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SlideBlok({ blok, slide, alleen }: { blok: Blok; slide: Slide; alleen: boolean }) {
  const donker = isDonker(slide.achtergrond);
  // Staat de titel van het blok al als titel op de slide, dan niet nog een keer.
  const eigenTitel = !alleen || (slide.titel !== undefined && slide.titel !== ("titel" in blok ? blok.titel : undefined));
  switch (blok.type) {
    case "kerngetallen":
      return <SlideKerngetallen blok={blok} achtergrond={slide.achtergrond} smal={!alleen} />;
    case "tabel":
      return <SlideTabel blok={blok} achtergrond={slide.achtergrond} toonTitel={eigenTitel} />;
    case "grafiek":
      return (
        <div className={cn("flex h-full min-h-0 flex-col", !donker && "bg-white p-4 shadow-card")}>
          {eigenTitel && (
            <p className={cn("mb-2 text-xl font-bold", donker ? "text-white" : "text-psv-red-primary")}>
              {blok.titel}
              {blok.eenheid ? <span className="font-normal text-muted-foreground">, in {blok.eenheid}</span> : null}
            </p>
          )}
          <div className="min-h-0 flex-1">
            <Grafiek blok={blok} achtergrond={slide.achtergrond} hoogte="h-full" toonTitel={false} deck />
          </div>
        </div>
      );
    case "conclusie":
      return <SlideConclusie blok={blok} donker={donker} toonTitel={!alleen && !slide.titel} />;
    case "tekst":
      return <div className={cn("max-w-[1000px] space-y-[19px] leading-[1.25]", slide.groot ? "text-[30px]" : "text-[26px]")}>{formatAnswer(blok.tekst)}</div>;
    case "afbeelding":
      return blok.url ? (
        <figure className="relative flex h-full min-h-0 flex-col">
          {/* eslint-disable-next-line @next/next/no-img-element -- een foto van onze CDN, ook in de afdruk */}
          <img src={blok.url} alt={blok.alt ?? blok.wens} className="min-h-0 w-full flex-1 object-cover" />
          <VervangFoto doel={blok.id} wens={blok.wens} />
          {blok.bijschrift && <figcaption className="mt-2 text-sm text-muted-foreground">{blok.bijschrift}</figcaption>}
        </figure>
      ) : (
        <AfbeeldingPlek doel={blok.id} wens={blok.wens} groot />
      );
    case "kop":
      return null;
  }
}

/** Het vlak van een inhoudslide: wit met de grijze schuine vorm, of effen grijs, rood of zwart. */
function Vlak({ achtergrond, children }: { achtergrond: Achtergrond; children: ReactNode }) {
  const donker = isDonker(achtergrond);
  return (
    <div
      className={cn(
        "relative h-full overflow-hidden",
        achtergrond === "rood" ? "stuk-vlak--rood !p-0" : achtergrond === "zwart" ? "stuk-vlak--zwart !p-0" : achtergrond === "grijs" ? "bg-[#F0F0F0]" : "bg-white"
      )}
    >
      {achtergrond === "wit" && <div className="absolute inset-0 bg-[#F0F0F0]" style={{ clipPath: SCHUIN }} />}
      {children}
      {!donker && <Embleem className="absolute bottom-[14px] right-[18px] w-[38px]" />}
    </div>
  );
}

/** Tekst links, foto rechts in de schuine vorm: "Beeld" uit het template. */
function BeeldSlide({ slide, foto, tekst }: { slide: Slide; foto: Extract<Blok, { type: "afbeelding" }>; tekst: Blok }) {
  const links = 560;
  return (
    <div className="relative h-full overflow-hidden bg-white">
      <div className="absolute inset-y-0 right-0" style={{ left: links, clipPath: fotoVorm() }}>
        {foto.url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- een foto van onze CDN, ook in de afdruk */}
            <img src={foto.url} alt={foto.alt ?? foto.wens} className="h-full w-full object-cover" />
          </>
        ) : (
          <div className="h-full w-full bg-[#F0F0F0]" />
        )}
      </div>
      {foto.url ? (
        <VervangFoto doel={foto.id} wens={foto.wens} className="right-[24px] top-[24px]" />
      ) : (
        <AfbeeldingPlek doel={foto.id} wens={foto.wens} className="absolute bottom-[140px] right-[60px] top-[140px] w-[460px] !h-auto" />
      )}
      {slide.titel && <TitelBlok tekst={slide.titel} className="absolute left-[61px] top-[68px] max-w-[700px]" />}
      <div className="absolute bottom-[40px] left-[73px] top-[192px] w-[440px] overflow-hidden">
        <SlideBlok blok={tekst} slide={slide} alleen={false} />
      </div>
    </div>
  );
}

/** Een foto alleen: over de hele slide ("Foto zoom"), met de titel in het zwarte blok als die er is. */
function FotoSlide({ blok, slide }: { blok: Extract<Blok, { type: "afbeelding" }>; slide: Slide }) {
  return (
    <div className="relative h-full overflow-hidden bg-psv-black text-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- een foto van onze CDN, ook in de afdruk */}
      <img src={blok.url} alt={blok.alt ?? blok.wens} className="absolute inset-0 h-full w-full object-cover" />
      <VervangFoto doel={blok.id} wens={blok.wens} className="right-[24px] top-[24px]" />
      {slide.titel && <TitelBlok tekst={slide.titel} className="absolute left-[61px] top-[68px]" />}
      {blok.bijschrift && (
        <p className="absolute bottom-[40px] left-[61px] max-w-[800px] bg-psv-black/70 px-3 py-1 text-lg">{blok.bijschrift}</p>
      )}
    </div>
  );
}

const TEKSTACHTIG = new Set(["tekst", "conclusie", "kerngetallen"]);

function InhoudSlide({ slide }: { slide: Slide }) {
  const donker = isDonker(slide.achtergrond);
  const [eerste, tweede] = slide.blokken;
  if (!tweede && eerste.type === "afbeelding" && eerste.url) return <FotoSlide blok={eerste} slide={slide} />;
  if (tweede) {
    const foto = [eerste, tweede].find((b): b is Extract<Blok, { type: "afbeelding" }> => b.type === "afbeelding");
    const ander = foto && [eerste, tweede].find((b) => b !== foto);
    if (foto && ander && ander.type !== "afbeelding") return <BeeldSlide slide={slide} foto={foto} tekst={ander} />;
  }
  // Tekst naast een grafiek of tabel: tekst smal links, zoals "Grafiek" en "Tabel" in het template.
  const kolommen = tweede
    ? TEKSTACHTIG.has(eerste.type) && !TEKSTACHTIG.has(tweede.type)
      ? "grid-cols-[420px_1fr]"
      : !TEKSTACHTIG.has(eerste.type) && TEKSTACHTIG.has(tweede.type)
        ? "grid-cols-[1fr_420px]"
        : "grid-cols-2"
    : "";
  return (
    <Vlak achtergrond={slide.achtergrond}>
      {slide.titel && <TitelBlok tekst={slide.titel} rood={slide.achtergrond === "zwart"} className="absolute left-[61px] top-[68px]" />}
      <div className={cn("absolute bottom-[56px] left-[73px] right-[73px] top-[192px]", donker && "text-white", tweede && `grid gap-10 ${kolommen}`)}>
        {slide.blokken.map((blok) => (
          <div key={blok.id} className="relative h-full min-h-0 min-w-0">
            <SlideBlok blok={blok} slide={slide} alleen={!tweede} />
          </div>
        ))}
      </div>
    </Vlak>
  );
}

function HoofdstukSlide({ titel }: { titel: string }) {
  return (
    <RoodVlak>
      <Embleem className="absolute left-[150px] top-1/2 w-[300px] -translate-y-1/2" />
      <TitelBlok tekst={titel} className="absolute left-[594px] top-1/2 max-w-[640px] -translate-y-1/2" />
    </RoodVlak>
  );
}

function WelkomSlide({ stuk, peildatum }: { stuk: StukInhoud; peildatum: string }) {
  const beeld = stuk.titelbeeld;
  const metFoto = Boolean(beeld?.url);
  return (
    <div className="relative h-full overflow-hidden bg-psv-red-primary text-white">
      {metFoto ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- een foto van onze CDN, ook in de afdruk */}
          <img src={beeld!.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          {/* "Speciaal" uit het template: links de rode schuine vorm over de foto. */}
          <div className="absolute inset-y-0 left-0 w-[52%] bg-psv-red-primary [clip-path:polygon(0_0,100%_0,58%_100%,0_100%)]" />
          <VervangFoto doel="titel" wens={beeld?.wens ?? stuk.titelbeeld?.wens} className="right-[24px] top-[24px]" />
        </>
      ) : (
        <Patroon />
      )}
      {beeld?.wens && !beeld.url && (
        <AfbeeldingPlek doel="titel" wens={`Titelfoto: ${beeld.wens}`} className="absolute left-[40px] top-[40px] !h-auto w-[400px] !p-4" />
      )}
      <div className={cn("absolute", metFoto ? "left-[61px] top-1/2 max-w-[600px] -translate-y-1/2" : "inset-x-[120px] top-1/2 -translate-y-1/2 text-center")}>
        <TitelBlok tekst={stuk.titel} groot={80} className={metFoto ? "" : "mx-auto"} />
        {stuk.ondertitel && <p className="mt-6 text-[22px] leading-snug">{stuk.ondertitel}</p>}
        <p className="mt-3 text-base">Peildatum {formatDag(peildatum)}</p>
      </div>
    </div>
  );
}

function BronnenSlide({ bronnen, peildatum, voetnoot }: { bronnen: string[]; peildatum: string; voetnoot?: ReactNode }) {
  return (
    <Vlak achtergrond="wit">
      <TitelBlok tekst="Bronnen" className="absolute left-[61px] top-[68px]" />
      <div className="absolute left-[73px] right-[73px] top-[192px] max-w-[760px]">
        <ul className="list-disc space-y-3 pl-6 text-lg leading-snug">
          {bronnen.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <p className="mt-8 text-base text-psv-gray-10">
          Peildatum {formatDag(peildatum)}. Gemaakt met de assistent van PSV Tools.
          {voetnoot}
        </p>
      </div>
    </Vlak>
  );
}

function AfsluitSlide() {
  return (
    <RoodVlak>
      <Embleem className="absolute left-1/2 top-1/2 w-[300px] -translate-x-1/2 -translate-y-1/2" />
    </RoodVlak>
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

  const acties = useAfbeeldingActies();
  // Buiten het voorbeeld geen slides met alleen een lege plek voor een foto.
  const slides = slidesVan(stuk)
    .map((slide) => (acties ? slide : { ...slide, blokken: slide.blokken.filter((b) => !isLegeAfbeelding(b)) }))
    .filter((slide) => slide.blokken.length > 0);
  const bronnen = bronnenVan(stuk);
  return (
    <div ref={ref} className={cn("deck mx-auto w-full max-w-5xl space-y-4", className)}>
      <Schaal schaal={schaal}>
        <WelkomSlide stuk={stuk} peildatum={peildatum} />
      </Schaal>
      {slides.map((slide) => (
        <Schaal key={slide.blokken.map((b) => b.id).join("-")} schaal={schaal}>
          {slide.soort === "hoofdstuk" ? <HoofdstukSlide titel={slide.titel ?? ""} /> : <InhoudSlide slide={slide} />}
        </Schaal>
      ))}
      {bronnen.length > 0 && (
        <Schaal schaal={schaal}>
          <BronnenSlide bronnen={bronnen} peildatum={peildatum} voetnoot={voetnoot} />
        </Schaal>
      )}
      <Schaal schaal={schaal}>
        <AfsluitSlide />
      </Schaal>
    </div>
  );
}

/** Het stuk in zijn eigen vorm: rapport of deck. */
export function StukVoorbeeld(props: { stuk: StukInhoud; peildatum: string; voetnoot?: ReactNode; className?: string }) {
  return props.stuk.soort === "deck" ? <DeckWeergave {...props} /> : <StukWeergave {...props} />;
}
