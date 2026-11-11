"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Smartphone, Tablet, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildBundle, preparePage, PageSourceError, type PageSource } from "@/lib/playable-loader/bundle";
import { cn } from "@/lib/utils";

/**
 * Voorbeeld van het concept, met dezelfde bundel die op Bunny komt. Het
 * draait in een afgeschermd iframe (alleen scripts, geen toegang tot PSV
 * Tools). Beelden met een pad als `/files/4075/...` komen via de base van
 * Playable; de lettertypes komen uit PSV Tools, als data-URL omdat het
 * afgeschermde iframe ze anders niet mag laden.
 *
 * Het iframe krijgt de echte breedte van het gekozen scherm, zodat de
 * breekpunten van de Kit (1080, 820, 720 en 520 px) kloppen, en wordt
 * verkleind tot hij in de kolom past.
 */

const PLAYABLE_BASE = "https://psv-eindhoven.campaign.playable.com/";
const ZICHTBARE_HOOGTE = 720;

type Apparaat = "desktop" | "tablet" | "mobiel";

const APPARATEN: Record<Apparaat, { label: string; icon: LucideIcon; breedtes: { px: number; naam: string }[] }> = {
  desktop: {
    label: "Desktop",
    icon: Monitor,
    breedtes: [
      { px: 1920, naam: "Groot scherm" },
      { px: 1440, naam: "Laptop" },
      { px: 1280, naam: "Kleine laptop" },
    ],
  },
  tablet: {
    label: "Tablet",
    icon: Tablet,
    breedtes: [
      { px: 1024, naam: "Liggend" },
      { px: 768, naam: "Staand" },
    ],
  },
  mobiel: {
    label: "Mobiel",
    icon: Smartphone,
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

function voorbeeldDocument(bron: PageSource, fonts: string): { html: string; fout: string | null } {
  try {
    const bundle = buildBundle(preparePage(bron), { campaignId: 0, publishedAt: "voorbeeld" })
      // Binnen een inline <script> mag nergens </script staan.
      .replace(/<\/script/gi, "<\\/script");
    return {
      html: `<!doctype html><html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href="${PLAYABLE_BASE}" target="_blank">
<style>${fonts}\nhtml, body { margin: 0; }</style>
</head><body><div id="psvk-mount"></div><script>${bundle}</script></body></html>`,
      fout: null,
    };
  } catch (err) {
    return { html: "", fout: err instanceof PageSourceError ? err.message : String(err) };
  }
}

export function PlayableLoaderPreview({ bron }: { bron: PageSource }) {
  const [fonts, setFonts] = useState("");
  const [apparaat, setApparaat] = useState<Apparaat>("desktop");
  const [breedte, setBreedte] = useState(1440);
  const [uitgesteld, setUitgesteld] = useState(bron);
  const [kolom, setKolom] = useState(0);
  const kolomRef = useRef<HTMLDivElement>(null);

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

  const doc = useMemo(() => voorbeeldDocument(uitgesteld, fonts), [uitgesteld, fonts]);
  const schaal = kolom > 0 ? Math.min(1, kolom / breedte) : 1;

  function kiesApparaat(a: Apparaat) {
    setApparaat(a);
    // Middelste of eerste breedte als standaard: laptop, liggend, iPhone.
    const opties = APPARATEN[a].breedtes;
    setBreedte(opties[Math.min(1, opties.length - 1)].px);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="form-label !mb-0">Voorbeeld van het concept</p>
        <div className="flex gap-1" role="group" aria-label="Soort scherm">
          {(Object.keys(APPARATEN) as Apparaat[]).map((a) => {
            const { label, icon: Icon } = APPARATEN[a];
            return (
              <Button
                key={a}
                type="button"
                size="sm"
                variant={apparaat === a ? "default" : "outline"}
                onClick={() => kiesApparaat(a)}
                aria-pressed={apparaat === a}
              >
                <Icon />
                {label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Schermbreedte">
        {APPARATEN[apparaat].breedtes.map(({ px, naam }) => (
          <button
            key={px}
            type="button"
            onClick={() => setBreedte(px)}
            aria-pressed={breedte === px}
            className={cn(
              "border px-2.5 py-1 text-xs transition-colors",
              breedte === px
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary hover:text-primary"
            )}
          >
            {px} px <span className="hidden sm:inline">· {naam}</span>
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {schaal < 1 ? `Verkleind tot ${Math.round(schaal * 100)}%` : "Ware grootte"}
        </span>
      </div>

      <div ref={kolomRef}>
        {doc.fout ? (
          <div className="alert alert--error !mb-0">{doc.fout}</div>
        ) : (
          <div
            className="mx-auto overflow-hidden border border-border bg-muted"
            style={{ width: Math.min(kolom || breedte, breedte * schaal), height: ZICHTBARE_HOOGTE }}
          >
            <iframe
              title="Voorbeeld van de pagina"
              sandbox="allow-scripts allow-popups"
              srcDoc={doc.html}
              className="block bg-background"
              style={{
                width: breedte,
                height: ZICHTBARE_HOOGTE / schaal,
                transform: `scale(${schaal})`,
                transformOrigin: "0 0",
              }}
            />
          </div>
        )}
      </div>
      <p className="form-hint !mt-0">
        Lijkt op de echte pagina, maar zonder de opmaak van Playable zelf. Kijk na het publiceren altijd even op
        de demo.
      </p>
    </div>
  );
}
