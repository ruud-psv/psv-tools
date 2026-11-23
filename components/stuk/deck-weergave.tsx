"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AfbeeldingPlek, SleepbareFoto, VervangFoto, useAfbeeldingActies } from "@/components/stuk/afbeelding";
import { Bron, Grafiek, StukWeergave } from "@/components/stuk/stuk-weergave";
import { bronnenVan, type Blok, type StukInhoud } from "@/lib/stukken/model";
import { BEELD_LINKS, MET_FOTO, vlakVan, wachtOpFoto, type DeckSlide, type Foto } from "@/lib/stukken/deck";

/**
 * Een slide deck in het PowerPoint-template van PSV (seizoen 2026-2027).
 *
 * Alle maten komen uit het template (13,333 × 7,5 inch = 1280 × 720 px, 96 px
 * per inch); de achtergronden (welkom, hoofdstuk, afsluiting, de grijze
 * schuine vorm) en het logo zijn de afbeeldingen uit het template zelf, in
 * public/images/deck/. De maskers van de foto's zijn de vormen van de
 * fotovakken in Beeld 1 t/m 5. Welke velden een layout heeft: lib/stukken/deck.ts.
 */

const BREED = 1280;
const HOOG = 720;
const ROOD = "#e30713"; // het rode vlak van het template (Rood, Speciaal, Quote)



/* ---------- Bouwstenen ---------- */

/** Maakt tekst kleiner tot hij in zijn vak past, zoals "tekst passend maken" in PowerPoint. */
function usePassend<T extends HTMLElement>(start: number, min: number, afhankelijk: unknown[]) {
  const ref = useRef<T>(null);
  const [grootte, setGrootte] = useState(start);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let g = start;
    el.style.fontSize = `${g}px`;
    while (g > min && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) {
      g -= 2;
      el.style.fontSize = `${g}px`;
    }
    setGrootte(g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, afhankelijk);
  return { ref, grootte };
}

/**
 * De titel: PSV Condensed Bold, 50 pt (67 px), hoofdletters, wit op een zwart
 * blok dat om de tekst past, op één regel. Past hij niet, dan wordt hij kleiner.
 */
function Titel({ tekst, style, max = BREED - 2 * 61, grootte = 67, rood = false }: { tekst: string; style: CSSProperties; max?: number; grootte?: number; rood?: boolean }) {
  const { ref, grootte: g } = usePassend<HTMLDivElement>(grootte, 30, [tekst, max, grootte]);
  return (
    <div style={{ ...style, maxWidth: max }} className="absolute">
      <div ref={ref} className="overflow-hidden whitespace-nowrap" style={{ fontSize: g, maxWidth: max }}>
        <h2
          className={cn("inline-block font-heading uppercase leading-none text-white", rood ? "bg-[#e30713]" : "bg-black")}
          style={{ padding: `${Math.round(g * 0.1)}px 11px ${Math.round(g * 0.06)}px`, lineHeight: 1.05 }}
        >
          {tekst}
        </h2>
      </div>
    </div>
  );
}

/** Tekst met **vet**, lege regels als alinea's en regels die met "- " beginnen als opsomming. */
function Opmaak({ tekst }: { tekst: string }) {
  const vet = (regel: string) =>
    regel.split(/(\*\*[^*]+\*\*)/g).map((deel, i) => (deel.startsWith("**") && deel.endsWith("**") ? <strong key={i}>{deel.slice(2, -2)}</strong> : <Fragment key={i}>{deel}</Fragment>));
  const blokken: ReactNode[] = [];
  let opsomming: string[] = [];
  const sluitOpsomming = () => {
    if (!opsomming.length) return;
    blokken.push(
      <ul key={blokken.length} className="space-y-[0.7em]">
        {opsomming.map((p, i) => (
          <li key={i} className="relative pl-[1.05em]">
            <span className="absolute left-0">•</span>
            {vet(p)}
          </li>
        ))}
      </ul>
    );
    opsomming = [];
  };
  for (const regel of tekst.split("\n")) {
    if (/^\s*[-•]\s+/.test(regel)) opsomming.push(regel.replace(/^\s*[-•]\s+/, ""));
    else {
      sluitOpsomming();
      if (regel.trim()) blokken.push(<p key={blokken.length}>{vet(regel)}</p>);
    }
  }
  sluitOpsomming();
  return <div className="space-y-[0.7em]">{blokken}</div>;
}

