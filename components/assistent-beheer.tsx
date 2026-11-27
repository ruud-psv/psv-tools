"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ChevronRight, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CatalogusGroep, CatalogusTool, ToolStatus } from "@/lib/assistent/catalogus";
import { VAARDIGHEID_LIMIETEN, idVan, type Vaardigheid } from "@/lib/assistent/vaardigheden";

/**
 * Beheer > Assistent: welke tools de assistent heeft (eigen tools en die van
 * MCP-servers), en de vaardigheden: instructies van het team die het model
 * leest als een vraag erbij past.
 */

interface Data {
  groepen: CatalogusGroep[];
  mcpFout: string | null;
  vaardigheden: Vaardigheid[];
  paginas: { name: string; href: string }[];
}

interface Concept {
  naam: string;
  wanneer: string;
  instructies: string;
  aan: boolean;
  paginas: string[];
}

const LEEG: Concept = { naam: "", wanneer: "", instructies: "", aan: true, paginas: [] };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Er ging iets mis. Probeer het opnieuw.");
  return data as T;
}

const STATUS: Record<ToolStatus, { label: string; variant: "success" | "secondary" | "warning" | "destructive" }> = {
  aan: { label: "Aan", variant: "success" },
  uit: { label: "Uit", variant: "secondary" },
  "server uit": { label: "Server uit", variant: "secondary" },
  gewijzigd: { label: "Gewijzigd, opnieuw goedkeuren", variant: "warning" },
  geblokkeerd: { label: "Geblokkeerd", variant: "destructive" },
};

function formatMoment(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString("nl-NL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AssistentBeheer() {
  const [data, setData] = useState<Data | null>(null);
  const [laadFout, setLaadFout] = useState<string | null>(null);

  async function laad() {
    setLaadFout(null);
    try {
      setData(await api<Data>("/api/beheer/assistent"));
    } catch (e) {
      setLaadFout(e instanceof Error ? e.message : "Laden mislukt.");
    }
  }
  useEffect(() => {
    laad();
  }, []);

  if (laadFout) {
    return (
      <div className="alert alert--error flex flex-wrap items-center justify-between gap-3">
        {laadFout}
        <Button variant="outline" size="sm" onClick={laad}>
          Opnieuw
        </Button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Laden…
      </div>
    );
  }

  const paginaNaam = Object.fromEntries(data.paginas.map((p) => [p.href, p.name]));
  return (
    <div className="space-y-8">
      <Vaardigheden
        vaardigheden={data.vaardigheden}
        paginas={data.paginas}
        paginaNaam={paginaNaam}
        onWijzig={(vaardigheden) => setData((d) => (d ? { ...d, vaardigheden } : d))}
      />
      <Tools groepen={data.groepen} mcpFout={data.mcpFout} paginaNaam={paginaNaam} />
    </div>
  );
}

/* ---------- Tools ---------- */

function Tools({
  groepen,
  mcpFout,
  paginaNaam,
}: {
  groepen: CatalogusGroep[];
  mcpFout: string | null;
  paginaNaam: Record<string, string>;
}) {
  const [zoek, setZoek] = useState("");
  const gefilterd = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    if (!q) return groepen;
    return groepen
      .map((g) => ({
        ...g,
        tools: g.tools.filter((t) =>
          [t.naam, t.label, t.beschrijving, paginaNaam[t.pagina] ?? t.pagina].some((x) => x.toLowerCase().includes(q))
        ),
      }))
      .filter((g) => g.tools.length > 0);
  }, [groepen, zoek, paginaNaam]);
  const totaal = groepen.reduce((n, g) => n + g.tools.length, 0);
  const aan = groepen.reduce((n, g) => n + g.tools.filter((t) => t.status === "aan").length, 0);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl uppercase">Tools</h2>
          <p className="text-sm text-muted-foreground">
            {aan} van {totaal} tools staan aan. Een collega krijgt een tool alleen als hij de pagina erachter mag zien.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek een tool" className="pl-9" />
        </div>
      </div>
      {mcpFout && <div className="alert alert--warning mb-3">{mcpFout}</div>}
      <div className="space-y-4">
        {gefilterd.map((groep) => (
          <Card key={groep.id} className="p-4 sm:p-5">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-heading text-base uppercase">{groep.titel}</h3>
              <span className="text-xs text-muted-foreground">
                {groep.tools.length} {groep.tools.length === 1 ? "tool" : "tools"}
              </span>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              {groep.uitleg}{" "}
              {groep.mcpServer && (
                <Link href="/dashboard/beheer?tab=mcp" className="text-psv-red-primary hover:underline">
                  Naar MCP Servers
                </Link>
              )}
            </p>
            {groep.tools.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen tools opgehaald.</p>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {groep.tools.map((tool) => (
                  <ToolRij key={tool.naam} tool={tool} paginaNaam={paginaNaam} />
                ))}
              </ul>
            )}
          </Card>
        ))}
        {gefilterd.length === 0 && <p className="text-sm text-muted-foreground">Geen tools gevonden.</p>}
      </div>
    </section>
  );
}

