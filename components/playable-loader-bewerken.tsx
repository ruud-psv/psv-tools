"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  ImageIcon,
  Link2,
  Loader2,
  Pencil,
  SquareDashed,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EDITOR_MAP, MAX_UPLOAD_BYTES, isAfbeelding } from "@/lib/playable-loader/bunny";
import type { BewerkKeuze, Kan, Mogelijkheden, Plek } from "@/lib/playable-loader/bewerken";
import { cn } from "@/lib/utils";

/**
 * Zelf bewerken in het voorbeeld van de Playable loader: de werkbalk bij het
 * aangeklikte onderdeel, en de vensters voor een andere foto en een link.
 * De bewerkingen zelf staan in `lib/playable-loader/bewerken.ts`.
 */

/** Zet een bestand op Bunny in `playable/editor/` en geeft het adres terug. */
export async function uploadNaarBunny(campaignId: number, bestand: File): Promise<{ url: string; naam: string }> {
  if (bestand.size > MAX_UPLOAD_BYTES) throw new Error("Het bestand is groter dan 4 MB. Maak het kleiner en probeer het opnieuw.");
  const form = new FormData();
  form.append("campaignId", String(campaignId));
  form.append("file", bestand);
  const res = await fetch("/api/playable-loader/upload", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({ error: `Onverwacht antwoord (${res.status}).` }))) as {
    url?: string;
    naam?: string;
    error?: string;
  };
  if (!res.ok || !data.url) throw new Error(data.error ?? `Uploaden mislukt (${res.status}).`);
  return { url: data.url, naam: data.naam ?? bestand.name };
}

/* ---------- De werkbalk ---------- */

export type BewerkActie = "tekst" | "foto" | "link" | "omhoog" | "omlaag" | "dupliceren" | "verwijderen" | "ouder";

const BALK_HOOGTE = 36;

function BalkKnop({
  label,
  kan,
  onClick,
  onWeiger,
  children,
}: {
  label: string;
  /** null: het kan; anders de reden waarom niet. */
  kan: Kan;
  onClick: () => void;
  onWeiger: (reden: string) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={kan !== null || undefined}
      title={kan ?? label}
      onClick={() => (kan === null ? onClick() : onWeiger(kan))}
      className={cn(
        "flex h-8 w-8 items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
        kan === null ? "hover:bg-primary" : "cursor-not-allowed opacity-40"
      )}
    >
      {children}
    </button>
  );
}

/**
 * De werkbalk zweeft boven het aangeklikte onderdeel (of erin, als er boven
 * geen ruimte is), in de coördinaten van het verkleinde voorbeeld.
 */
