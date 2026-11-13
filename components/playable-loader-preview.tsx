"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import {
  Maximize2,
  Minimize2,
  Monitor,
  MousePointerClick,
  Smartphone,
  Tablet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildBundle, preparePage, PageSourceError, type PageSource } from "@/lib/playable-loader/bundle";
import { AANWIJZER_JS, leesAanwijzing, type Aanwijzing } from "@/lib/playable-loader/selectie";
import { cn } from "@/lib/utils";

/**
 * Voorbeeld van het concept, met dezelfde bundel die op Bunny komt. Het
 * draait in een afgeschermd iframe (alleen scripts, geen toegang tot PSV
 * Tools). Beelden met een pad als `/files/4075/...` komen via de base van
 * Playable; de lettertypes komen uit PSV Tools, als data-URL omdat het
 * afgeschermde iframe ze anders niet mag laden.
 *
 * Breedte: standaard "Passend", zo breed als de kolom (op ware grootte). Een
 * vaste breedte geeft het iframe die echte breedte, zodat de breekpunten van
 * de Kit (1080, 820, 720 en 520 px) kloppen, en verkleint hem tot hij past.
 * De hoogte volgt het scherm. "Groot scherm" legt het voorbeeld over de hele
 * pagina.
 *
 * Aanwijzen: in die stand tekent het voorbeeld een kader om wat onder de muis
 * zit, en een klik kiest dat onderdeel voor de volgende vraag aan Claude (zie
 * `lib/playable-loader/selectie.ts`).
 */

const PLAYABLE_BASE = "https://psv-eindhoven.campaign.playable.com/";

/** Hoogte: het scherm min de werkbalk en marges eromheen, binnen deze grenzen. */
const MIN_HOOGTE = 420;
const MAX_HOOGTE = 1400;
const RUIMTE_NAAST_CHAT = 210;
const RUIMTE_GROOT_SCHERM = 150;

type Apparaat = "desktop" | "tablet" | "mobiel";
type Breedte = number | "passend";

const APPARATEN: Record<
  Apparaat,
  { label: string; icon: LucideIcon; standaard: Breedte; breedtes: { px: Breedte; naam: string }[] }
> = {
  desktop: {
    label: "Desktop",
    icon: Monitor,
    standaard: "passend",
    breedtes: [
      { px: "passend", naam: "Zo breed als past" },
      { px: 1920, naam: "Groot scherm" },
      { px: 1440, naam: "Laptop" },
      { px: 1280, naam: "Kleine laptop" },
    ],
  },
  tablet: {
    label: "Tablet",
    icon: Tablet,
    standaard: 768,
    breedtes: [
      { px: 1024, naam: "Liggend" },
      { px: 768, naam: "Staand" },
    ],
  },
  mobiel: {
    label: "Mobiel",
    icon: Smartphone,
    standaard: 390,
    breedtes: [
      { px: 430, naam: "Groot" },
      { px: 390, naam: "iPhone" },
      { px: 360, naam: "Android" },
    ],
  },
};

const FONTS: { family: string; weight: number; file: string; format: string }[] = [
  { family: "PSV Condensed", weight: 400, file: "/fonts/PSVCondensed-Bold.otf", format: "opentype" },
  { family: "PSV Condensed", weight: 700, file: "/fonts/PSVCondensed-Bold.otf", format: "opentype" },
  { family: "PSV Sans", weight: 400, file: "/fonts/PSVText-Regular.ttf", format: "truetype" },
  { family: "PSV Sans", weight: 700, file: "/fonts/PSVText-Bold.ttf", format: "truetype" },
];

let fontCssBelofte: Promise<string> | null = null;

function fontCss(): Promise<string> {
  fontCssBelofte ??= Promise.all(
    [...new Set(FONTS.map((f) => f.file))].map(async (file) => {
      const blob = await (await fetch(file)).blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      return [file, dataUrl] as const;
    })
  )
    .then((paren) => {
      const url = new Map(paren);
      return FONTS.map(
        (f) =>
          `@font-face { font-family: '${f.family}'; font-weight: ${f.weight}; src: url('${url.get(f.file)}') format('${f.format}'); }`
      ).join("\n");
    })
    .catch(() => "");
  return fontCssBelofte;
}

/** Binnen een inline <script> mag nergens </script staan. */
function inline(js: string): string {
  return js.replace(/<\/script/gi, "<\\/script");
}

function voorbeeldDocument(bron: PageSource, fonts: string): { html: string; fout: string | null } {
  try {
    const bundle = buildBundle(preparePage(bron), { campaignId: 0, publishedAt: "voorbeeld" });
    return {
      html: `<!doctype html><html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href="${PLAYABLE_BASE}" target="_blank">
<style>${fonts}\nhtml, body { margin: 0; }</style>
</head><body><div id="psvk-mount"></div><script>${inline(bundle)}</script><script>${inline(AANWIJZER_JS)}</script></body></html>`,
      fout: null,
    };
  } catch (err) {
    return { html: "", fout: err instanceof PageSourceError ? err.message : String(err) };
  }
}