function ToolRij({ tool, paginaNaam }: { tool: CatalogusTool; paginaNaam: Record<string, string> }) {
  const status = STATUS[tool.status];
  return (
    <li>
      <details className="group/tool">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 py-2.5 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-4 w-4 shrink-0 text-psv-red-primary transition-transform group-open/tool:rotate-90" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">{tool.label}</span>
            <code className="block truncate font-mono text-[11px] text-muted-foreground">{tool.naam}</code>
          </span>
          <span className="text-xs text-muted-foreground">{paginaNaam[tool.pagina] ?? tool.pagina}</span>
          <Badge variant={status.variant}>{status.label}</Badge>
        </summary>
        <div className="space-y-2 pb-3 pl-7 text-sm">
          <p className="whitespace-pre-line text-muted-foreground">{tool.beschrijving}</p>
          <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
            <dt className="font-heading uppercase tracking-wide text-muted-foreground">Invoer</dt>
            <dd className="font-mono">{tool.velden.length ? tool.velden.join(", ") : "geen"}</dd>
            {tool.voorwaarde && (
              <>
                <dt className="font-heading uppercase tracking-wide text-muted-foreground">Alleen</dt>
                <dd>{tool.voorwaarde}</dd>
              </>
            )}
            {tool.geenBron && (
              <>
                <dt className="font-heading uppercase tracking-wide text-muted-foreground">Bron</dt>
                <dd>Staat niet onder het antwoord als bron</dd>
              </>
            )}
          </dl>
        </div>
      </details>
    </li>
  );
}

/* ---------- Vaardigheden ---------- */