export function BewerkBalk({
  keuze,
  plek,
  kan,
  schaal,
  breedte,
  hoogte,
  tekstBezig,
  melding,
  onActie,
  onMelding,
  onTekstStop,
  onTekstWacht,
  onSluit,
}: {
  keuze: BewerkKeuze;
  /** Waar het onderdeel nu staat; verandert bij scrollen. */
  plek: Plek;
  kan: Mogelijkheden;
  schaal: number;
  breedte: number;
  hoogte: number;
  tekstBezig: boolean;
  melding: string | null;
  onActie: (actie: BewerkActie) => void;
  onMelding: (melding: string | null) => void;
  onTekstStop: (bewaar: boolean) => void;
  onTekstWacht: () => void;
  onSluit: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [eigenBreedte, setEigenBreedte] = useState(0);

  useLayoutEffect(() => {
    setEigenBreedte(ref.current?.offsetWidth ?? 0);
  });

  const x = plek.x * schaal;
  const y = plek.y * schaal;
  const h = plek.h * schaal;
  if (y + h < 0 || y > hoogte) return null;
  const top = y - BALK_HOOGTE - 4 >= 0 ? y - BALK_HOOGTE - 4 : Math.max(4, Math.min(y + 4, hoogte - BALK_HOOGTE - 4));
  const left = Math.max(4, Math.min(x, breedte - eigenBreedte - 4));

  return (
    <div
      ref={ref}
      className="absolute z-20 max-w-[calc(100%_-_0.5rem)] border-l-4 border-primary bg-psv-neutralDark text-white shadow-card"
      style={{ top, left }}
      // Annuleren moet aankomen voordat het voorbeeld de tekst bewaart omdat hij de focus verloor.
      onPointerDown={tekstBezig ? onTekstWacht : undefined}
      role="toolbar"
      aria-label={`Bewerken: ${keuze.naam}`}
    >
      <div className="flex items-center">
        {tekstBezig ? (
          <>
            <span className="px-2 text-xs">Enter bewaart, Esc annuleert</span>
            <BalkKnop label="Tekst bewaren" kan={null} onClick={() => onTekstStop(true)} onWeiger={onMelding}>
              <Check className="h-4 w-4" />
            </BalkKnop>
            <BalkKnop label="Annuleren" kan={null} onClick={() => onTekstStop(false)} onWeiger={onMelding}>
              <X className="h-4 w-4" />
            </BalkKnop>
          </>
        ) : (
          <>
            <span className="hidden max-w-[10rem] truncate px-2 font-mono text-xs text-white/70 sm:inline" title={keuze.naam}>
              {keuze.naam}
            </span>
            {kan.tekst !== undefined && (
              <BalkKnop label="Tekst aanpassen" kan={kan.tekst} onClick={() => onActie("tekst")} onWeiger={onMelding}>
                <Pencil className="h-4 w-4" />
              </BalkKnop>
            )}
            {kan.foto && (
              <BalkKnop label="Andere foto" kan={kan.foto.kan} onClick={() => onActie("foto")} onWeiger={onMelding}>
                <ImageIcon className="h-4 w-4" />
              </BalkKnop>
            )}
            {kan.link && (
              <BalkKnop label="Link aanpassen" kan={kan.link.kan} onClick={() => onActie("link")} onWeiger={onMelding}>
                <Link2 className="h-4 w-4" />
              </BalkKnop>
            )}
            <span className="mx-0.5 h-5 w-px bg-white/20" aria-hidden="true" />
            <BalkKnop label="Omhoog" kan={kan.omhoog} onClick={() => onActie("omhoog")} onWeiger={onMelding}>
              <ArrowUp className="h-4 w-4" />
            </BalkKnop>
            <BalkKnop label="Omlaag" kan={kan.omlaag} onClick={() => onActie("omlaag")} onWeiger={onMelding}>
              <ArrowDown className="h-4 w-4" />
            </BalkKnop>
            <BalkKnop label="Dupliceren" kan={kan.dupliceren} onClick={() => onActie("dupliceren")} onWeiger={onMelding}>
              <Copy className="h-4 w-4" />
            </BalkKnop>
            <BalkKnop label="Verwijderen" kan={kan.verwijderen} onClick={() => onActie("verwijderen")} onWeiger={onMelding}>
              <Trash2 className="h-4 w-4" />
            </BalkKnop>
            <BalkKnop
              label="Het blok eromheen kiezen"
              kan={keuze.ouder ? null : "Er is geen groter blok om dit onderdeel heen."}
              onClick={() => onActie("ouder")}
              onWeiger={onMelding}
            >
              <SquareDashed className="h-4 w-4" />
            </BalkKnop>
            <BalkKnop label="Niets kiezen" kan={null} onClick={onSluit} onWeiger={onMelding}>
              <X className="h-4 w-4" />
            </BalkKnop>
          </>
        )}
      </div>
      {melding && (
        <p role="status" className="max-w-xs border-t border-white/20 px-2 py-1.5 text-xs">
          {melding}
        </p>
      )}
    </div>
  );
}

/* ---------- Vensters ---------- */

function Venster({ titel, onSluit, children }: { titel: string; onSluit: () => void; children: ReactNode }) {
  const titelId = useId();
  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onSluit();
      }
    };
    window.addEventListener("keydown", toets, true);
    return () => window.removeEventListener("keydown", toets, true);
  }, [onSluit]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-psv-neutralDark/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onSluit()}
    >
      <Card role="dialog" aria-modal="true" aria-labelledby={titelId} className="max-h-full w-full max-w-lg space-y-4 overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titelId} className="text-xl">
            {titel}
          </h2>
          <button
            type="button"
            onClick={onSluit}
            aria-label="Sluiten"
            className="text-muted-foreground transition-colors hover:text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </Card>
    </div>
  );
}

