"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, FileText, Link2, Loader2, MessagesSquare, Presentation, Search, Share2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DelenMetCollegas } from "@/components/stuk/delen-met-collegas";
import { cn } from "@/lib/utils";
import { STUK_SOORT_LABEL, type StukSoort } from "@/lib/stukken/model";
import type { GedeeldMet } from "@/lib/stukken/collegas";
import type { MetMijSamenvatting, StukSamenvatting } from "@/lib/stukken/store";

/**
 * Mijn documenten: alle rapporten en slide decks die je met de assistent
 * maakte, zonder ze via een gesprek te zoeken, en wat collega's met je
 * deelden. Een eigen document open je in de chat (om verder te werken) of
 * los (bekijken, presenteren, afdrukken); een gedeeld document alleen los.
 */

type Filter = "alle" | StukSoort;

function wanneer(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" });
}

function SoortIcoon({ soort, className }: { soort: StukSoort; className?: string }) {
  const Icoon = soort === "deck" ? Presentation : FileText;
  return <Icoon className={cn("h-5 w-5 shrink-0", className)} aria-hidden />;
}

function past(titel: string, zoek: string, soort: StukSoort, filter: Filter): boolean {
  if (filter !== "alle" && soort !== filter) return false;
  const termen = zoek.toLowerCase().split(/\s+/).filter(Boolean);
  return termen.every((t) => titel.toLowerCase().includes(t));
}

function Leeg({ children }: { children: React.ReactNode }) {
  return <div className="border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">{children}</div>;
}

