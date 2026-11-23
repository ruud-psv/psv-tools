"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Beeld, Categorie, Volgorde } from "@/lib/fileflow/client";

/**
 * Een foto kiezen uit FileFlow, de beeldbank van PSV. De zoekfunctie van
 * FileFlow is goed, dus het venster draait om één zoekveld: de wens van de
 * assistent staat er al in, je ziet meteen resultaten en past de zoekterm aan.
 * Daarnaast een categorie en "alleen liggend" (voor slides), een raster met
 * thumbnails en rechts een groot voorbeeld met de gegevens van de foto.
 *
 * In een portal naar <body>: de slides zijn geschaald (transform), en een
 * vast venster daarbinnen zou mee schalen.
 */

interface Resultaat {
  beelden: Beeld[];
  totaal: number;
  volgende: number | null;
}

function formatDag(dag?: string): string | undefined {
  if (!dag) return undefined;
  const d = new Date(`${dag}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? dag : d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

const getal = new Intl.NumberFormat("nl-NL");

export function FileflowKiezer({
  wens,
  onKies,
  onSluit,
}: {
  /** De beschrijving van de assistent: de eerste zoekterm. */
  wens?: string;
  onKies: (beeld: Beeld) => void;
  onSluit: () => void;
}) {
  const [zoekterm, setZoekterm] = useState(wens ?? "");
  const [categorie, setCategorie] = useState<number | "">("");
  const [liggend, setLiggend] = useState(false);
  const [volgorde, setVolgorde] = useState<Volgorde>("relevant");
  const [categorieen, setCategorieen] = useState<Categorie[]>([]);
  const [resultaat, setResultaat] = useState<Resultaat | null>(null);
  const [laden, setLaden] = useState(false);
  const [meerLaden, setMeerLaden] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [gekozen, setGekozen] = useState<Beeld | null>(null);
  const invoer = useRef<HTMLInputElement>(null);
  const verzoek = useRef(0);

  const zoek = useCallback(async (term: string, cat: number | "", vg: Volgorde, offset = 0) => {
    const nummer = ++verzoek.current;
    if (offset === 0) setLaden(true);
    else setMeerLaden(true);
    setFout(null);
    try {
      const params = new URLSearchParams({ q: term, offset: String(offset), volgorde: vg });
      if (cat) params.set("categorie", String(cat));
      const res = await fetch(`/api/fileflow/zoeken?${params}`);
      const data = await res.json().catch(() => ({}));
      if (nummer !== verzoek.current) return; // een nieuwere zoekopdracht is onderweg
      if (!res.ok) throw new Error(data.error ?? "Zoeken in FileFlow is mislukt.");
      setResultaat((vorig) =>
        offset === 0 || !vorig ? (data as Resultaat) : { ...data, beelden: [...vorig.beelden, ...(data as Resultaat).beelden] }
      );
      if (offset === 0) setGekozen(null);
    } catch (err) {
      if (nummer === verzoek.current) setFout((err as Error).message);
    } finally {
      if (nummer === verzoek.current) {
        setLaden(false);
        setMeerLaden(false);
      }
    }
  }, []);

  // Zoeken terwijl je typt, met een korte pauze.
  useEffect(() => {
    const t = setTimeout(() => zoek(zoekterm, categorie, volgorde), 350);
    return () => clearTimeout(t);
  }, [zoekterm, categorie, volgorde, zoek]);

  useEffect(() => {
    fetch("/api/fileflow/categorieen")
      .then((r) => (r.ok ? r.json() : { categorieen: [] }))
      .then((d) => setCategorieen((d.categorieen ?? []).filter((c: Categorie) => c.diepte === 0)))
      .catch(() => undefined);
    invoer.current?.select();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onSluit();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onSluit]);

  const beelden = (resultaat?.beelden ?? []).filter((b) => !liggend || !b.breedte || !b.hoogte || b.breedte > b.hoogte);
  const verlopen = gekozen?.verlooptOp ? gekozen.verlooptOp < new Date().toISOString().slice(0, 10) : false;

  const venster = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-6" onClick={onSluit} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Foto zoeken in FileFlow"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full max-h-[880px] w-full max-w-6xl flex-col overflow-hidden rounded-md bg-background text-foreground shadow-psv-lg"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <h2 className="font-heading text-lg uppercase tracking-wide">Foto uit FileFlow</h2>
          <button type="button" onClick={onSluit} aria-label="Sluiten" className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={invoer}
                value={zoekterm}
                onChange={(e) => setZoekterm(e.target.value)}
                placeholder="Zoek op speler, wedstrijd, plek of onderwerp"
                aria-label="Zoeken in FileFlow"
                className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <select
              value={categorie}
              onChange={(e) => setCategorie(e.target.value ? Number(e.target.value) : "")}
              aria-label="Categorie"
              className="h-10 max-w-[220px] rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Alle categorieën</option>
              {categorieen.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.naam}
                </option>
              ))}
            </select>
            <select
              value={volgorde}
              onChange={(e) => setVolgorde(e.target.value as Volgorde)}
              aria-label="Volgorde"
              className="h-10 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="relevant">Meest relevant</option>
              <option value="nieuw">Nieuwste eerst</option>
              <option value="oud">Oudste eerst</option>
            </select>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={liggend} onChange={(e) => setLiggend(e.target.checked)} className="h-4 w-4 accent-primary" />
              Alleen liggend
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Woorden samen zoeken op alles; <code>a | b</code> zoekt op een van beide, <code>&quot;exacte zin&quot;</code> op een zin,{" "}
            <code>-woord</code> sluit uit.
            {resultaat && !laden && <> {getal.format(resultaat.totaal)} {resultaat.totaal === 1 ? "foto" : "foto's"} gevonden.</>}
          </p>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {fout && <div className="alert alert--error mb-3 text-sm">{fout}</div>}
            {laden && !resultaat ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Zoeken…
              </div>
            ) : beelden.length === 0 && !laden ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Geen foto&apos;s gevonden. Probeer een ander woord, bijvoorbeeld alleen de achternaam of de tegenstander.
              </p>
            ) : (
              <>
                <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4", laden && "opacity-50")}>
                  {beelden.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setGekozen(b)}
                      onDoubleClick={() => onKies(b)}
                      title={b.naam}
                      className={cn(
                        "group relative aspect-[4/3] overflow-hidden bg-muted outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring",
                        gekozen?.id === b.id && "ring-4 ring-psv-red-primary"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- presigned thumbnail van FileFlow */}
                      <img src={b.thumb} alt={b.naam} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pb-1 pt-4 text-left text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                        {b.naam}
                        {b.datum && <span className="block text-[10px] text-white/80">{formatDag(b.datum)}</span>}
                      </span>
                      {gekozen?.id === b.id && (
                        <span className="absolute right-1.5 top-1.5 rounded-full bg-psv-red-primary p-1 text-white">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {resultaat?.volgende !== null && resultaat?.volgende !== undefined && (
                  <div className="mt-4 flex justify-center">
                    <Button type="button" variant="outline" size="sm" disabled={meerLaden} onClick={() => zoek(zoekterm, categorie, volgorde, resultaat.volgende!)}>
                      {meerLaden && <Loader2 className="animate-spin" />}
                      Meer foto&apos;s
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          {gekozen && (
            <aside className="hidden w-[320px] flex-shrink-0 flex-col border-l border-border md:flex">
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- presigned voorbeeld van FileFlow */}
                <img src={gekozen.voorbeeld} alt={gekozen.naam} className="w-full bg-muted object-contain" />
                <p className="mt-3 text-sm font-bold">{gekozen.naam}</p>
                <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {gekozen.breedte && gekozen.hoogte && (
                    <div>
                      {gekozen.breedte} × {gekozen.hoogte} px, {gekozen.breedte > gekozen.hoogte ? "liggend" : gekozen.breedte < gekozen.hoogte ? "staand" : "vierkant"}
                    </div>
                  )}
                  {gekozen.datum && <div>Gemaakt op {formatDag(gekozen.datum)}</div>}
                  {gekozen.categorie && <div>Categorie: {gekozen.categorie}</div>}
                  {gekozen.tags.length > 0 && <div>Tags: {gekozen.tags.join(", ")}</div>}
                </dl>
                {gekozen.verlooptOp && (
                  <div className={cn("alert mt-3 text-xs", verlopen ? "alert--error" : "alert--warning")}>
                    <AlertTriangle className="mr-1 inline h-3.5 w-3.5 -translate-y-px" />
                    {verlopen ? "De gebruiksrechten zijn verlopen op " : "Mag gebruikt worden tot en met "}
                    {formatDag(gekozen.verlooptOp)}.
                  </div>
                )}
              </div>
              <div className="border-t border-border p-4">
                <Button type="button" className="w-full" disabled={verlopen} onClick={() => onKies(gekozen)}>
                  <Check /> Gebruik deze foto
                </Button>
              </div>
            </aside>
          )}
        </div>

        {/* Op mobiel staat het voorbeeld niet naast het raster: daar kies je onderaan. */}
        {gekozen && (
          <div className="flex items-center gap-3 border-t border-border p-3 md:hidden">
            <span className="min-w-0 flex-1 truncate text-sm">{gekozen.naam}</span>
            <Button type="button" size="sm" disabled={verlopen} onClick={() => onKies(gekozen)}>
              Gebruik
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(venster, document.body);
}
