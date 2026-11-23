"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Copy, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Schaal, SlideInhoud, useSchaal } from "@/components/stuk/deck-weergave";
import { AfbeeldingPlek, AfbeeldingProvider, VervangFoto } from "@/components/stuk/afbeelding";
import { BlokEditor } from "@/components/stuk/stuk-bewerker";
import { HANDMATIGE_BRON, nieuwBlok } from "@/lib/stukken/bewerken";
import type { Blok, BlokInhoud, Stuk } from "@/lib/stukken/model";
import {
  LAYOUTS,
  LAYOUT_LABEL,
  LAYOUT_UITLEG,
  LAYOUT_VELDEN,
  MET_FOTO,
  nadrukKeuzesVan,
  wachtOpFoto,
  type DeckSlide,
  type SlideLayout,
  type SlideVelden,
} from "@/lib/stukken/deck";

/**
 * Een deck bewerken, slide voor slide. Bovenaan alle slides klein (klik om er
 * een te kiezen, + om er een toe te voegen), daaronder de gekozen slide groot
 * met de velden van zijn layout. Elke wijziging gaat via PATCH naar de server
 * (dezelfde regels als bij de assistent) en wordt een nieuwe versie.
 */

const VELD_LABEL = "font-heading text-[11px] uppercase tracking-wide text-muted-foreground";

type Bewerking = { acties: unknown[] };

/** Voorbeeldinhoud voor een nieuwe slide, zodat je meteen ziet hoe de layout eruitziet. */
function nieuweSlide(layout: SlideLayout): Record<string, unknown> {
  const data = (type: "grafiek" | "tabel" | "kerngetallen") => {
    const { type: _t, ...rest } = nieuwBlok(type) as BlokInhoud & Record<string, unknown>;
    void _t;
    return rest;
  };
  switch (layout) {
    case "welkom":
    case "hoofdstuk":
      return { layout, titel: "Titel" };
    case "tekst":
    case "rood":
    case "zwart":
      return { layout, titel: "Titel", tekst: "- Eerste punt\n- Tweede punt" };
    case "tekst-2":
      return { layout, titel: "Titel", tekst: "- Eerste punt", tekst2: "- Tweede kolom" };
    case "beeld":
      return { layout, titel: "Titel", subkop: "Subkop", tekst: "- Eerste punt\n- Tweede punt", fotoBreedte: 3, foto: { wens: "Beschrijf welke foto hier moet" } };
    case "speciaal":
      return { layout, titel: "Titel", tekst: "- Eerste punt", foto: { wens: "Beschrijf welke foto hier moet" } };
    case "quote":
      return { layout, quote: "Vul hier een quote in", naam: "Naam Achternaam", foto: { wens: "Beschrijf welke foto hier moet" } };
    case "foto":
      return { layout, foto: { wens: "Beschrijf welke foto hier moet" } };
    case "grafiek":
      return { layout, titel: "Titel", tekst: "- Wat de grafiek laat zien", grafiek: data("grafiek") };
    case "tabel":
      return { layout, titel: "Titel", tekst: "- Wat de tabel laat zien", tabel: data("tabel") };
    case "cijfers":
      return { layout, titel: "In cijfers", kerngetallen: data("kerngetallen") };
    case "afsluiting":
      return { layout };
  }
}

/** Een slide klein, voor de rij bovenaan en de layoutkiezer. */
function Mini({ slide, breedte = 168 }: { slide: DeckSlide; breedte?: number }) {
  return (
    <div style={{ width: breedte }}>
      <AfbeeldingProvider acties={null}>
        <Schaal schaal={breedte / 1280} className="pointer-events-none !shadow-none">
          <SlideInhoud slide={slide} toonLeeg={false} schets />
        </Schaal>
      </AfbeeldingProvider>
    </div>
  );
}

function Veld({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className={VELD_LABEL}>{label}</span>
      {children}
    </label>
  );
}