function EigenDocument({ doc, onGedeeld }: { doc: StukSamenvatting; onGedeeld: (aantal: number) => void }) {
  const [delen, setDelen] = useState(false);
  const [gedeeldMet, setGedeeldMet] = useState<GedeeldMet[] | null>(null);
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function toggleDelen() {
    const open = !delen;
    setDelen(open);
    if (!open || gedeeldMet) return;
    // De namen staan in het stuk zelf; pas ophalen als je wilt delen.
    setLaden(true);
    setFout(null);
    try {
      const res = await fetch(`/api/assistent/stukken/${doc.id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Het document kon niet worden geladen.");
      setGedeeldMet(data.stuk?.gedeeldMet ?? []);
    } catch (err) {
      setFout((err as Error).message);
    } finally {
      setLaden(false);
    }
  }

  return (
    <li className="border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <SoortIcoon soort={doc.soort} className="text-psv-red-primary" />
        <div className="min-w-0 flex-1">
          <Link href={`/dashboard/assistent?gesprek=${doc.id}`} className="block truncate font-bold hover:text-psv-red-primary">
            {doc.titel}
          </Link>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{STUK_SOORT_LABEL[doc.soort]}</span>
            <span aria-hidden>·</span>
            <span>Bijgewerkt {wanneer(doc.updatedAt)}</span>
            <span aria-hidden>·</span>
            <span>Versie {doc.versie}</span>
            {doc.gedeeld && (
              <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[0.65rem]">
                <Link2 className="h-3 w-3" /> Link
              </Badge>
            )}
            {doc.collegas > 0 && (
              <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[0.65rem]">
                <Users className="h-3 w-3" /> {doc.collegas === 1 ? "1 collega" : `${doc.collegas} collega's`}
              </Badge>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link href={`/dashboard/assistent?gesprek=${doc.id}`} title="Openen in de chat om verder te werken">
              <MessagesSquare />
              <span className="hidden sm:inline">In chat</span>
            </Link>
          </Button>
          <Button type="button" variant="ghost" size="sm" asChild>
            <a href={`/stuk/${doc.id}`} target="_blank" rel="noopener noreferrer" title="Bekijken, presenteren of afdrukken">
              <ExternalLink />
              <span className="hidden sm:inline">Bekijken</span>
            </a>
          </Button>
          <Button type="button" variant={delen ? "outline" : "ghost"} size="sm" onClick={toggleDelen} aria-expanded={delen}>
            <Share2 />
            <span className="hidden sm:inline">Delen</span>
          </Button>
        </div>
      </div>
      {delen && (
        <div className="border-t border-border bg-muted/30 px-4 py-3 text-sm">
          {laden && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {fout && <p className="form-error">{fout}</p>}
          {gedeeldMet && (
            <DelenMetCollegas
              stukId={doc.id}
              gedeeldMet={gedeeldMet}
              onWijziging={(lijst) => {
                setGedeeldMet(lijst);
                onGedeeld(lijst.length);
              }}
            />
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Een link voor buiten PSV Tools maak je in de chat, met Delen boven het document.
          </p>
        </div>
      )}
    </li>
  );
}

function GedeeldDocument({ doc }: { doc: MetMijSamenvatting }) {
  const href = `/stuk/${doc.id}?van=${doc.eigenaarHash}`;
  return (
    <li className="flex flex-wrap items-center gap-3 border border-border bg-card px-4 py-3">
      <SoortIcoon soort={doc.soort} className="text-psv-red-primary" />
      <div className="min-w-0 flex-1">
        <a href={href} target="_blank" rel="noopener noreferrer" className="block truncate font-bold hover:text-psv-red-primary">
          {doc.titel}
        </a>
        <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <span>{STUK_SOORT_LABEL[doc.soort]}</span>
          <span aria-hidden>·</span>
          <span title={doc.eigenaar}>Van {doc.eigenaarNaam ?? doc.eigenaar}</span>
          <span aria-hidden>·</span>
          <span>Gedeeld {wanneer(doc.gedeeldOp)}</span>
          <span aria-hidden>·</span>
          <span>Bijgewerkt {wanneer(doc.updatedAt)}</span>
        </p>
      </div>
      <Button type="button" variant="ghost" size="sm" asChild>
        <a href={href} target="_blank" rel="noopener noreferrer" title="Bekijken, presenteren of afdrukken">
          <ExternalLink />
          <span className="hidden sm:inline">Bekijken</span>
        </a>
      </Button>
    </li>
  );
}

export function MijnDocumenten() {
  const [mijn, setMijn] = useState<StukSamenvatting[]>([]);
  const [metMij, setMetMij] = useState<MetMijSamenvatting[]>([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [zoek, setZoek] = useState("");
  const [filter, setFilter] = useState<Filter>("alle");

  const laad = useCallback(async () => {
    setLaden(true);
    setFout(null);
    try {
      const res = await fetch("/api/assistent/documenten", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "De documenten konden niet worden geladen.");
      setMijn(data.mijn ?? []);
      setMetMij(data.metMij ?? []);
    } catch (err) {
      setFout((err as Error).message);
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => {
    laad();
  }, [laad]);

  const mijnZichtbaar = useMemo(() => mijn.filter((d) => past(d.titel, zoek, d.soort, filter)), [mijn, zoek, filter]);
  const metMijZichtbaar = useMemo(() => metMij.filter((d) => past(d.titel, zoek, d.soort, filter)), [metMij, zoek, filter]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <h1 className="font-heading text-3xl uppercase">Mijn documenten</h1>
        <p className="lead max-w-3xl">
          Alle rapporten en slide decks die je met de assistent maakte, en wat collega&apos;s met je deelden.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op titel" className="pl-9" aria-label="Zoek op titel" />
        </div>
        <div role="radiogroup" aria-label="Soort" className="flex border border-border p-0.5">
          {(["alle", "rapport", "deck"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1 font-heading text-xs uppercase tracking-wide transition-colors",
                filter === f ? "bg-psv-red-primary text-white" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f === "alle" ? "Alle" : STUK_SOORT_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      {fout && (
        <div className="alert alert--error flex flex-wrap items-center justify-between gap-2 text-sm">
          {fout}
          <Button type="button" size="sm" variant="outline" onClick={laad}>
            Opnieuw
          </Button>
        </div>
      )}

      <Tabs defaultValue="mijn">
        <TabsList>
          <TabsTrigger value="mijn" className="font-heading uppercase tracking-wide">
            Door mij gemaakt{!laden && ` (${mijn.length})`}
          </TabsTrigger>
          <TabsTrigger value="met-mij" className="font-heading uppercase tracking-wide">
            Gedeeld met mij{!laden && ` (${metMij.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mijn" className="mt-4">
          {laden ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
          ) : mijn.length === 0 ? (
            <Leeg>
              Je hebt nog geen documenten. Vraag de{" "}
              <Link href="/dashboard/assistent" className="text-psv-red-primary underline">
                assistent
              </Link>{" "}
              om een rapport of slide deck, en het verschijnt hier.
            </Leeg>
          ) : mijnZichtbaar.length === 0 ? (
            <Leeg>Geen documenten die passen bij je zoekopdracht.</Leeg>
          ) : (
            <ul className="space-y-2">
              {mijnZichtbaar.map((doc) => (
                <EigenDocument
                  key={doc.id}
                  doc={doc}
                  onGedeeld={(aantal) => setMijn((lijst) => lijst.map((d) => (d.id === doc.id ? { ...d, collegas: aantal } : d)))}
                />
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="met-mij" className="mt-4">
          {laden ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
          ) : metMij.length === 0 ? (
            <Leeg>Er zijn nog geen documenten met je gedeeld. Deelt een collega een rapport of slide deck met jou, dan staat het hier.</Leeg>
          ) : metMijZichtbaar.length === 0 ? (
            <Leeg>Geen documenten die passen bij je zoekopdracht.</Leeg>
          ) : (
            <ul className="space-y-2">
              {metMijZichtbaar.map((doc) => (
                <GedeeldDocument key={`${doc.eigenaarHash}-${doc.id}`} doc={doc} />
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
