"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import {
  Maximize2,
  Minimize2,
  Monitor,
  MousePointerClick,
  Pencil,
  Smartphone,
  Tablet,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BewerkBalk, FotoVenster, LinkVenster, type BewerkActie } from "@/components/playable-loader-bewerken";
import { buildBundle, preparePage, PageSourceError, type PageSource } from "@/lib/playable-loader/bundle";
import {
  dupliceerElement,
  leesAttribuut,
  leesBewerkKeuze,
  leesKnopen,
  leesPlek,
  markeer,
  mogelijkheden,
  pasTekstToe,
  scanTags,
  verplaatsElement,
  verwijderElement,
  zetAchtergrond,
  zetFoto,
  zetLink,
  type BewerkKeuze,
  type Plek,
} from "@/lib/playable-loader/bewerken";
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
 * Twee standen om in het voorbeeld te klikken:
 * - Aanwijzen: een klik kiest een onderdeel voor de volgende vraag aan Claude
 *   (zie `lib/playable-loader/selectie.ts`).
 * - Bewerken: een klik kiest een onderdeel en zet er een werkbalk bij om het
 *   zelf aan te passen: tekst, foto, link, verplaatsen, dupliceren,
 *   verwijderen (zie `lib/playable-loader/bewerken.ts`). In het voorbeeld
 *   draagt elk element daarvoor zijn nummer uit de bron.
 *
 * Na een wijziging bouwt het voorbeeld opnieuw op; de scrollpositie en het
 * gekozen onderdeel komen terug. Een getypte tekst staat al in het voorbeeld,
 * dus dan bouwt het alleen opnieuw op als er elementen bij of af kwamen.
 */

const PLAYABLE_BASE = "https://psv-eindhoven.campaign.playable.com/";

/** Hoogte: het scherm min de werkbalk en marges eromheen, binnen deze grenzen. */
const MIN_HOOGTE = 420;
const MAX_HOOGTE = 1400;
const RUIMTE_NAAST_CHAT = 210;
const RUIMTE_GROOT_SCHERM = 150;

type Apparaat = "desktop" | "tablet" | "mobiel";
type Breedte = number | "passend";
type Stand = "uit" | "aanwijzen" | "bewerken";

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
    // Elk element krijgt zijn nummer uit de bron, voor de bewerkstand. Alleen hier, niet op Bunny.
    const bundle = buildBundle(preparePage({ ...bron, html: markeer(bron.html) }), {
      campaignId: 0,
      publishedAt: "voorbeeld",
    });
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

type VensterStaat =
  | { soort: "foto"; doel: number; fotoSoort: "img" | "achtergrond"; url: string; alt: string | null }
  | { soort: "link"; doel: number; href: string; nieuwTabblad: boolean };

