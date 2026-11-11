"use client";

import { useEffect, useMemo, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildBundle, preparePage, PageSourceError, type PageSource } from "@/lib/playable-loader/bundle";
import { cn } from "@/lib/utils";

/**
 * Voorbeeld van het concept, met dezelfde bundel die op Bunny komt. Het
 * draait in een afgeschermd iframe (alleen scripts, geen toegang tot PSV
 * Tools). Beelden met een pad als `/files/4075/...` komen via de base van
 * Playable; de lettertypes komen uit PSV Tools, als data-URL omdat het
 * afgeschermde iframe ze anders niet mag laden.
 */

const PLAYABLE_BASE = "https://psv-eindhoven.campaign.playable.com/";

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
  const [breedte, setBreedte] = useState<"desktop" | "mobiel">("desktop");
  const [uitgesteld, setUitgesteld] = useState(bron);

  useEffect(() => {
    fontCss().then(setFonts);
  }, []);

  // Bij typen in de codevelden niet bij elke toets opnieuw opbouwen.
  useEffect(() => {
    const t = setTimeout(() => setUitgesteld(bron), 400);
    return () => clearTimeout(t);
  }, [bron]);

  const doc = useMemo(() => voorbeeldDocument(uitgesteld, fonts), [uitgesteld, fonts]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="form-label !mb-0">Voorbeeld van het concept</p>
        <div className="flex gap-1">
          {(
            [
              ["desktop", Monitor, "Desktop"],
              ["mobiel", Smartphone, "Mobiel"],
            ] as const
          ).map(([waarde, Icon, label]) => (
            <Button
              key={waarde}
              type="button"
              size="sm"
              variant={breedte === waarde ? "default" : "outline"}
              onClick={() => setBreedte(waarde)}
              aria-pressed={breedte === waarde}
            >
              <Icon />
              {label}
            </Button>
          ))}
        </div>
      </div>

      {doc.fout ? (
        <div className="alert alert--error !mb-0">{doc.fout}</div>
      ) : (
        <div className="flex justify-center border border-border bg-muted">
          <iframe
            title="Voorbeeld van de pagina"
            sandbox="allow-scripts allow-popups"
            srcDoc={doc.html}
            className={cn("h-[640px] bg-background", breedte === "mobiel" ? "w-[390px]" : "w-full")}
          />
        </div>
      )}
      <p className="form-hint !mt-0">
        Lijkt op de echte pagina, maar zonder de opmaak van Playable zelf. Kijk na het publiceren altijd even op
        de demo.
      </p>
    </div>
  );
}
