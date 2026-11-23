"use client";

import { useEffect, useState } from "react";
import { Check, Link2, Loader2, Pencil, Printer, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CopyField } from "@/components/copy-field";
import { formatDag } from "@/components/stuk/stuk-weergave";
import { StukVoorbeeld } from "@/components/stuk/deck-weergave";
import { AfbeeldingProvider } from "@/components/stuk/afbeelding";
import { StukBewerker } from "@/components/stuk/stuk-bewerker";
import { SlideBewerker } from "@/components/stuk/slide-bewerker";
import { PresenteerKnop } from "@/components/stuk/presentatie";
import { cn } from "@/lib/utils";
import { STUK_SOORTEN, STUK_SOORT_LABEL, isLegeAfbeelding, type Stuk, type StukSoort } from "@/lib/stukken/model";
import { wachtOpFoto as slideWachtOpFoto } from "@/lib/stukken/deck";

/**
 * Het stuk naast de chat: het voorbeeld, zelf bewerken, een stap terug,
 * afdrukken en delen. Aanpassen kan ook via de chat; de assistent werkt het
 * stuk dan bij.
 */

function vandaag(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}

function plusDagen(dag: string, dagen: number): string {
  const d = new Date(`${dag}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dagen);
  return d.toISOString().slice(0, 10);
}

async function api(url: string, init?: RequestInit): Promise<Stuk> {
  const res = await fetch(url, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Er ging iets mis.");
  return data.stuk as Stuk;
}

function Delen({ stuk, onStuk }: { stuk: Stuk; onStuk: (stuk: Stuk) => void }) {
  const link = stuk.deellink;
  const [open, setOpen] = useState(!link);
  const [publiek, setPubliek] = useState(link?.publiek ?? false);
  const [verlooptOp, setVerlooptOp] = useState(link?.verlooptOp ?? "");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const url = link && typeof window !== "undefined" ? `${window.location.origin}/share/stuk/${link.id}` : "";

  async function deel() {
    setFout(null);
    setBezig(true);
    try {
      onStuk(await api(`/api/assistent/stukken/${stuk.id}/delen`, { method: "POST", body: JSON.stringify({ publiek, verlooptOp }) }));
      setOpen(false);
    } catch (err) {
      setFout((err as Error).message);
    } finally {
      setBezig(false);
    }
  }

  async function trekIn() {
    if (!confirm("Deze link intrekken? Wie hem heeft, kan het stuk dan niet meer openen.")) return;
    setFout(null);
    setBezig(true);
    try {
      onStuk(await api(`/api/assistent/stukken/${stuk.id}/delen`, { method: "DELETE" }));
      setOpen(true);
    } catch (err) {
      setFout((err as Error).message);
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="space-y-3 border-b border-border bg-muted/30 px-4 py-3 text-sm">
      {link && (
        <div className="space-y-2">
          <CopyField label={link.publiek ? `Openbaar tot en met ${formatDag(link.verlooptOp ?? "")}` : "Alleen voor collega's"} value={url} />
          <p className="text-xs text-muted-foreground">
            De link toont versie {link.versie}, gedeeld op {formatDag(link.gedeeldOp.slice(0, 10))}
            {!link.publiek && link.verlooptOp ? `, geldig tot en met ${formatDag(link.verlooptOp)}` : ""}.
          </p>
          {stuk.versie > link.versie && (
            <div className="alert alert--warning text-xs">
              Het stuk is daarna gewijzigd (nu versie {stuk.versie}). Werk de link bij om de nieuwste versie te delen.
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {stuk.versie > link.versie && (
              <Button type="button" size="sm" onClick={deel} disabled={bezig}>
                {bezig && <Loader2 className="animate-spin" />}
                Link bijwerken
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
              Instellingen
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={trekIn} disabled={bezig}>
              Intrekken
            </Button>
          </div>
        </div>
      )}

      {open && (
        <div className="space-y-3">
          <fieldset className="space-y-1.5">
            <legend className="sr-only">Wie mag de link openen</legend>
            {[
              { waarde: false, label: "Alleen collega's", uitleg: "Wie de link opent, logt in met zijn PSV-account." },
              { waarde: true, label: "Openbaar", uitleg: "Iedereen met de link, ook buiten PSV. Alleen met een verloopdatum." },
            ].map((optie) => (
              <label key={String(optie.waarde)} className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="deel-publiek"
                  className="mt-1 h-4 w-4 accent-primary"
                  checked={publiek === optie.waarde}
                  onChange={() => {
                    setPubliek(optie.waarde);
                    if (optie.waarde && !verlooptOp) setVerlooptOp(plusDagen(vandaag(), 30));
                  }}
                />
                <span>
                  <span className="font-heading text-xs uppercase tracking-wide">{optie.label}</span>
                  <span className="block text-xs text-muted-foreground">{optie.uitleg}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="form-group max-w-[14rem]">
            <Label htmlFor="deel-verloopt" className="form-label">
              Geldig tot en met {publiek ? "" : "(optioneel)"}
            </Label>
            <Input id="deel-verloopt" type="date" value={verlooptOp} min={vandaag()} onChange={(e) => setVerlooptOp(e.target.value)} />
          </div>
          <Button type="button" size="sm" onClick={deel} disabled={bezig}>
            {bezig && <Loader2 className="animate-spin" />}
            {link ? "Opslaan" : "Link maken"}
          </Button>
        </div>
      )}
      {fout && <p className="form-error">{fout}</p>}
    </div>
  );
}

export function StukPaneel({
  stuk,
  onStuk,
  onSluit,
  uitgeschakeld = false,
  className,
}: {
  stuk: Stuk;
  onStuk: (stuk: Stuk) => void;
  onSluit?: () => void;
  /** De assistent is bezig: dan niet beginnen met bewerken. */
  uitgeschakeld?: boolean;
  className?: string;
}) {
  const [delen, setDelen] = useState(Boolean(stuk.deellink));
  const [bewerken, setBewerken] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  // Ander gesprek, ander stuk: het deelvak opnieuw bepalen.
  useEffect(() => setDelen(Boolean(stuk.deellink)), [stuk.id, stuk.deellink]);
  useEffect(() => setBewerken(false), [stuk.id]);

  const [uploadVoor, setUploadVoor] = useState<string | null>(null);

  /** Een foto uploaden naar Bunny en in het stuk zetten (een nieuwe versie). */
  function upload(doel: string, bestand: File) {
    if (bestand.size > 4 * 1024 * 1024) return setFout("De foto is te groot. Hooguit 4 MB.");
    const form = new FormData();
    form.append("bestand", bestand);
    stuurFoto(doel, form);
  }

  /** Een foto uit FileFlow: de server haalt hem op, kopieert hem naar Bunny en zet hem in het stuk. */
  function uitFileflow(doel: string, fileflowId: number) {
    const form = new FormData();
    form.append("fileflowId", String(fileflowId));
    stuurFoto(doel, form);
  }

  async function stuurFoto(doel: string, form: FormData) {
    setFout(null);
    setUploadVoor(doel);
    try {
      form.append("doel", doel);
      form.append("basisVersie", String(stuk.versie));
      const res = await fetch(`/api/assistent/stukken/${stuk.id}/afbeelding`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (data.stuk) onStuk(data.stuk as Stuk);
      if (!res.ok) setFout(data.error ?? "De foto kon niet worden toegevoegd.");
    } catch {
      setFout("De foto kon niet worden toegevoegd. Probeer het opnieuw.");
    } finally {
      setUploadVoor(null);
    }
  }

  const isDeck = stuk.soort === "deck" && Boolean(stuk.slides?.length);
  const wachtOpFoto = isDeck
    ? (stuk.slides ?? []).filter(slideWachtOpFoto).length
    : stuk.blokken.filter(isLegeAfbeelding).length + (stuk.titelbeeld?.wens && !stuk.titelbeeld.url ? 1 : 0);

  /** Hetzelfde stuk als rapport of als deck: alleen de soort verandert, de blokken blijven. */
  async function zetSoort(soort: StukSoort) {
    if (soort === stuk.soort) return;
    // Er zijn al slides én een rapport: opnieuw opbouwen of de bestaande slides houden?
    const opnieuw =
      soort === "deck" && Boolean(stuk.slides?.length) && stuk.blokken.length > 0
        ? window.confirm("Er zijn al slides. Wil je ze opnieuw opbouwen uit het rapport? Kies Annuleren om de slides te houden zoals ze waren.")
        : false;
    setFout(null);
    setBezig(true);
    try {
      const res = await fetch(`/api/assistent/stukken/${stuk.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ basisVersie: stuk.versie, soort, ...(opnieuw && { slides_opnieuw: true }) }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.stuk) onStuk(data.stuk as Stuk);
      if (!res.ok) setFout(data.error ?? "Omzetten is mislukt.");
    } catch {
      setFout("Omzetten is mislukt. Probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  async function terug() {
    setFout(null);
    setBezig(true);
    try {
      onStuk(await api(`/api/assistent/stukken/${stuk.id}/terug`, { method: "POST" }));
    } catch (err) {
      setFout((err as Error).message);
    } finally {
      setBezig(false);
    }
  }

  return (
    <section className={cn("flex min-h-0 flex-col bg-card", className)} aria-label="Stuk">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <div role="radiogroup" aria-label="Soort stuk" className="flex rounded-md border border-border p-0.5">
          {STUK_SOORTEN.map((soort) => (
            <button
              key={soort}
              type="button"
              role="radio"
              aria-checked={stuk.soort === soort}
              disabled={bezig || uitgeschakeld}
              onClick={() => zetSoort(soort)}
              title={uitgeschakeld ? "Wacht tot de assistent klaar is" : `Bekijk als ${STUK_SOORT_LABEL[soort].toLowerCase()}`}
              className={cn(
                "rounded px-2 py-0.5 font-heading text-xs uppercase tracking-wide transition-colors disabled:opacity-50",
                stuk.soort === soort ? "bg-psv-red-primary text-white" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {STUK_SOORT_LABEL[soort]}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">Versie {stuk.versie}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant={bewerken ? "default" : "ghost"}
            size="sm"
            onClick={() => setBewerken((b) => !b)}
            disabled={!bewerken && uitgeschakeld}
            title={uitgeschakeld && !bewerken ? "Wacht tot de assistent klaar is" : bewerken ? "Klaar met bewerken" : "Het stuk zelf aanpassen"}
          >
            {bewerken ? <Check /> : <Pencil />}
            <span className="hidden sm:inline">{bewerken ? "Klaar" : "Bewerken"}</span>
          </Button>
          {stuk.vorige.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={terug} disabled={bezig} title="Terug naar de vorige versie">
              {bezig ? <Loader2 className="animate-spin" /> : <Undo2 />}
              <span className="hidden sm:inline">Vorige</span>
            </Button>
          )}
          <PresenteerKnop stuk={stuk} />
          <Button type="button" variant="ghost" size="sm" asChild>
            <a href={`/stuk/${stuk.id}`} target="_blank" rel="noopener noreferrer" title="Afdrukken of opslaan als PDF">
              <Printer />
              <span className="hidden sm:inline">Afdrukken</span>
            </a>
          </Button>
          <Button type="button" variant={delen ? "outline" : "default"} size="sm" onClick={() => setDelen((d) => !d)}>
            <Link2 />
            Delen
          </Button>
          {onSluit && (
            <Button type="button" variant="ghost" size="icon" onClick={onSluit} aria-label="Stuk sluiten">
              <X />
            </Button>
          )}
        </div>
      </div>
      {fout && <p className="form-error px-4 pt-2">{fout}</p>}
      {delen && <Delen stuk={stuk} onStuk={onStuk} />}
      <AfbeeldingProvider acties={{ upload, uitFileflow, bezig: uploadVoor, uit: uitgeschakeld || bezig }}>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {wachtOpFoto > 0 && (
          <div className="alert alert--info mb-4 text-sm">
            {wachtOpFoto === 1 ? "Er wacht 1 plek op een foto." : `Er wachten ${wachtOpFoto} plekken op een foto.`} Upload er een of zoek in FileFlow.
            Lege plekken staan niet op de deellink of de afdruk.
          </div>
        )}
        {bewerken ? (
          isDeck ? <SlideBewerker stuk={stuk} onStuk={onStuk} /> : <StukBewerker stuk={stuk} onStuk={onStuk} />
        ) : (
          <>
            <StukVoorbeeld stuk={stuk} peildatum={stuk.peildatum} />
            <p className="mt-6 text-center text-xs text-muted-foreground">
              Aanpassen? Klik op Bewerken, of vraag het in de chat, bijvoorbeeld &quot;maak de grafiek groter&quot; of &quot;zet de conclusie op zwart&quot;.
            </p>
          </>
        )}
      </div>
      </AfbeeldingProvider>
    </section>
  );
}