/** Wat de chat met het voorbeeld kan doen. */
export interface PreviewHandle {
  /** Kies een niveau hoger of lager in de keten van het aangeklikte onderdeel. */
  kiesNiveau: (niveau: number) => void;
  /** Haal het kader van het gekozen onderdeel weg. */
  wis: () => void;
}

export function PlayableLoaderPreview({
  bron,
  aanwijzing,
  onAanwijzing,
  ref,
}: {
  bron: PageSource;
  aanwijzing: Aanwijzing | null;
  /** `klik`: de collega klikte zelf iets aan (geen herstel na een wijziging). */
  onAanwijzing: (aanwijzing: Aanwijzing | null, klik: boolean) => void;
  ref?: Ref<PreviewHandle>;
}) {
  const [fonts, setFonts] = useState("");
  const [apparaat, setApparaat] = useState<Apparaat>("desktop");
  const [breedte, setBreedte] = useState<Breedte>("passend");
  const [uitgesteld, setUitgesteld] = useState(bron);
  const [kolom, setKolom] = useState(0);
  const [schermHoogte, setSchermHoogte] = useState(900);
  const [aanwijzen, setAanwijzen] = useState(false);
  const [grootScherm, setGrootScherm] = useState(false);
  const kolomRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // De berichtenluisteraar staat er één keer; hij leest de laatste stand hier.
  const laatste = useRef({ aanwijzen, aanwijzing, grootScherm, onAanwijzing });
  useEffect(() => {
    laatste.current = { aanwijzen, aanwijzing, grootScherm, onAanwijzing };
  });

  useEffect(() => {
    fontCss().then(setFonts);
  }, []);

  // Bij typen in de codevelden niet bij elke toets opnieuw opbouwen.
  useEffect(() => {
    const t = setTimeout(() => setUitgesteld(bron), 400);
    return () => clearTimeout(t);
  }, [bron]);

  useEffect(() => {
    const el = kolomRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setKolom(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const meet = () => setSchermHoogte(window.innerHeight);
    meet();
    window.addEventListener("resize", meet);
    return () => window.removeEventListener("resize", meet);
  }, []);

  const stuur = useCallback((bericht: Record<string, unknown>) => {
    // Het iframe heeft geen eigen origin (sandbox zonder allow-same-origin), dus "*".
    iframeRef.current?.contentWindow?.postMessage({ ...bericht, bron: "psvk-aanwijzer-ouder" }, "*");
  }, []);

  /** Esc: eerst het grote scherm dicht, anders stoppen met aanwijzen. */
  const escape = useCallback(() => {
    if (laatste.current.grootScherm) setGrootScherm(false);
    else setAanwijzen(false);
  }, []);

  useEffect(() => {
    function ontvang(e: MessageEvent) {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      const d = e.data as Record<string, unknown> | null;
      if (!d || d.bron !== "psvk-aanwijzer") return;
      const nu = laatste.current;
      if (d.type === "gereed") {
        // Een nieuw voorbeeld (na een wijziging): stand en keuze terugzetten.
        if (nu.aanwijzen) stuur({ actie: "aan" });
        if (nu.aanwijzing) {
          const { wijzer, niveau, niveaus } = nu.aanwijzing;
          stuur({ actie: "herstel", wijzer, niveau, niveaus });
        }
      } else if (d.type === "selectie") {
        // Op groot scherm is de chat niet te zien; dan geen focus erheen.
        nu.onAanwijzing(d.leeg ? null : leesAanwijzing(d), d.klik === true && !nu.grootScherm);
      } else if (d.type === "escape") {
        escape();
      }
    }
    window.addEventListener("message", ontvang);
    return () => window.removeEventListener("message", ontvang);
  }, [stuur, escape]);

  useEffect(() => {
    stuur({ actie: aanwijzen ? "aan" : "uit" });
  }, [aanwijzen, stuur]);

  useEffect(() => {
    if (!aanwijzen && !grootScherm) return;
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") escape();
    };
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  }, [aanwijzen, grootScherm, escape]);

  useImperativeHandle(
    ref,
    () => ({
      kiesNiveau: (niveau: number) => stuur({ actie: "niveau", niveau }),
      wis: () => stuur({ actie: "wis" }),
    }),
    [stuur]
  );

  const doc = useMemo(() => voorbeeldDocument(uitgesteld, fonts), [uitgesteld, fonts]);
  const echteBreedte = breedte === "passend" ? Math.max(320, Math.floor(kolom || 1280)) : breedte;
  const schaal = kolom > 0 ? Math.min(1, kolom / echteBreedte) : 1;
  const hoogte = Math.max(
    MIN_HOOGTE,
    Math.min(grootScherm ? Infinity : MAX_HOOGTE, schermHoogte - (grootScherm ? RUIMTE_GROOT_SCHERM : RUIMTE_NAAST_CHAT))
  );

  function kiesApparaat(a: Apparaat) {
    setApparaat(a);
    setBreedte(APPARATEN[a].standaard);
  }

  return (
    <div
      className={cn(
        "space-y-3",
        grootScherm && "fixed inset-0 z-50 overflow-auto border-t-4 border-t-psv-red-primary bg-background p-4 sm:p-6"
      )}
      role={grootScherm ? "dialog" : undefined}
      aria-modal={grootScherm || undefined}
      aria-label={grootScherm ? "Voorbeeld op groot scherm" : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="form-label !mb-0">Voorbeeld van het concept</p>
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            size="sm"
            variant={aanwijzen ? "default" : "outline"}
            onClick={() => setAanwijzen(!aanwijzen)}
            aria-pressed={aanwijzen}
            title="Klik een onderdeel aan in het voorbeeld; Claude krijgt het mee bij je volgende vraag"
          >
            <MousePointerClick />
            Aanwijzen
          </Button>
          <div className="flex gap-1" role="group" aria-label="Soort scherm">
            {(Object.keys(APPARATEN) as Apparaat[]).map((a) => {
              const { label, icon: Icon } = APPARATEN[a];
              return (
                <Button
                  key={a}
                  type="button"
                  size="sm"
                  variant={apparaat === a ? "secondary" : "ghost"}
                  onClick={() => kiesApparaat(a)}
                  aria-pressed={apparaat === a}
                  title={label}
                >
                  <Icon />
                  <span className="hidden 2xl:inline">{label}</span>
                  <span className="sr-only 2xl:hidden">{label}</span>
                </Button>
              );
            })}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setGrootScherm(!grootScherm)}
            aria-pressed={grootScherm}
            title={grootScherm ? "Terug naar de chat (Esc)" : "Voorbeeld over het hele scherm"}
          >
            {grootScherm ? <Minimize2 /> : <Maximize2 />}
            {grootScherm ? "Terug" : <span className="sr-only">Groot scherm</span>}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Schermbreedte">
        {APPARATEN[apparaat].breedtes.map(({ px, naam }) => (
          <button
            key={px}
            type="button"
            onClick={() => setBreedte(px)}
            aria-pressed={breedte === px}
            title={naam}
            className={cn(
              "border px-2.5 py-1 text-xs transition-colors",
              breedte === px
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary hover:text-primary"
            )}
          >
            {px === "passend" ? "Passend" : `${px} px`}
            {px !== "passend" && <span className="hidden sm:inline"> · {naam}</span>}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {schaal < 1
            ? `${echteBreedte} px, verkleind tot ${Math.round(schaal * 100)}%`
            : `${echteBreedte} px, ware grootte`}
        </span>
      </div>


      <div ref={kolomRef}>
        {doc.fout ? (
          <div className="alert alert--error !mb-0">{doc.fout}</div>
        ) : (
          <div
            className={cn(
              "relative mx-auto overflow-hidden border bg-muted",
              aanwijzen ? "border-primary ring-2 ring-primary/30" : "border-border"
            )}
            style={{ width: Math.min(kolom || echteBreedte, echteBreedte * schaal), height: hoogte }}
          >
            {/* Zwevend, zodat het voorbeeld niet van hoogte verandert. */}
            {aanwijzen && (
              <p
                className="pointer-events-none absolute bottom-3 left-1/2 z-10 w-max max-w-[calc(100%_-_1.5rem)] -translate-x-1/2 border-l-4 border-primary bg-psv-neutralDark/90 px-3 py-1.5 text-xs text-white shadow-card"
                role="status"
              >
                {grootScherm
                  ? "Klik een onderdeel aan; je stelt je vraag na Terug. Esc stopt."
                  : "Klik het onderdeel aan waar je vraag over gaat. Links doen nu niets; Esc stopt."}
              </p>
            )}
            <iframe
              ref={iframeRef}
              title="Voorbeeld van de pagina"
              sandbox="allow-scripts allow-popups"
              srcDoc={doc.html}
              className="block bg-background"
              style={{
                width: echteBreedte,
                height: hoogte / schaal,
                transform: `scale(${schaal})`,
                transformOrigin: "0 0",
              }}
            />
          </div>
        )}
      </div>
      {!grootScherm && (
        <p className="form-hint !mt-0">
          Lijkt op de echte pagina, maar zonder de opmaak van Playable zelf. Kijk na het publiceren altijd even op
          de demo.
        </p>
      )}
    </div>
  );
}