function Vaardigheden({
  vaardigheden,
  paginas,
  paginaNaam,
  onWijzig,
}: {
  vaardigheden: Vaardigheid[];
  paginas: { name: string; href: string }[];
  paginaNaam: Record<string, string>;
  onWijzig: (vaardigheden: Vaardigheid[]) => void;
}) {
  const [bewerkId, setBewerkId] = useState<string | null>(null);
  const [concept, setConcept] = useState<Concept | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  function begin(v?: Vaardigheid) {
    setFout(null);
    setBewerkId(v?.id ?? null);
    setConcept(v ? { naam: v.naam, wanneer: v.wanneer, instructies: v.instructies, aan: v.aan, paginas: v.paginas } : LEEG);
  }

  async function opslaan(e: FormEvent) {
    e.preventDefault();
    if (!concept) return;
    setBezig("opslaan");
    setFout(null);
    try {
      const uit = await api<{ vaardigheden: Vaardigheid[] }>("/api/beheer/assistent", {
        method: "PUT",
        body: JSON.stringify({ ...concept, ...(bewerkId && { bewerkId }) }),
      });
      onWijzig(uit.vaardigheden);
      setConcept(null);
      setBewerkId(null);
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Opslaan mislukt.");
    } finally {
      setBezig(null);
    }
  }

  async function zetAan(v: Vaardigheid, aan: boolean) {
    setBezig(v.id);
    setFout(null);
    try {
      const uit = await api<{ vaardigheden: Vaardigheid[] }>("/api/beheer/assistent", {
        method: "PATCH",
        body: JSON.stringify({ id: v.id, aan }),
      });
      onWijzig(uit.vaardigheden);
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Opslaan mislukt.");
    } finally {
      setBezig(null);
    }
  }

  async function verwijder(v: Vaardigheid) {
    if (!window.confirm(`Vaardigheid "${v.naam}" verwijderen?`)) return;
    setBezig(v.id);
    setFout(null);
    try {
      const uit = await api<{ vaardigheden: Vaardigheid[] }>(`/api/beheer/assistent?id=${encodeURIComponent(v.id)}`, {
        method: "DELETE",
      });
      onWijzig(uit.vaardigheden);
      if (bewerkId === v.id) setConcept(null);
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Verwijderen mislukt.");
    } finally {
      setBezig(null);
    }
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl uppercase">Vaardigheden</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Instructies van het team voor een soort vraag, zoals een campagne-evaluatie of copy beoordelen. De assistent
            ziet bij elke vraag de naam en wanneer hij geldt, en leest de instructies zelf als een vraag erbij past.
            Een wijziging werkt binnen een minuut.
          </p>
        </div>
        {!concept && (
          <Button onClick={() => begin()} className="font-heading uppercase tracking-wide">
            <Plus /> Vaardigheid toevoegen
          </Button>
        )}
      </div>

      {fout && !concept && <div className="alert alert--error mb-3">{fout}</div>}

      {concept && (
        <Card className="mb-4 p-4 sm:p-5">
          <form onSubmit={opslaan} className="space-y-4">
            <h3 className="font-heading text-base uppercase">{bewerkId ? "Vaardigheid wijzigen" : "Nieuwe vaardigheid"}</h3>
            <div className="form-group">
              <Label htmlFor="v-naam" className="form-label">
                Naam
              </Label>
              <Input
                id="v-naam"
                value={concept.naam}
                maxLength={VAARDIGHEID_LIMIETEN.naam}
                onChange={(e) => setConcept({ ...concept, naam: e.target.value })}
                placeholder="Campagne-evaluatie"
              />
              <p className="form-hint">
                Id voor het model: <code className="font-mono">{bewerkId ?? (idVan(concept.naam) || "…")}</code>
                {bewerkId && " (blijft hetzelfde)"}
              </p>
            </div>
            <div className="form-group">
              <Label htmlFor="v-wanneer" className="form-label">
                Wanneer
              </Label>
              <Textarea
                id="v-wanneer"
                rows={2}
                value={concept.wanneer}
                maxLength={VAARDIGHEID_LIMIETEN.wanneer}
                onChange={(e) => setConcept({ ...concept, wanneer: e.target.value })}
                placeholder="Als iemand vraagt hoe een campagne het heeft gedaan, of om een evaluatie of nabeschouwing."
              />
              <p className="form-hint">Dit ziet de assistent altijd; hierop kiest hij of hij de vaardigheid leest.</p>
            </div>
            <div className="form-group">
              <Label htmlFor="v-instructies" className="form-label">
                Instructies
              </Label>
              <Textarea
                id="v-instructies"
                rows={12}
                value={concept.instructies}
                maxLength={VAARDIGHEID_LIMIETEN.instructies}
                onChange={(e) => setConcept({ ...concept, instructies: e.target.value })}
                className="font-mono text-xs"
                placeholder={"1. Zoek de campagne in alle bronnen op thema en DMID.\n2. Haal per kanaal besteding, bereik en resultaat op.\n3. …"}
              />
              <p className="form-hint">
                {concept.instructies.length.toLocaleString("nl-NL")} van{" "}
                {VAARDIGHEID_LIMIETEN.instructies.toLocaleString("nl-NL")} tekens. Schrijf zoals je een collega uitlegt
                hoe het moet: welke bronnen, welke stappen, hoe het antwoord eruitziet.
              </p>
            </div>
            <div className="form-group">
              <span className="form-label">Voor wie</span>
              <p className="form-hint mb-2">
                Niets aangevinkt: iedereen met de assistent. Anders alleen wie een van deze pagina&apos;s mag zien.
              </p>
              <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2 lg:grid-cols-3">
                {paginas.map((p) => (
                  <label key={p.href} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={concept.paginas.includes(p.href)}
                      onChange={(e) =>
                        setConcept({
                          ...concept,
                          paginas: e.target.checked
                            ? [...concept.paginas, p.href]
                            : concept.paginas.filter((h) => h !== p.href),
                        })
                      }
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={concept.aan}
                onChange={(e) => setConcept({ ...concept, aan: e.target.checked })}
              />
              Aan: de assistent gebruikt deze vaardigheid
            </label>
            {fout && <p className="form-error">{fout}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={bezig === "opslaan"} className="font-heading uppercase tracking-wide">
                {bezig === "opslaan" && <Loader2 className="animate-spin" />}
                Opslaan
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setConcept(null);
                  setFout(null);
                }}
                className="font-heading uppercase tracking-wide"
              >
                Annuleren
              </Button>
            </div>
          </form>
        </Card>
      )}

      {vaardigheden.length === 0 ? (
        !concept && (
          <Card className="p-5 text-sm text-muted-foreground">
            Nog geen vaardigheden. Voeg er een toe voor een soort vraag waarvoor het team een vaste aanpak heeft.
          </Card>
        )
      ) : (
        <div className="space-y-3">
          {vaardigheden.map((v) => (
            <Card key={v.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading text-base uppercase">{v.naam}</h3>
                    <code className="font-mono text-[11px] text-muted-foreground">{v.id}</code>
                    <Badge variant={v.aan ? "success" : "secondary"}>{v.aan ? "Aan" : "Uit"}</Badge>
                  </div>
                  <p className="mt-1 text-sm">{v.wanneer}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {v.paginas.length === 0
                      ? "Voor iedereen met de assistent"
                      : `Alleen voor: ${v.paginas.map((p) => paginaNaam[p] ?? p).join(", ")}`}
                    {" · "}
                    {v.instructies.length.toLocaleString("nl-NL")} tekens
                    {v.bijgewerktOp && ` · bijgewerkt ${formatMoment(v.bijgewerktOp)}`}
                    {v.bijgewerktDoor && ` door ${v.bijgewerktDoor}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <label className="mr-2 flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={v.aan}
                      disabled={bezig !== null}
                      onChange={(e) => zetAan(v, e.target.checked)}
                    />
                    Aan
                  </label>
                  <Button variant="ghost" size="icon" aria-label={`${v.naam} wijzigen`} onClick={() => begin(v)} disabled={bezig !== null}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`${v.naam} verwijderen`} onClick={() => verwijder(v)} disabled={bezig !== null}>
                    {bezig === v.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