/** Het tekstvak: subkop (PSV Text Bold, 28 pt, rood) en tekst (PSV Text, 20 pt). Past het niet, dan kleiner. */
function Tekstvak({ subkop, tekst, style, wit = false, kolommen = 1 }: { subkop?: string; tekst?: string; style: CSSProperties; wit?: boolean; kolommen?: 1 | 2 }) {
  const { ref, grootte } = usePassend<HTMLDivElement>(27, 15, [subkop, tekst, kolommen, style.width, style.height]);
  if (!subkop && !tekst) return null;
  return (
    <div ref={ref} className={cn("absolute overflow-hidden", wit && "text-white")} style={{ ...style, fontSize: grootte, lineHeight: 1.08 }}>
      {subkop && <p className={cn("mb-[0.5em] font-bold", wit ? "text-white" : "text-[#e30713]")} style={{ fontSize: "1.37em", lineHeight: 1 }}>{subkop}</p>}
      {tekst && (
        <div style={kolommen === 2 ? { columnCount: 2, columnGap: 48 } : undefined}>
          <Opmaak tekst={tekst} />
        </div>
      )}
    </div>
  );
}

function Achtergrond({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- achtergrond uit het template, ook in de afdruk
  return <img src={src} alt="" className="absolute inset-0 h-full w-full" />;
}

function Logo() {
  // eslint-disable-next-line @next/next/no-img-element -- het logo uit het template
  return <img src="/images/deck/logo.png" alt="PSV" className="absolute" style={{ left: 1191, top: 643, width: 77, height: 77 }} />;
}

/**
 * De schuine vorm uit het template, vanaf `links` (de x van zijn linkeronderhoek)
 * tot de rechterrand. Gemeten in het template: de schuine kant loopt 105 px naar
 * rechts, het haakje zit op 166 px hoogte tussen 57 en 160 px. Dat is bij elke
 * breedte gelijk (Beeld 1 t/m 5, de grijze vorm van Tekst), dus het vlak kan
 * overal staan.
 */
const VORM = "polygon(105px 0, 100% 0, 100% 100%, 0 100%, 160px 166px, 57px 166px)";

export interface Bewerk {
  /** Het vlak verschuiven: tijdens het slepen (klaar=false) en bij loslaten (klaar=true). */
  onVlak: (links: number, klaar: boolean) => void;
}

/** De greep om het vlak naar links of rechts te slepen (alleen in de bewerker). */
function VlakGreep({ links, onVlak }: { links: number; onVlak: Bewerk["onVlak"] }) {
  const start = useRef<{ px: number; links: number; schaal: number } | null>(null);
  const laatste = useRef(links);
  return (
    <div
      role="slider"
      aria-label="Vlak verschuiven"
      aria-valuenow={links}
      aria-valuemin={100}
      aria-valuemax={1150}
      tabIndex={0}
      title="Sleep om het vlak breder of smaller te maken"
      className="absolute z-20 flex cursor-ew-resize touch-none items-center justify-center bg-white text-[#e30713] shadow-card print:hidden"
      style={{ left: links + 12, top: 320, width: 44, height: 80, border: "3px solid #e30713" }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        onVlak(Math.min(1150, Math.max(100, links + (e.key === "ArrowLeft" ? -20 : 20))), true);
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        const slide = e.currentTarget.parentElement!;
        start.current = { px: e.clientX, links, schaal: slide.getBoundingClientRect().width / BREED };
      }}
      onPointerMove={(e) => {
        const b = start.current;
        if (!b) return;
        laatste.current = Math.round(Math.min(1150, Math.max(100, b.links + (e.clientX - b.px) / b.schaal)));
        onVlak(laatste.current, false);
      }}
      onPointerUp={() => {
        if (start.current) onVlak(laatste.current, true);
        start.current = null;
      }}
    >
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
        <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
      </svg>
    </div>
  );
}

/**
 * Het vlak: de schuine vorm met een foto, of grijs. `leeg`: een foto hoort
 * erbij (Beeld, Speciaal, Quote), dus in het voorbeeld een lege plek met
 * knoppen. `bewerk`: in de bewerker ook knoppen om een foto toe te voegen in
 * het grijze vlak, en de greep om het te verschuiven.
 */
