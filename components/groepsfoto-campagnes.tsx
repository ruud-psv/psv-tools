"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Power, Send, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ModelKiezer } from "@/components/replicate/model-kiezer";
import { cn } from "@/lib/utils";
import { AANBEVOLEN_MODELLEN, KLEDING, POSITIES, STANDAARD_MODEL, type Basisfoto } from "@/lib/groepsfoto";
import {
  heeftOngepubliceerdeWijzigingen,
  isGeldigeSlug,
  LIMIET_GRENZEN,
  slugVan,
  STANDAARD_LIMIETEN,
  STANDAARD_ORIGINS,
  type Campagne,
  type CampagneInvoer,
  type CampagneLimieten,
} from "@/lib/groepsfoto/campagne";

function fotoUrl(pad: string): string {
  return `/api/groepsfoto/basisfotos/bestand?pad=${encodeURIComponent(pad)}`;
}

function datum(iso: string): string {
  return new Date(iso).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" });
}

async function vraag<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Er ging iets mis (HTTP ${res.status}).`);
  return body;
}

interface Formulier {
  nieuw: boolean;
  slugAangepast: boolean;
  slug: string;
  naam: string;
  basisfotoId: string;
  model: string;
  posities: string[];
  kleding: string[];
  limieten: Record<keyof CampagneLimieten, string>;
  origins: string;
}

function leegFormulier(basisfotos: Basisfoto[]): Formulier {
  return {
    nieuw: true,
    slugAangepast: false,
    slug: "",
    naam: "",
    basisfotoId: basisfotos[0]?.id ?? "",
    model: STANDAARD_MODEL,
    posities: ["automatisch"],
    kleding: KLEDING.map((k) => k.waarde),
    limieten: {
      perIpPerUur: String(STANDAARD_LIMIETEN.perIpPerUur),
      perDag: String(STANDAARD_LIMIETEN.perDag),
      perAccount: String(STANDAARD_LIMIETEN.perAccount),
    },
    origins: STANDAARD_ORIGINS.join("\n"),
  };
}

function formulierVan(c: Campagne): Formulier {
  return {
    nieuw: false,
    slugAangepast: true,
    slug: c.slug,
    naam: c.naam,
    basisfotoId: c.basisfotoId,
    model: c.model,
    posities: [...c.posities],
    kleding: [...c.kleding],
    limieten: {
      perIpPerUur: String(c.limieten.perIpPerUur),
      perDag: String(c.limieten.perDag),
      perAccount: String(c.limieten.perAccount),
    },
    origins: c.origins.join("\n"),
  };
}

function wissel(lijst: string[], waarde: string): string[] {
  return lijst.includes(waarde) ? lijst.filter((w) => w !== waarde) : [...lijst, waarde];
}

/**
 * Beheer van de groepsfoto-campagnes voor Playable. Hier stel je een campagne
 * in en publiceer je hem naar de privé opslag op Bunny; het script daar doet
 * de rest. Zie `docs/groepsfoto-campagne.md`.
 */
export function GroepsfotoCampagnes() {
  const [campagnes, setCampagnes] = useState<Campagne[]>([]);
  const [basisfotos, setBasisfotos] = useState<Basisfoto[]>([]);
  const [bunnyMelding, setBunnyMelding] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState("");

  const [formulier, setFormulier] = useState<Formulier | null>(null);
  const [opslaanBezig, setOpslaanBezig] = useState(false);
  const [formulierFout, setFormulierFout] = useState("");

  /** De slug van de campagne waar een actie op loopt. */
  const [actie, setActie] = useState<string | null>(null);
  const [melding, setMelding] = useState("");

  const laad = useCallback(async () => {
    setFout("");
    try {
      const [c, b] = await Promise.all([
        vraag<{ campagnes: Campagne[]; bunnyMelding: string | null }>("/api/groepsfoto/campagnes"),
        vraag<{ basisfotos: Basisfoto[] }>("/api/groepsfoto/basisfotos"),
      ]);
      setCampagnes(c.campagnes);
      setBunnyMelding(c.bunnyMelding);
      setBasisfotos(b.basisfotos);
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Laden mislukt.");
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => {
    void laad();
  }, [laad]);

  function vervang(campagne: Campagne) {
    setCampagnes((lijst) => {
      const rest = lijst.filter((c) => c.slug !== campagne.slug);
      return [campagne, ...rest].sort((a, b) => b.gewijzigdOp.localeCompare(a.gewijzigdOp));
    });
  }

  async function opslaan() {
    if (!formulier) return;
    setOpslaanBezig(true);
    setFormulierFout("");
    const invoer: CampagneInvoer & { nieuw: boolean } = {
      nieuw: formulier.nieuw,
      slug: formulier.slug,
      naam: formulier.naam,
      basisfotoId: formulier.basisfotoId,
      model: formulier.model,
      posities: formulier.posities as CampagneInvoer["posities"],
      kleding: formulier.kleding as CampagneInvoer["kleding"],
      limieten: {
        perIpPerUur: Number(formulier.limieten.perIpPerUur),
        perDag: Number(formulier.limieten.perDag),
        perAccount: Number(formulier.limieten.perAccount),
      },
      origins: formulier.origins.split(/[\s,]+/).filter(Boolean),
    };
    try {
      const { campagne } = await vraag<{ campagne: Campagne }>("/api/groepsfoto/campagnes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoer),
      });
      vervang(campagne);
      setFormulier(null);
      setMelding(`"${campagne.naam}" is opgeslagen. Publiceer hem om de wijzigingen op Bunny te zetten.`);
    } catch (err) {
      setFormulierFout(err instanceof Error ? err.message : "Opslaan mislukt.");
    } finally {
      setOpslaanBezig(false);
    }
  }

  async function doeActie(campagne: Campagne, wat: "publiceer" | "aan" | "uit" | "verwijder") {
    if (wat === "verwijder") {
      const tekst = campagne.gepubliceerd
        ? `"${campagne.naam}" verwijderen? Hij gaat ook van Bunny af, dus de actie op Playable stopt meteen.`
        : `"${campagne.naam}" verwijderen?`;
      if (!window.confirm(tekst)) return;
    }
    if (wat === "uit" && !window.confirm(`"${campagne.naam}" uitzetten? Bezoekers kunnen dan geen foto meer maken.`)) {
      return;
    }

    setActie(campagne.slug);
    setFout("");
    setMelding("");
    try {
      if (wat === "publiceer") {
        const r = await vraag<{ campagne: Campagne }>("/api/groepsfoto/campagnes/publiceer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: campagne.slug }),
        });
        vervang(r.campagne);
        setMelding(
          r.campagne.actief
            ? `"${campagne.naam}" staat op Bunny en is aan.`
            : `"${campagne.naam}" staat op Bunny, maar is nog uit. Zet hem aan als de pagina klaar is.`
        );
      } else if (wat === "verwijder") {
        await vraag("/api/groepsfoto/campagnes?slug=" + encodeURIComponent(campagne.slug), { method: "DELETE" });
        setCampagnes((lijst) => lijst.filter((c) => c.slug !== campagne.slug));
        setMelding(`"${campagne.naam}" is verwijderd.`);
      } else {
        const r = await vraag<{ campagne: Campagne }>("/api/groepsfoto/campagnes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: campagne.slug, actief: wat === "aan" }),
        });
        vervang(r.campagne);
        setMelding(`"${campagne.naam}" staat nu ${wat}.`);
      }
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Er ging iets mis.");
    } finally {
      setActie(null);
    }
  }

  if (laden) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Campagnes laden…
      </div>
    );
  }

  const fotoVan = (id: string) => basisfotos.find((b) => b.id === id);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="text-lg">Campagnes voor Playable</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Een campagne legt vast welke foto, welk model en welke keuzes fans op een Playable-pagina krijgen, en
              hoeveel foto&apos;s er gemaakt mogen worden. Bij publiceren zet PSV Tools de instellingen en de foto in
              een afgeschermde opslag op Bunny. Fans praten alleen met Bunny, nooit met PSV Tools. Er is geen vrij
              tekstveld.
            </p>
          </div>
          {!formulier && (
            <Button
              onClick={() => {
                setFormulier(leegFormulier(basisfotos));
                setFormulierFout("");
              }}
              disabled={basisfotos.length === 0}
            >
              <Plus /> Nieuwe campagne
            </Button>
          )}
        </div>
        {basisfotos.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Voeg eerst een foto toe op het tabblad Maken.
          </p>
        )}
        {bunnyMelding && (
          <p className="mt-3 rounded-md bg-warning-bg p-3 text-sm text-warning">{bunnyMelding}</p>
        )}
        {melding && <p className="mt-3 text-sm text-success">{melding}</p>}
        {fout && <p className="mt-3 text-sm text-destructive">{fout}</p>}
      </section>

      {formulier && (
        <section className="space-y-5 rounded-lg border border-border bg-card p-4 shadow-card">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg">{formulier.nieuw ? "Nieuwe campagne" : `${formulier.naam} bewerken`}</h2>
            <button
              type="button"
              onClick={() => setFormulier(null)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Sluiten"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="campagne-naam">Naam</Label>
              <Input
                id="campagne-naam"
                maxLength={80}
                placeholder="Kerst 2026"
                value={formulier.naam}
                onChange={(e) => {
                  const naam = e.target.value;
                  setFormulier((f) =>
                    f && { ...f, naam, slug: f.nieuw && !f.slugAangepast ? slugVan(naam) : f.slug }
                  );
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campagne-slug">Sleutel</Label>
              <Input
                id="campagne-slug"
                maxLength={40}
                disabled={!formulier.nieuw}
                value={formulier.slug}
                onChange={(e) =>
                  setFormulier((f) => f && { ...f, slug: e.target.value.toLowerCase(), slugAangepast: true })
                }
              />
              <p className="text-xs text-muted-foreground">
                {formulier.nieuw
                  ? "Staat in de code van de Playable-pagina en is daarna niet meer te wijzigen."
                  : "Niet meer te wijzigen: de Playable-pagina verwijst ernaar."}
                {formulier.nieuw && formulier.slug && !isGeldigeSlug(formulier.slug) && (
                  <span className="text-destructive"> Alleen kleine letters, cijfers en streepjes.</span>
                )}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-heading text-sm uppercase tracking-wide">Foto</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {basisfotos.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setFormulier((f) => f && { ...f, basisfotoId: b.id })}
                  className={cn(
                    "overflow-hidden rounded-md border-2 text-left",
                    formulier.basisfotoId === b.id ? "border-primary" : "border-transparent hover:border-border"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fotoUrl(b.pad)} alt="" className="aspect-[4/3] w-full object-cover" />
                  <span className="block truncate px-1 py-0.5 text-xs">{b.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              De hints bij de foto (welke speler, welke kleding) gaan mee in de prompt. Pas je die aan op het tabblad
              Maken, publiceer de campagne dan opnieuw.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="space-y-2">
              <legend className="mb-1 font-heading text-sm uppercase tracking-wide">Posities die fans kunnen kiezen</legend>
              {POSITIES.map((p) => (
                <label key={p.waarde} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formulier.posities.includes(p.waarde)}
                    onChange={() => setFormulier((f) => f && { ...f, posities: wissel(f.posities, p.waarde) })}
                  />
                  {p.label}
                </label>
              ))}
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="mb-1 font-heading text-sm uppercase tracking-wide">Kleding die fans kunnen kiezen</legend>
              {KLEDING.map((k) => (
                <label key={k.waarde} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formulier.kleding.includes(k.waarde)}
                    onChange={() => setFormulier((f) => f && { ...f, kleding: wissel(f.kleding, k.waarde) })}
                  />
                  {k.label}
                </label>
              ))}
            </fieldset>
          </div>

          <ModelKiezer
            apiBasis="/api/groepsfoto"
            aanbevolen={AANBEVOLEN_MODELLEN}
            standaard={STANDAARD_MODEL}
            waarde={formulier.model}
            onChange={(model) => setFormulier((f) => f && { ...f, model })}
          />

          <div className="space-y-2">
            <p className="font-heading text-sm uppercase tracking-wide">Limieten</p>
            <div className="grid gap-4 sm:grid-cols-3">
              {(Object.keys(LIMIET_GRENZEN) as (keyof CampagneLimieten)[]).map((sleutel) => (
                <div key={sleutel} className="space-y-1">
                  <Label htmlFor={`limiet-${sleutel}`} className="text-xs">
                    {LIMIET_GRENZEN[sleutel].label}
                  </Label>
                  <Input
                    id={`limiet-${sleutel}`}
                    type="number"
                    min={LIMIET_GRENZEN[sleutel].min}
                    max={LIMIET_GRENZEN[sleutel].max}
                    value={formulier.limieten[sleutel]}
                    onChange={(e) =>
                      setFormulier(
                        (f) => f && { ...f, limieten: { ...f.limieten, [sleutel]: e.target.value } }
                      )
                    }
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Een foto kost ongeveer $0,04 (Nano Banana). De limiet per account werkt pas als de controle van het
              Mijn PSV-token er is. Zet in Replicate ook een bestedingslimiet op de sleutel van de campagnes.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="campagne-origins">Pagina&apos;s die het script mogen aanroepen</Label>
            <Textarea
              id="campagne-origins"
              rows={2}
              value={formulier.origins}
              onChange={(e) => setFormulier((f) => f && { ...f, origins: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Eén adres per regel, zonder pad.</p>
          </div>

          {formulierFout && <p className="text-sm text-destructive">{formulierFout}</p>}

          <div className="flex gap-2">
            <Button onClick={() => void opslaan()} disabled={opslaanBezig}>
              {opslaanBezig && <Loader2 className="animate-spin" />} Opslaan
            </Button>
            <Button variant="outline" onClick={() => setFormulier(null)}>
              Annuleren
            </Button>
          </div>
        </section>
      )}

      {campagnes.length === 0 && !formulier && (
        <p className="text-sm text-muted-foreground">Er zijn nog geen campagnes.</p>
      )}

      {campagnes.map((c) => {
        const foto = fotoVan(c.basisfotoId);
        const bezig = actie === c.slug;
        const ongepubliceerd = heeftOngepubliceerdeWijzigingen(c);
        return (
          <section key={c.slug} className="rounded-lg border border-border bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-start gap-4">
              {foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fotoUrl(foto.pad)} alt="" className="h-20 w-28 rounded-md object-cover" />
              ) : (
                <div className="flex h-20 w-28 items-center justify-center rounded-md bg-muted p-2 text-center text-xs text-muted-foreground">
                  Foto niet meer in de bibliotheek
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base">{c.naam}</h3>
                  {!c.gepubliceerd ? (
                    <Badge variant="outline">Niet gepubliceerd</Badge>
                  ) : c.actief ? (
                    <Badge variant="success">Aan</Badge>
                  ) : (
                    <Badge variant="secondary">Uit</Badge>
                  )}
                  {c.gepubliceerd && ongepubliceerd && <Badge variant="warning">Wijzigingen niet gepubliceerd</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  Sleutel <code className="rounded bg-muted px-1">{c.slug}</code> · {c.model} · max. {c.limieten.perDag}{" "}
                  per dag, {c.limieten.perIpPerUur} per IP per uur
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.gepubliceerd
                    ? `Gepubliceerd op ${datum(c.gepubliceerd.op)}`
                    : `Aangemaakt op ${datum(c.aangemaaktOp)}`}
                  {` · laatst gewijzigd op ${datum(c.gewijzigdOp)}`}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => void doeActie(c, "publiceer")}
                disabled={bezig || !!bunnyMelding || !foto}
              >
                {bezig ? <Loader2 className="animate-spin" /> : <Send />}
                {c.gepubliceerd ? "Opnieuw publiceren" : "Publiceren"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void doeActie(c, c.actief ? "uit" : "aan")}
                disabled={bezig || (!!c.gepubliceerd && !!bunnyMelding)}
              >
                <Power /> {c.actief ? "Uitzetten" : "Aanzetten"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setFormulier(formulierVan(c));
                  setFormulierFout("");
                }}
                disabled={bezig}
              >
                <Pencil /> Bewerken
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void doeActie(c, "verwijder")}
                disabled={bezig || (!!c.gepubliceerd && !!bunnyMelding)}
              >
                <Trash2 /> Verwijderen
              </Button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
