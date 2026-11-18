"use client";

import { useEffect, useState } from "react";
import { Link2, Loader2, Printer, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CopyField } from "@/components/copy-field";
import { StukWeergave, formatDag } from "@/components/stuk/stuk-weergave";
import { cn } from "@/lib/utils";
import { STUK_SOORT_LABEL, type Stuk } from "@/lib/stukken/model";

/**
 * Het stuk naast de chat: het voorbeeld, een stap terug, afdrukken en delen.
 * Aanpassen gaat via de chat; de assistent werkt het stuk dan bij.
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

export function StukPaneel({ stuk, onStuk, onSluit, className }: { stuk: Stuk; onStuk: (stuk: Stuk) => void; onSluit?: () => void; className?: string }) {
  const [delen, setDelen] = useState(Boolean(stuk.deellink));
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  // Ander gesprek, ander stuk: het deelvak opnieuw bepalen.
  useEffect(() => setDelen(Boolean(stuk.deellink)), [stuk.id, stuk.deellink]);

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
        <Badge variant="secondary">{STUK_SOORT_LABEL[stuk.soort]}</Badge>
        <span className="text-xs text-muted-foreground">Versie {stuk.versie}</span>
        <div className="ml-auto flex items-center gap-1">
          {stuk.vorige.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={terug} disabled={bezig} title="Terug naar de vorige versie">
              {bezig ? <Loader2 className="animate-spin" /> : <Undo2 />}
              <span className="hidden sm:inline">Vorige</span>
            </Button>
          )}
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
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <StukWeergave stuk={stuk} peildatum={stuk.peildatum} />
        <p className="mt-6 text-center text-xs text-muted-foreground">Aanpassen? Vraag het in de chat, bijvoorbeeld &quot;maak de titel korter&quot;.</p>
      </div>
    </section>
  );
}