function Vlak({ links, foto, doel, leeg, grijs = "#F0F0F0", bewerk }: { links: number; foto?: Foto; doel: string; leeg: boolean; grijs?: string; bewerk?: Bewerk }) {
  const knoppen: CSSProperties = { left: Math.max(links + 180, BREED - 330), top: 24 };
  return (
    <>
      <div className="absolute top-0 h-full overflow-hidden" style={{ left: links, width: BREED - links, clipPath: VORM, background: foto?.url ? undefined : grijs }}>
        {foto?.url && <SleepbareFoto src={foto.url} alt={foto.alt ?? foto.wens ?? ""} positie={foto.positie} doel={doel} className="h-full w-full object-cover" />}
      </div>
      {foto?.url ? (
        <VervangFoto doel={doel} wens={foto.wens} positie={foto.positie} zoom className="!right-auto" style={knoppen} />
      ) : leeg ? (
        <AfbeeldingPlek doel={doel} wens={foto?.wens} groot className="absolute !h-auto" style={{ left: Math.max(links + 200, 560), right: 40, top: 150, bottom: 150 }} />
      ) : bewerk ? (
        <VervangFoto doel={doel} wens={foto?.wens} className="!right-auto" style={knoppen} />
      ) : null}
      {bewerk && <VlakGreep links={links} onVlak={bewerk.onVlak} />}
    </>
  );
}

/* ---------- Data ---------- */

function DataGrafiek({ slide, style }: { slide: DeckSlide; style: CSSProperties }) {
  if (!slide.grafiek) return null;
  const blok = { type: "grafiek", id: slide.id, ...slide.grafiek, ...(slide.nadruk && { opmaak: { nadruk: slide.nadruk } }) } as Extract<Blok, { type: "grafiek" }>;
  return (
    <div className="absolute flex flex-col" style={style}>
      <p className="mb-1 text-[18px] font-bold text-[#e30713]">
        {slide.grafiek.titel}
        {slide.grafiek.eenheid ? <span className="font-normal text-[#666]">, in {slide.grafiek.eenheid}</span> : null}
      </p>
      <div className="min-h-0 flex-1">
        <Grafiek blok={blok} hoogte="h-full" toonTitel={false} deck />
      </div>
    </div>
  );
}