export function PlayableLoaderPreview({
  bron,
  campaignId,
  aanwijzing,
  onAanwijzing,
  onBewerking,
  onOngedaan,
  kanOngedaan = false,
  ref,
}: {
  bron: PageSource;
  campaignId: number;
  aanwijzing: Aanwijzing | null;
  /** `klik`: de collega klikte zelf iets aan (geen herstel na een wijziging). */
  onAanwijzing: (aanwijzing: Aanwijzing | null, klik: boolean) => void;
  /** Een eigen wijziging in de bewerkstand, met een korte omschrijving voor de chat. */
  onBewerking: (bron: PageSource, omschrijving: string) => void;
  onOngedaan?: () => void;
  kanOngedaan?: boolean;
  ref?: Ref<PreviewHandle>;
}) {
  const [fonts, setFonts] = useState("");
  const [apparaat, setApparaat] = useState<Apparaat>("desktop");
  const [breedte, setBreedte] = useState<Breedte>("passend");
  const [uitgesteld, setUitgesteld] = useState(bron);
  const [versie, setVersie] = useState(0);
  const [kolom, setKolom] = useState(0);
  const [schermHoogte, setSchermHoogte] = useState(900);
  const [stand, setStand] = useState<Stand>("uit");
  const [grootScherm, setGrootScherm] = useState(false);
  const [keuze, setKeuze] = useState<BewerkKeuze | null>(null);
  /** Apart van de keuze: verandert bij elke scrollbeweging. */
  const [plek, setPlek] = useState<Plek | null>(null);
  const [tekstBezig, setTekstBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [venster, setVenster] = useState<VensterStaat | null>(null);
  const kolomRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  /** De bron die het voorbeeld nu toont (ook na een getypte tekst zonder opnieuw opbouwen). */
  const getoond = useRef(bron);
  /** De bron na onze eigen laatste wijziging: dan blijft de keuze staan. */
  const eigen = useRef<PageSource | null>(null);
  /** Na een eigen wijziging meteen opnieuw opbouwen, niet pas na het typen. */
  const meteen = useRef(false);
  /** Het onderdeel dat na het opnieuw opbouwen weer gekozen wordt. */
  const keuzeNummer = useRef<number | null>(null);
  const scrollY = useRef(0);

  // De berichtenluisteraar staat er één keer; hij leest de laatste stand hier.
  const laatste = useRef({ stand, aanwijzing, grootScherm, onAanwijzing, onBewerking, bron });
  useEffect(() => {
    laatste.current = { stand, aanwijzing, grootScherm, onAanwijzing, onBewerking, bron };
  });

  useEffect(() => {
    fontCss().then((f) => {
      setUitgesteld(getoond.current);
      setFonts(f);
    });
  }, []);

  // Bij typen in de codevelden niet bij elke toets opnieuw opbouwen.
  useEffect(() => {
    if (bron === getoond.current) return;
    if (bron !== eigen.current) {
      // Claude, ongedaan maken of de codevelden: de nummers kloppen dan niet meer.
      keuzeNummer.current = null;
      setKeuze(null);
      setTekstBezig(false);
    }
    const wacht = meteen.current ? 0 : 400;
    meteen.current = false;
    const t = setTimeout(() => {
      getoond.current = bron;
      setUitgesteld(bron);
      setVersie((v) => v + 1);
    }, wacht);
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

  /** Esc: eerst het grote scherm dicht, anders de stand uit. */
  const escape = useCallback(() => {
    if (laatste.current.grootScherm) setGrootScherm(false);
    else setStand("uit");
  }, []);

  /** Herbouwt het voorbeeld uit de bron, als het niet meer klopt met wat er staat. */
  const herlaad = useCallback(() => {
    getoond.current = laatste.current.bron;
    setUitgesteld(laatste.current.bron);
    setVersie((v) => v + 1);
  }, []);

  /** Zet een eigen wijziging door naar de chat en het concept. */
  const pasAan = useCallback(
    (html: string, omschrijving: string, opties: { nummer: number | null; stil?: boolean }) => {
      const nieuw = { ...laatste.current.bron, html };
      eigen.current = nieuw;
      keuzeNummer.current = opties.nummer;
      if (opties.stil) {
        getoond.current = nieuw;
      } else {
        // Tot het nieuwe voorbeeld er staat, kloppen de nummers in het oude niet meer.
        meteen.current = true;
        setKeuze(null);
      }
      setMelding(null);
      laatste.current.onBewerking(nieuw, omschrijving);
    },
    []
  );

  const startTekst = useCallback(() => {
    // Eerst het voorbeeld de focus geven: anders mag het de tekst niet selecteren.
    iframeRef.current?.focus();
    stuur({ actie: "tekst-start" });
  }, [stuur]);

  useEffect(() => {
    function ontvang(e: MessageEvent) {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      const d = e.data as Record<string, unknown> | null;
      if (!d || d.bron !== "psvk-aanwijzer") return;
      const nu = laatste.current;
      if (d.type === "gereed") {
        // Een nieuw voorbeeld (na een wijziging): stand, plek en keuzes terugzetten.
        stuur({ actie: "stand", stand: nu.stand });
        if (scrollY.current > 0) stuur({ actie: "scroll", y: scrollY.current });
        if (nu.aanwijzing) {
          const { wijzer, niveau, niveaus } = nu.aanwijzing;
          stuur({ actie: "herstel", wijzer, niveau, niveaus });
        }
        if (nu.stand === "bewerken" && keuzeNummer.current !== null) {
          stuur({ actie: "kies-nummer", nummer: keuzeNummer.current });
        }
      } else if (d.type === "selectie") {
        // Op groot scherm is de chat niet te zien; dan geen focus erheen.
        nu.onAanwijzing(d.leeg ? null : leesAanwijzing(d), d.klik === true && !nu.grootScherm);
      } else if (d.type === "bewerk-keuze") {
        // Een late melding nadat de bewerkstand uit ging, telt niet.
        if (nu.stand !== "bewerken") return;
        const k = d.leeg ? null : leesBewerkKeuze(d);
        keuzeNummer.current = k?.bron ?? null;
        setKeuze(k);
        setPlek(k?.plek ?? null);
        setMelding(null);
        if (k?.dubbel) {
          const kan = mogelijkheden(nu.bron.html, k).tekst;
          if (kan === null) startTekst();
          else if (kan) setMelding(kan);
        }
      } else if (d.type === "plek") {
        const p = leesPlek(d.plek);
        if (p) setPlek(p);
      } else if (d.type === "tekst-bezig") {
        setTekstBezig(true);
        setMelding(null);
      } else if (d.type === "tekst-klaar") {
        setTekstBezig(false);
        if (d.geannuleerd) return;
        const knopen = leesKnopen(d.knopen);
        const nummer = typeof d.nummer === "number" ? d.nummer : null;
        if (!knopen || nummer === null) return;
        try {
          const uit = pasTekstToe(nu.bron.html, nummer, knopen);
          if (uit.veranderd) pasAan(uit.html, "Tekst aangepast in het voorbeeld.", { nummer, stil: uit.zelfdeOpbouw });
        } catch (err) {
          setMelding(err instanceof Error ? err.message : String(err));
          herlaad();
        }
      } else if (d.type === "scroll") {
        if (typeof d.y === "number" && Number.isFinite(d.y)) scrollY.current = d.y;
      } else if (d.type === "escape") {
        escape();
      }
    }
    window.addEventListener("message", ontvang);
    return () => window.removeEventListener("message", ontvang);
  }, [stuur, escape, herlaad, pasAan, startTekst]);

  useEffect(() => {
    stuur({ actie: "stand", stand });
    if (stand !== "bewerken") {
      keuzeNummer.current = null;
      setKeuze(null);
      setTekstBezig(false);
      setMelding(null);
    }
  }, [stand, stuur]);

  useEffect(() => {
    if (stand === "uit" && !grootScherm) return;
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") escape();
    };
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  }, [stand, grootScherm, escape]);

  useImperativeHandle(
    ref,
    () => ({
      kiesNiveau: (niveau: number) => stuur({ actie: "niveau", niveau }),
      wis: () => stuur({ actie: "wis" }),
    }),
    [stuur]
  );

  const kan = useMemo(() => (keuze ? mogelijkheden(bron.html, keuze) : null), [bron.html, keuze]);

  /** Voert een knop uit de werkbalk uit. */
  function actie(soort: BewerkActie) {
    if (!keuze || !kan) return;
    setMelding(null);
    try {
      switch (soort) {
        case "tekst":
          startTekst();
          return;
        case "ouder":
          stuur({ actie: "kies-ouder" });
          return;
        case "foto": {
          if (!kan.foto || kan.foto.doel === null) return;
          const tag = scanTags(bron.html)[kan.foto.doel];
          setVenster({
            soort: "foto",
            doel: kan.foto.doel,
            fotoSoort: kan.foto.soort,
            url: kan.foto.url,
            alt: kan.foto.soort === "img" && tag ? leesAttribuut(tag, "alt") : null,
          });
          return;
        }
        case "link": {
          if (!kan.link || kan.link.doel === null) return;
          const tag = scanTags(bron.html)[kan.link.doel];
          setVenster({
            soort: "link",
            doel: kan.link.doel,
            href: (tag && leesAttribuut(tag, "href")) ?? keuze.link?.href ?? "",
            nieuwTabblad: !!tag && leesAttribuut(tag, "target") === "_blank",
          });
          return;
        }
        case "omhoog":
        case "omlaag": {
          const uit = verplaatsElement(bron.html, keuze.bron, soort === "omhoog" ? -1 : 1);
          pasAan(uit.html, `${keuze.naam} ${soort} verplaatst in het voorbeeld.`, { nummer: uit.nieuweId });
          return;
        }
        case "dupliceren": {
          const uit = dupliceerElement(bron.html, keuze.bron);
          pasAan(uit.html, `${keuze.naam} gedupliceerd in het voorbeeld.`, { nummer: uit.nieuweId });
          return;
        }
        case "verwijderen":
          pasAan(verwijderElement(bron.html, keuze.bron), `${keuze.naam} verwijderd uit het voorbeeld.`, { nummer: null });
          return;
      }
    } catch (err) {
      setMelding(err instanceof Error ? err.message : String(err));
    }
  }

  function kiesFoto(src: string, alt?: string) {
    if (venster?.soort !== "foto") return;
    try {
      const html =
        venster.fotoSoort === "img"
          ? zetFoto(bron.html, venster.doel, src, alt)
          : zetAchtergrond(bron.html, venster.doel, src);
      pasAan(html, venster.fotoSoort === "img" ? "Andere foto gekozen in het voorbeeld." : "Andere achtergrond gekozen in het voorbeeld.", {
        nummer: keuzeNummer.current,
      });
    } catch (err) {
      setMelding(err instanceof Error ? err.message : String(err));
    }
    setVenster(null);
  }

  function kiesLink(href: string, nieuwTabblad: boolean) {
    if (venster?.soort !== "link") return;
    try {
      pasAan(zetLink(bron.html, venster.doel, href, nieuwTabblad), `Link aangepast in het voorbeeld: ${href}`, {
        nummer: keuzeNummer.current,
      });
    } catch (err) {
      setMelding(err instanceof Error ? err.message : String(err));
    }
    setVenster(null);
  }

  const doc = useMemo(() => voorbeeldDocument(uitgesteld, fonts), [uitgesteld, fonts]);
  const echteBreedte = breedte === "passend" ? Math.max(320, Math.floor(kolom || 1280)) : breedte;
  const schaal = kolom > 0 ? Math.min(1, kolom / echteBreedte) : 1;
  const hoogte = Math.max(
    MIN_HOOGTE,
    Math.min(grootScherm ? Infinity : MAX_HOOGTE, schermHoogte - (grootScherm ? RUIMTE_GROOT_SCHERM : RUIMTE_NAAST_CHAT))
  );
  const zichtbareBreedte = Math.min(kolom || echteBreedte, echteBreedte * schaal);

  function kiesApparaat(a: Apparaat) {
    setApparaat(a);
    setBreedte(APPARATEN[a].standaard);
  }

  const hint =
    stand === "aanwijzen"
      ? grootScherm
        ? "Klik een onderdeel aan; je stelt je vraag na Terug. Esc stopt."
        : "Klik het onderdeel aan waar je vraag over gaat. Links doen nu niets; Esc stopt."
      : stand === "bewerken"
        ? tekstBezig
          ? "Typ de nieuwe tekst. Enter bewaart, Esc annuleert, Shift+Enter is een nieuwe regel."
          : keuze
            ? null
            : "Klik een onderdeel aan om het zelf aan te passen; dubbelklik op een tekst om hem meteen te typen. Esc stopt."
        : null;

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
            variant={stand === "aanwijzen" ? "default" : "outline"}
            onClick={() => setStand(stand === "aanwijzen" ? "uit" : "aanwijzen")}
            aria-pressed={stand === "aanwijzen"}
            title="Klik een onderdeel aan in het voorbeeld; Claude krijgt het mee bij je volgende vraag"
          >
            <MousePointerClick />
            Aanwijzen
          </Button>
          <Button
            type="button"
            size="sm"
            variant={stand === "bewerken" ? "default" : "outline"}
            onClick={() => setStand(stand === "bewerken" ? "uit" : "bewerken")}
            aria-pressed={stand === "bewerken"}
            title="Zelf een tekst, foto of link aanpassen, of een onderdeel verplaatsen, dupliceren of weghalen"
          >
            <Pencil />
            Bewerken
          </Button>
          {stand === "bewerken" && onOngedaan && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onOngedaan}
              disabled={!kanOngedaan || tekstBezig}
              title="De laatste wijziging terugdraaien"
            >
              <Undo2 />
              <span className="sr-only">Ongedaan maken</span>
            </Button>
          )}
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
              stand !== "uit" ? "border-primary ring-2 ring-primary/30" : "border-border"
            )}
            style={{ width: zichtbareBreedte, height: hoogte }}
          >
            {/* Zwevend, zodat het voorbeeld niet van hoogte verandert. */}
            {hint && (
              <p
                className="pointer-events-none absolute bottom-3 left-1/2 z-10 w-max max-w-[calc(100%_-_1.5rem)] -translate-x-1/2 border-l-4 border-primary bg-psv-neutralDark/90 px-3 py-1.5 text-xs text-white shadow-card"
                role="status"
              >
                {hint}
              </p>
            )}
            {stand === "bewerken" && keuze && kan && plek && (
              <BewerkBalk
                keuze={keuze}
                plek={plek}
                kan={kan}
                schaal={schaal}
                breedte={zichtbareBreedte}
                hoogte={hoogte}
                tekstBezig={tekstBezig}
                melding={melding}
                onActie={actie}
                onMelding={setMelding}
                onTekstStop={(bewaar) => stuur({ actie: "tekst-stop", bewaar })}
                onTekstWacht={() => stuur({ actie: "tekst-wacht" })}
                onSluit={() => {
                  stuur({ actie: "bewerk-wis" });
                  keuzeNummer.current = null;
                  setKeuze(null);
                  setMelding(null);
                }}
              />
            )}
            <iframe
              key={versie}
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
      {melding && !(stand === "bewerken" && keuze) && (
        <p className="form-error !mt-0" role="status">
          {melding}
        </p>
      )}
      {!grootScherm && (
        <p className="form-hint !mt-0">
          Lijkt op de echte pagina, maar zonder de opmaak van Playable zelf. Kijk na het publiceren altijd even op
          de demo.
        </p>
      )}

      {venster?.soort === "foto" && (
        <FotoVenster
          campaignId={campaignId}
          huidig={venster.url}
          soort={venster.fotoSoort}
          alt={venster.alt}
          onSluit={() => setVenster(null)}
          onKies={kiesFoto}
        />
      )}
      {venster?.soort === "link" && (
        <LinkVenster
          href={venster.href}
          nieuwTabblad={venster.nieuwTabblad}
          onSluit={() => setVenster(null)}
          onKies={kiesLink}
        />
      )}
    </div>
  );
}