/** Een andere foto: uploaden naar Bunny of een adres plakken. */
export function FotoVenster({
  campaignId,
  huidig,
  soort,
  alt,
  onSluit,
  onKies,
}: {
  campaignId: number;
  /** Het adres van de foto die er nu staat, om te tonen. */
  huidig: string;
  soort: "img" | "achtergrond";
  /** De alt-tekst die er nu staat (alleen bij een `<img>`). */
  alt: string | null;
  onSluit: () => void;
  onKies: (src: string, alt?: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [altTekst, setAltTekst] = useState(alt ?? "");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [sleept, setSleept] = useState(false);
  const bestandVeld = useRef<HTMLInputElement>(null);
  const id = useId();

  async function upload(bestand: File | undefined) {
    if (!bestand) return;
    if (!isAfbeelding(bestand.name)) {
      setFout("Kies een foto: jpg, png, webp, avif, gif of svg.");
      return;
    }
    setBezig(true);
    setFout(null);
    try {
      setUrl((await uploadNaarBunny(campaignId, bestand)).url);
    } catch (err) {
      setFout(err instanceof Error ? err.message : String(err));
    } finally {
      setBezig(false);
      if (bestandVeld.current) bestandVeld.current.value = "";
    }
  }

  const nieuw = url.trim();
  const veilig = !/^\s*javascript:/i.test(nieuw);

  return (
    <Venster titel={soort === "img" ? "Andere foto" : "Andere achtergrond"} onSluit={onSluit}>
      <div
        className={cn(
          "relative flex h-48 items-center justify-center overflow-hidden border border-dashed bg-muted",
          sleept ? "border-primary" : "border-border"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setSleept(true);
        }}
        onDragLeave={() => setSleept(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSleept(false);
          upload(e.dataTransfer.files[0]);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={nieuw || huidig} alt="" className="max-h-full max-w-full object-contain" />
        {bezig && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/80 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Uploaden naar Bunny…
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <input
          ref={bestandVeld}
          type="file"
          accept="image/*,.svg"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => upload(e.target.files?.[0])}
        />
        <Button type="button" variant="outline" onClick={() => bestandVeld.current?.click()} disabled={bezig}>
          <Upload />
          Foto uploaden
        </Button>
        <p className="form-hint !mt-0">
          Of sleep een foto op het vak hierboven. Hij komt op Bunny in {EDITOR_MAP}; hooguit 4 MB.
        </p>
      </div>

      <div>
        <label htmlFor={`${id}-url`} className="form-label">
          Of plak een adres
        </label>
        <Input
          id={`${id}-url`}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://psveindhoven.b-cdn.net/playable/…"
          autoComplete="off"
        />
      </div>

      {soort === "img" && (
        <div>
          <label htmlFor={`${id}-alt`} className="form-label">
            Beschrijving (alt-tekst)
          </label>
          <Input id={`${id}-alt`} value={altTekst} onChange={(e) => setAltTekst(e.target.value)} />
          <p className="form-hint">Wat staat er op de foto? Laat hem leeg bij een foto die alleen sfeer geeft.</p>
        </div>
      )}

      {fout && <p className="form-error">{fout}</p>}
      {!veilig && <p className="form-error">Dit adres kan niet.</p>}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onSluit}>
          Annuleren
        </Button>
        <Button
          type="button"
          disabled={!nieuw || !veilig || bezig}
          onClick={() => onKies(nieuw, soort === "img" ? altTekst.trim() : undefined)}
        >
          <Check />
          Foto gebruiken
        </Button>
      </div>
    </Venster>
  );
}

/** Een ander adres voor een link of knop. */
export function LinkVenster({
  href,
  nieuwTabblad,
  onSluit,
  onKies,
}: {
  href: string;
  nieuwTabblad: boolean;
  onSluit: () => void;
  onKies: (href: string, nieuwTabblad: boolean) => void;
}) {
  const [adres, setAdres] = useState(href);
  const [tabblad, setTabblad] = useState(nieuwTabblad);
  const id = useId();
  const schoon = adres.trim();
  const fout = /^\s*(javascript|data|vbscript):/i.test(schoon) ? "Dit adres kan niet." : null;

  return (
    <Venster titel="Link aanpassen" onSluit={onSluit}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (schoon && !fout) onKies(schoon, tabblad);
        }}
      >
        <div>
          <label htmlFor={`${id}-href`} className="form-label">
            Adres
          </label>
          <Input
            id={`${id}-href`}
            value={adres}
            onChange={(e) => setAdres(e.target.value)}
            placeholder="https://www.psv.nl/…"
            autoComplete="off"
            autoFocus
          />
          <p className="form-hint">
            Een volledig adres, of #naam voor een plek verderop op de pagina.
          </p>
          {fout && <p className="form-error">{fout}</p>}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={tabblad}
            onChange={(e) => setTabblad(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Openen in een nieuw tabblad
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onSluit}>
            Annuleren
          </Button>
          <Button type="submit" disabled={!schoon || !!fout}>
            <Check />
            Opslaan
          </Button>
        </div>
      </form>
    </Venster>
  );
}