function DataTabel({ slide, style }: { slide: DeckSlide; style: CSSProperties }) {
  const t = slide.tabel;
  if (!t) return null;
  const veel = t.rijen.length > 9;
  const heelVeel = t.rijen.length > 14;
  const getalKolom = t.kolommen.map((_, c) => c > 0 && t.rijen.every((r) => /^[€\d\s.,%+-]*$/.test(r[c] ?? "")));
  return (
    <div className="absolute flex flex-col" style={style}>
      {t.titel && t.titel !== slide.titel && <p className="mb-2 text-[18px] font-bold text-[#e30713]">{t.titel}</p>}
      <div className="min-h-0 flex-1 overflow-hidden bg-white">
        <table className={cn("w-full", heelVeel ? "text-[12px]" : veel ? "text-[14px]" : "text-[17px]")}>
          <thead>
            <tr className="bg-black text-left text-white">
              {t.kolommen.map((k, i) => (
                <th key={i} className={cn("px-3 py-2 font-heading text-[0.85em] uppercase tracking-wide", getalKolom[i] && "text-right")}>
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rijen.map((rij, r) => {
              const uit = Boolean(slide.nadruk) && rij[0] === slide.nadruk;
              return (
                <tr key={r} className={cn("border-b border-[#e5e5e5]", uit && "bg-[#e30713] font-bold text-white")}>
                  {rij.map((cel, c) => (
                    <td key={c} className={cn("px-3", heelVeel ? "py-1" : veel ? "py-1.5" : "py-2", getalKolom[c] && "text-right tabular-nums")}>
                      {cel}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Bron tekst={t.bron} className="text-xs" />
    </div>
  );
}

function DataCijfers({ slide, style }: { slide: DeckSlide; style: CSSProperties }) {
  const k = slide.kerngetallen;
  if (!k) return null;
  const uitgelicht = k.items.find((i) => i.label === slide.nadruk);
  const rest = k.items.filter((i) => i !== uitgelicht);
  return (
    <div className="absolute flex flex-col" style={style}>
      <div className={cn("grid min-h-0 flex-1 gap-5", uitgelicht ? "grid-cols-[1fr_1.5fr]" : "grid-cols-1")}>
        {uitgelicht && (
          <div className="flex flex-col justify-end bg-black p-6 text-white">
            <span className="text-[22px] font-bold text-[#e30713]">{uitgelicht.label}</span>
            <span className="my-1 font-heading text-[120px] leading-none">{uitgelicht.waarde}</span>
            {uitgelicht.toelichting && <span className="text-lg text-[#ccc]">{uitgelicht.toelichting}</span>}
          </div>
        )}
        <div className={cn("grid content-start gap-4", !uitgelicht && rest.length > 2 ? "grid-cols-3" : "grid-cols-2")}>
          {rest.map((item, i) => (
            <div key={i} className="flex flex-col bg-white px-5 py-4 shadow-card">
              <span className="text-[20px] font-bold text-[#e30713]">{item.label}</span>
              <span className="my-1 font-heading text-[56px] leading-none">{item.waarde}</span>
              {item.toelichting && <span className="text-[15px] text-[#666]">{item.toelichting}</span>}
            </div>
          ))}
        </div>
      </div>
      <Bron tekst={k.bron} className="text-xs" />
    </div>
  );
}

/* ---------- Eén slide ---------- */

const TITEL_PLEK: CSSProperties = { left: 61, top: 68 };
const BODY: CSSProperties = { left: 73, top: 192, width: 1134, height: 457 };

/** Eén slide van 1280 × 720 in de layout uit het template. */
export function SlideInhoud({
  slide,
  bronnen,
  toonLeeg,
  schets = false,
  bewerk,
}: {
  slide: DeckSlide;
  bronnen?: string[];
  toonLeeg: boolean;
  schets?: boolean;
  /** In de bewerker: het vlak verschuiven en er een foto in zetten. */
  bewerk?: Bewerk;
}) {
  const doel = `slide:${slide.id}`;
  // Zonder foto: in het voorbeeld een lege plek, in een schets (kleine slides) een grijs vlak; op een deellink tekst over de hele breedte.
  const metFoto = Boolean(slide.foto?.url) || toonLeeg || schets;
  const links = vlakVan(slide);
  const vlak = <Vlak links={links} foto={slide.foto} doel={doel} leeg={false} bewerk={bewerk} />;
  switch (slide.layout) {
    case "welkom":
      return (
        <div className="relative h-full overflow-hidden">
          <Achtergrond src="/images/deck/welkom.jpg" />
          {slide.titel && <WelkomTitel titel={slide.titel} subkop={slide.subkop} />}
        </div>
      );
    case "hoofdstuk":
      return (
        <div className="relative h-full overflow-hidden">
          <Achtergrond src="/images/deck/hoofdstuk.jpg" />
          {slide.titel && <Titel tekst={slide.titel} grootte={60} max={640} style={{ left: 594, top: 296 }} />}
          {slide.subkop && <p className="absolute text-[18px] text-white" style={{ left: 610, top: 382, width: 620 }}>{slide.subkop}</p>}
        </div>
      );
    case "afsluiting":
      return (
        <div className="relative h-full overflow-hidden">
          <Achtergrond src="/images/deck/afsluiting.jpg" />
        </div>
      );
    case "foto":
      return (
        <div className="relative h-full overflow-hidden bg-black">
          {slide.foto?.url ? (
            <>
              <SleepbareFoto src={slide.foto.url} alt={slide.foto.alt ?? slide.foto.wens ?? ""} positie={slide.foto.positie} doel={doel} className="absolute inset-0 h-full w-full object-cover" />
              <VervangFoto doel={doel} wens={slide.foto.wens} positie={slide.foto.positie} zoom className="right-[24px] top-[24px]" />
            </>
          ) : (
            <>
              <div className="absolute inset-0 bg-[#d9d9d9]" />
              <AfbeeldingPlek doel={doel} wens={slide.foto?.wens} groot className="absolute inset-[120px] !h-auto" />
            </>
          )}
        </div>
      );
    case "beeld":
      return (
        <div className="relative h-full overflow-hidden bg-white">
          {(metFoto || bewerk) && <Vlak links={links} foto={slide.foto} doel={doel} leeg={toonLeeg} grijs="#d9d9d9" bewerk={bewerk} />}
          {slide.titel && <Titel tekst={slide.titel} style={TITEL_PLEK} max={Math.max(560, links + 60)} />}
          <Tekstvak subkop={slide.subkop} tekst={slide.tekst} style={{ left: 73, top: 192, width: metFoto ? Math.min(370, Math.max(260, links - 40)) : 1134, height: 457 }} />
        </div>
      );
    case "speciaal":
      return (
        <div className="relative h-full overflow-hidden" style={{ background: ROOD }}>
          {metFoto && <Vlak links={BEELD_LINKS[5]} foto={slide.foto} doel={doel} leeg={toonLeeg} grijs="#d9d9d9" />}
          {slide.titel && <Titel tekst={slide.titel} style={{ left: 62, top: 68 }} max={840} />}
          {(slide.subkop || slide.tekst) && (
            <div className="absolute flex items-end" style={{ left: 62, top: 397, width: 537, height: 219 }}>
              <div className="w-full bg-white" style={{ padding: 26 }}>
                <TekstvakVrij subkop={slide.subkop} tekst={slide.tekst} />
              </div>
            </div>
          )}
        </div>
      );
    case "quote":
      return (
        <div className="relative h-full overflow-hidden" style={{ background: ROOD }}>
          {metFoto && <Vlak links={BEELD_LINKS[5]} foto={slide.foto} doel={doel} leeg={toonLeeg} grijs="#d9d9d9" />}
          <QuoteTekst quote={slide.quote ?? ""} naam={slide.naam} />
        </div>
      );
    case "grafiek":
    case "tabel":
      return (
        <div className="relative h-full overflow-hidden bg-white">
          {vlak}
          {slide.titel && <Titel tekst={slide.titel} style={TITEL_PLEK} />}
          <Tekstvak subkop={slide.subkop} tekst={slide.tekst} style={{ left: 73, top: 192, width: 423, height: 457 }} />
          {slide.layout === "grafiek" ? (
            <DataGrafiek slide={slide} style={{ left: 526, top: 192, width: 684, height: 462 }} />
          ) : (
            <DataTabel slide={slide} style={{ left: 526, top: 192, width: 684, height: 462 }} />
          )}
          <Logo />
        </div>
      );
    case "cijfers":
      return (
        <div className="relative h-full overflow-hidden bg-white">
          {vlak}
          {slide.titel && <Titel tekst={slide.titel} style={TITEL_PLEK} />}
          <DataCijfers slide={slide} style={{ left: 73, top: 192, width: 1100, height: 470 }} />
          <Logo />
        </div>
      );
    case "rood":
    case "zwart":
      return (
        <div className="relative h-full overflow-hidden" style={{ background: slide.layout === "rood" ? ROOD : "#000" }}>
          {slide.titel && <Titel tekst={slide.titel} style={TITEL_PLEK} rood={slide.layout === "zwart"} />}
          <Tekstvak tekst={slide.tekst} style={BODY} wit />
        </div>
      );
    case "tekst":
    case "tekst-2":
    default:
      return (
        <div className="relative h-full overflow-hidden bg-white">
          {bronnen ? <Vlak links={388} doel={doel} leeg={false} /> : vlak}
          {slide.titel && <Titel tekst={slide.titel} style={TITEL_PLEK} max={slide.foto?.url ? Math.max(560, links + 60) : undefined} />}
          <Tekstvak
            subkop={slide.subkop}
            tekst={[slide.tekst, slide.layout === "tekst-2" ? slide.tekst2 : undefined].filter(Boolean).join("\n\n")}
            // Met een foto in het vlak blijft de tekst ervoor; zonder mag hij erover, zoals in het template.
            style={{ ...BODY, width: slide.foto?.url ? Math.min(1134, Math.max(300, links - 40)) : 1134 }}
            kolommen={slide.layout === "tekst-2" ? 2 : 1}
          />
          {bronnen && (
            <div className="absolute text-[18px] leading-snug" style={{ ...BODY, top: 192 }}>
              <ul className="space-y-2">
                {bronnen.map((b) => (
                  <li key={b} className="relative pl-5">
                    <span className="absolute left-0">•</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Logo />
        </div>
      );
  }
}


function TekstvakVrij({ subkop, tekst }: { subkop?: string; tekst?: string }) {
  return (
    <div style={{ fontSize: 22, lineHeight: 1.1 }}>
      {subkop && <p className="mb-2 text-[28px] font-bold leading-none text-[#e30713]">{subkop}</p>}
      {tekst && <Opmaak tekst={tekst} />}
    </div>
  );
}

function WelkomTitel({ titel, subkop }: { titel: string; subkop?: string }) {
  const { ref, grootte } = usePassend<HTMLDivElement>(67, 30, [titel]);
  return (
    <div className="absolute inset-x-[80px] text-center" style={{ top: 282 }}>
      <div ref={ref} className="overflow-hidden whitespace-nowrap" style={{ fontSize: grootte }}>
        <h1 className="inline-block bg-black font-heading uppercase leading-none text-white" style={{ padding: `${Math.round(grootte * 0.12)}px 11px ${Math.round(grootte * 0.06)}px`, lineHeight: 1.05 }}>
          {titel}
        </h1>
      </div>
      {subkop && <p className="mt-5 text-[22px] text-white">{subkop}</p>}
    </div>
  );
}

function QuoteTekst({ quote, naam }: { quote: string; naam?: string }) {
  const { ref, grootte } = usePassend<HTMLDivElement>(59, 28, [quote, naam]);
  return (
    <div ref={ref} className="absolute flex flex-col justify-center text-white" style={{ ...BODY, width: 1138, fontSize: grootte, lineHeight: 1.0 }}>
      <p>‘{quote}’</p>
      {naam && <p className="mt-3" style={{ fontSize: 24 }}>{naam}</p>}
    </div>
  );
}

/* ---------- Het deck ---------- */

/** Schaalt een vaste slide naar de breedte van de kolom. */
export function Schaal({ children, schaal, className }: { children: ReactNode; schaal: number; className?: string }) {
  return (
    <div className={cn("deck-pagina relative w-full overflow-hidden bg-white shadow-card", className)} style={{ aspectRatio: `${BREED} / ${HOOG}` }}>
      <div className="deck-schaal absolute left-0 top-0 origin-top-left" style={{ width: BREED, height: HOOG, transform: `scale(${schaal})` }}>
        {children}
      </div>
    </div>
  );
}

/** De schaal die een slide van 1280 breed in het element laat passen. */
export function useSchaal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
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
  return { ref, schaal };
}

/** De slides zoals ze getoond worden: buiten het voorbeeld zonder lege foto's, met de bronnen vóór de afsluiting. */
export function zichtbareSlides(stuk: StukInhoud, toonLeeg: boolean): { slide: DeckSlide; bronnen?: string[] }[] {
  const slides = (stuk.slides ?? []).filter((s) => toonLeeg || !(s.layout === "foto" && wachtOpFoto(s)));
  const lijst: { slide: DeckSlide; bronnen?: string[] }[] = slides.map((slide) => ({ slide }));
  const bronnen = bronnenVan(stuk);
  if (bronnen.length) {
    const i = lijst.findIndex((x) => x.slide.layout === "afsluiting");
    const bronSlide = { slide: { id: "bronnen", layout: "tekst" as const, titel: "Bronnen" }, bronnen };
    if (i === -1) lijst.push(bronSlide);
    else lijst.splice(i, 0, bronSlide);
  }
  return lijst;
}

export function DeckWeergave({ stuk, className }: { stuk: StukInhoud; peildatum?: string; className?: string }) {
  const { ref, schaal } = useSchaal<HTMLDivElement>();
  const toonLeeg = Boolean(useAfbeeldingActies());
  return (
    <div ref={ref} className={cn("deck mx-auto w-full max-w-5xl space-y-4", className)}>
      {zichtbareSlides(stuk, toonLeeg).map(({ slide, bronnen }) => (
        <Schaal key={slide.id} schaal={schaal}>
          <SlideInhoud slide={slide} bronnen={bronnen} toonLeeg={toonLeeg && MET_FOTO.includes(slide.layout)} />
        </Schaal>
      ))}
    </div>
  );
}

/** Het stuk in zijn eigen vorm: rapport of deck. */
export function StukVoorbeeld(props: { stuk: StukInhoud; peildatum: string; voetnoot?: ReactNode; className?: string }) {
  return props.stuk.soort === "deck" && props.stuk.slides?.length ? <DeckWeergave stuk={props.stuk} className={props.className} /> : <StukWeergave {...props} />;
}