/** De layoutkiezer: alle layouts uit het template, met een voorbeeld. */
function LayoutKiezer({ onKies, onSluit }: { onKies: (layout: SlideLayout) => void; onSluit: () => void }) {
  return (
    <div className="space-y-3 rounded-md border border-psv-red-primary bg-card p-3">
      <div className="flex items-center">
        <p className={VELD_LABEL}>Slide toevoegen: kies een layout uit het template</p>
        <button type="button" onClick={onSluit} aria-label="Sluiten" className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {LAYOUTS.map((layout) => (
          <button
            key={layout}
            type="button"
            onClick={() => onKies(layout)}
            className="group space-y-1 rounded-md border border-border p-2 text-left transition-colors hover:border-psv-red-primary"
          >
            <Mini slide={{ id: "voorbeeld", ...(nieuweSlide(layout) as Omit<DeckSlide, "id">) }} breedte={180} />
            <p className="font-heading text-xs uppercase tracking-wide">{LAYOUT_LABEL[layout]}</p>
            <p className="text-[11px] leading-snug text-muted-foreground">{LAYOUT_UITLEG[layout]}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

/** De velden van de gekozen slide. Tekstvelden worden opgeslagen als je het veld verlaat. */
function SlideVeldenForm({ slide, bezig, bewaar }: { slide: DeckSlide; bezig: boolean; bewaar: (wijziging: Record<string, unknown>) => Promise<unknown> }) {
  const velden = LAYOUT_VELDEN[slide.layout];
  const [concept, setConcept] = useState<SlideVelden>(slide);
  const [dataOpen, setDataOpen] = useState(false);
  useEffect(() => {
    setConcept(slide);
    setDataOpen(false);
  }, [slide]);

  const tekstVeld = (sleutel: "titel" | "subkop" | "naam", label: string, placeholder?: string) =>
    velden.includes(sleutel) && (
      <Veld label={label}>
        <Input
          value={(concept[sleutel] as string | undefined) ?? ""}
          placeholder={placeholder}
          onChange={(e) => setConcept((c) => ({ ...c, [sleutel]: e.target.value }))}
          onBlur={() => (concept[sleutel] ?? "") !== (slide[sleutel] ?? "") && bewaar({ [sleutel]: (concept[sleutel] as string)?.trim() || null })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className={sleutel === "titel" ? "font-heading uppercase" : undefined}
        />
      </Veld>
    );
  const vlakVeld = (sleutel: "tekst" | "tekst2" | "quote", label: string, hint?: string) =>
    velden.includes(sleutel) && (
      <Veld label={label}>
        <Textarea
          value={(concept[sleutel] as string | undefined) ?? ""}
          rows={Math.min(10, Math.max(3, ((concept[sleutel] as string) ?? "").split("\n").length + 1))}
          onChange={(e) => setConcept((c) => ({ ...c, [sleutel]: e.target.value }))}
          onBlur={() => (concept[sleutel] ?? "") !== (slide[sleutel] ?? "") && bewaar({ [sleutel]: (concept[sleutel] as string)?.trim() || null })}
        />
        {hint && <span className="form-hint">{hint}</span>}
      </Veld>
    );

  const dataType = slide.layout === "grafiek" ? "grafiek" : slide.layout === "tabel" ? "tabel" : slide.layout === "cijfers" ? "kerngetallen" : null;
  const data = dataType ? slide[dataType] : undefined;
  const keuzes = nadrukKeuzesVan(slide);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {tekstVeld("titel", "Titel (wit op het zwarte blok, één regel)", "Kort: wat moet de lezer onthouden?")}
        {tekstVeld("subkop", slide.layout === "welkom" || slide.layout === "hoofdstuk" ? "Regel onder de titel" : "Subkop (rood)")}
      </div>
      {vlakVeld("tekst", slide.layout === "tekst-2" ? "Linkerkolom" : "Tekst", "**vet** wordt vet, een regel die met \"- \" begint een opsomming.")}
      {vlakVeld("tekst2", "Rechterkolom")}
      {vlakVeld("quote", "Quote (zonder aanhalingstekens)")}
      {tekstVeld("naam", "Naam bij de quote")}

      {velden.includes("foto") && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className={VELD_LABEL}>Foto</p>
          <Veld label="Wat moet erop (ook de zoekterm in FileFlow)">
            <Input
              value={concept.foto?.wens ?? ""}
              onChange={(e) => setConcept((c) => ({ ...c, foto: { ...c.foto, wens: e.target.value } }))}
              onBlur={() => (concept.foto?.wens ?? "") !== (slide.foto?.wens ?? "") && bewaar({ foto: { wens: concept.foto?.wens?.trim() || null } })}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </Veld>
          {slide.foto?.url ? (
            <div className="relative flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- voorbeeld van de foto */}
              <img src={slide.foto.url} alt="" className="h-20 w-36 object-cover" />
              <div className="relative h-9 flex-1">
                <VervangFoto doel={`slide:${slide.id}`} wens={slide.foto.wens} className="!left-0 !right-auto !top-0" />
              </div>
              <Button type="button" size="sm" variant="ghost" disabled={bezig} onClick={() => bewaar({ foto: { url: null } })}>
                <X /> Weghalen
              </Button>
            </div>
          ) : (
            <AfbeeldingPlek doel={`slide:${slide.id}`} wens={slide.foto?.wens} className="!min-h-0 !p-4" />
          )}
          {velden.includes("fotoBreedte") && (
            <div className="space-y-1">
              <span className={VELD_LABEL}>Breedte van de foto (Beeld 1 t/m 5)</span>
              <div className="flex gap-1">
                {([1, 2, 3, 4, 5] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={bezig}
                    onClick={() => bewaar({ fotoBreedte: n })}
                    className={cn(
                      "h-8 w-10 rounded-md border font-heading text-sm transition-colors",
                      (slide.fotoBreedte ?? 3) === n ? "border-psv-red-primary bg-psv-red-primary text-white" : "border-border hover:border-psv-red-primary"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {dataType && data && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <div className="flex items-center gap-2">
            <p className={VELD_LABEL}>{dataType === "kerngetallen" ? "Kerngetallen" : dataType === "grafiek" ? "Grafiek" : "Tabel"}</p>
            {!dataOpen && (
              <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={() => setDataOpen(true)}>
                Data bewerken
              </Button>
            )}
          </div>
          {dataOpen ? (
            <BlokEditor
              blok={{ type: dataType, id: slide.id, ...data } as Blok}
              bezig={bezig}
              onAnnuleer={() => setDataOpen(false)}
              onOpslaan={(inhoud) => {
                const { type: _t, ...rest } = inhoud as BlokInhoud & Record<string, unknown>;
                void _t;
                bewaar({ [dataType]: rest }).then((ok) => ok && setDataOpen(false));
              }}
            />
          ) : (
            <p className="text-xs text-muted-foreground">Bron: {data.bron === HANDMATIGE_BRON ? `${data.bron} (pas aan als het ergens vandaan komt)` : data.bron}</p>
          )}
          {keuzes.length > 0 && (
            <Veld label="Uitlichten">
              <select
                value={slide.nadruk ?? ""}
                disabled={bezig}
                onChange={(e) => bewaar({ nadruk: e.target.value || null })}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Niets</option>
                {keuzes.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </Veld>
          )}
        </div>
      )}
      {velden.length === 0 && <p className="text-sm text-muted-foreground">Deze slide heeft geen velden.</p>}
    </div>
  );
}

export function SlideBewerker({ stuk, onStuk }: { stuk: Stuk; onStuk: (stuk: Stuk) => void }) {
  const slides = useMemo(() => stuk.slides ?? [], [stuk.slides]);
  const [gekozen, setGekozen] = useState<string | null>(slides[0]?.id ?? null);
  const [toevoegen, setToevoegen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const groot = useSchaal<HTMLDivElement>();

  const index = Math.max(0, slides.findIndex((s) => s.id === gekozen));
  const slide = slides[index];

  useEffect(() => {
    if (slides.length && !slides.some((s) => s.id === gekozen)) setGekozen(slides[Math.min(index, slides.length - 1)].id);
  }, [slides, gekozen, index]);

  async function bewaar(bewerking: Bewerking): Promise<Stuk | null> {
    setFout(null);
    setBezig(true);
    try {
      const res = await fetch(`/api/assistent/stukken/${stuk.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ basisVersie: stuk.versie, ...bewerking }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.stuk) onStuk(data.stuk as Stuk);
      if (!res.ok) {
        setFout(data.error ?? "Opslaan is mislukt.");
        return null;
      }
      return data.stuk as Stuk;
    } catch {
      setFout("Opslaan is mislukt. Probeer het opnieuw.");
      return null;
    } finally {
      setBezig(false);
    }
  }

  const wijzig = (wijziging: Record<string, unknown>) => bewaar({ acties: [{ actie: "slide_wijzigen", slide_id: slide.id, slide: wijziging }] });

  async function voegToe(layout: SlideLayout) {
    setToevoegen(false);
    const voor = new Set(slides.map((s) => s.id));
    const nieuw = await bewaar({ acties: [{ actie: "slide_toevoegen", slide: nieuweSlide(layout), na: slide?.id ?? "einde" }] });
    const toegevoegd = nieuw?.slides?.find((s) => !voor.has(s.id));
    if (toegevoegd) setGekozen(toegevoegd.id);
  }

  async function dupliceer() {
    const { id: _id, ...rest } = slide;
    void _id;
    const voor = new Set(slides.map((s) => s.id));
    const nieuw = await bewaar({ acties: [{ actie: "slide_toevoegen", slide: rest, na: slide.id }] });
    const toegevoegd = nieuw?.slides?.find((s) => !voor.has(s.id));
    if (toegevoegd) setGekozen(toegevoegd.id);
  }

  function verplaats(richting: -1 | 1) {
    const na = richting === -1 ? (index >= 2 ? slides[index - 2].id : "begin") : slides[index + 1].id;
    bewaar({ acties: [{ actie: "slide_verplaatsen", slide_id: slide.id, na }] });
  }

  function verwijder() {
    if (!confirm(`Slide ${index + 1} (${LAYOUT_LABEL[slide.layout]}) verwijderen? Met Vorige zet je hem terug.`)) return;
    bewaar({ acties: [{ actie: "slide_verwijderen", slide_id: slide.id }] });
  }

  if (!slide) return <p className="text-sm text-muted-foreground">Dit deck heeft nog geen slides.</p>;

  return (
    <div className="space-y-4">
      {/* Alle slides klein */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setGekozen(s.id)}
            className={cn(
              "relative flex-shrink-0 rounded-sm p-0.5 text-left outline-none ring-offset-1 transition-shadow focus-visible:ring-2 focus-visible:ring-ring",
              s.id === slide.id ? "ring-2 ring-psv-red-primary" : "hover:ring-1 hover:ring-border"
            )}
            title={`${i + 1}. ${LAYOUT_LABEL[s.layout]}${s.titel ? `: ${s.titel}` : ""}`}
          >
            <Mini slide={s} breedte={136} />
            <span className="absolute bottom-1 left-1 rounded-sm bg-black/70 px-1 font-heading text-[10px] text-white">{i + 1}</span>
            {wachtOpFoto(s) && (
              <span className="absolute right-1 top-1 rounded-sm bg-psv-red-primary p-0.5 text-white" title="Wacht op een foto">
                <ImagePlus className="h-3 w-3" />
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setToevoegen((t) => !t)}
          disabled={bezig}
          className="flex h-[82px] w-[100px] flex-shrink-0 flex-col items-center justify-center gap-1 rounded-sm border-2 border-dashed border-border font-heading text-[11px] uppercase tracking-wide text-muted-foreground transition-colors hover:border-psv-red-primary hover:text-psv-red-primary"
        >
          <Plus className="h-5 w-5" />
          Slide
        </button>
      </div>

      {toevoegen && <LayoutKiezer onKies={voegToe} onSluit={() => setToevoegen(false)} />}
      {fout && <div className="alert alert--error text-sm">{fout}</div>}

      {/* De gekozen slide groot */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-heading text-sm uppercase tracking-wide">Slide {index + 1}</span>
        <select
          value={slide.layout}
          disabled={bezig}
          aria-label="Layout"
          onChange={(e) => wijzig({ layout: e.target.value })}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          {LAYOUTS.map((l) => (
            <option key={l} value={l}>
              {LAYOUT_LABEL[l]}
            </option>
          ))}
        </select>
        {bezig && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <div className="ml-auto flex gap-1">
          <Button type="button" variant="ghost" size="sm" disabled={bezig || index === 0} onClick={() => verplaats(-1)} title="Naar voren">
            <ArrowLeft />
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={bezig || index === slides.length - 1} onClick={() => verplaats(1)} title="Naar achteren">
            <ArrowRight />
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={bezig} onClick={dupliceer} title="Dupliceren">
            <Copy />
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={bezig || slides.length === 1} onClick={verwijder} title="Verwijderen">
            <Trash2 />
          </Button>
        </div>
      </div>
      <div ref={groot.ref}>
        <Schaal schaal={groot.schaal}>
          <SlideInhoud slide={slide} toonLeeg={MET_FOTO.includes(slide.layout)} />
        </Schaal>
      </div>
      <SlideVeldenForm slide={slide} bezig={bezig} bewaar={(w) => wijzig(w)} />
      <p className="text-xs text-muted-foreground">
        Elke wijziging wordt een nieuwe versie; met Vorige ga je terug. Je kunt ook in de chat vragen om een slide aan te passen, bijvoorbeeld
        &quot;maak van slide 4 een quote&quot;.
      </p>
    </div>
  );
}
