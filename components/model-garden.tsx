"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  actiefModel,
  modelNaam,
  type BeschikbaarModel,
  type ModelKeuze,
  type ModelPlek,
} from "@/lib/modellen/config";

/**
 * Beheer > Model garden: per plek zien welk Claude-model er draait, en een
 * ander model kiezen uit wat de API-sleutel kan aanroepen. De regels staan in
 * `lib/modellen/config.ts`; de API controleert de keuze.
 */

interface GardenData {
  plekken: ModelPlek[];
  keuzes: Record<string, ModelKeuze>;
  modellen: BeschikbaarModel[];
  modellenFout: string | null;
  standaardPrijzen: Record<string, { invoer: number; uitvoer: number }>;
}

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

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

function formatMoment(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("nl-NL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatPrijs(prijs?: { invoer: number; uitvoer: number } | null): string {
  if (!prijs) return "prijs onbekend";
  const f = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `${f(prijs.invoer)} / ${f(prijs.uitvoer)} per MTok`;
}

function formatTokens(n: number | null): string {
  if (!n) return "—";
  return n >= 1_000_000 ? `${n / 1_000_000}M` : `${Math.round(n / 1000)}K`;
}

/** De familie voor de sortering en de badge: Fable/Mythos, Opus, Sonnet, Haiku. */
function familie(id: string): string {
  const m = id.match(/^claude-([a-z]+)/);
  return m ? m[1] : "";
}
const FAMILIE_VOLGORDE = ["fable", "mythos", "opus", "sonnet", "haiku"];

/** Waarschuwingen bij een model op een plek: wat de plek niet meer meestuurt, of wat het model eist. */
function opmerkingen(p: ModelPlek, model: string, kenmerken: { effort: boolean; fallbacks: boolean }): string[] {
  const uit: string[] = [];
  if (p.inspanning && !kenmerken.effort) {
    uit.push(`Dit model kent geen effort; de plek stuurt "${p.inspanning}" dan niet mee.`);
  }
  if (p.tools && !kenmerken.fallbacks) {
    uit.push("Geen automatische fallback naar een ander model als dit model een vraag weigert.");
  }
  if (/^claude-(fable|mythos)/.test(model)) {
    uit.push("Fable en Mythos vragen 30 dagen dataretentie in de Anthropic-organisatie, en zijn duurder.");
  }
  return uit;
}

export function ModelGarden() {
  const [data, setData] = useState<GardenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);
  const [rijFout, setRijFout] = useState<{ plek: string; tekst: string } | null>(null);

  async function laad() {
    setLoading(true);
    setFout(null);
    try {
      setData(await api<GardenData>("/api/beheer/modellen"));
    } catch (err) {
      setFout(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    laad();
  }, []);

  async function kies(p: ModelPlek, model: string | null) {
    setBezig(p.id);
    setRijFout(null);
    try {
      setData(
        await api<GardenData>("/api/beheer/modellen", {
          method: "PUT",
          body: JSON.stringify({ plek: p.id, model }),
        })
      );
    } catch (err) {
      setRijFout({ plek: p.id, tekst: err instanceof Error ? err.message : String(err) });
    } finally {
      setBezig(null);
    }
  }

  const modellen = useMemo(() => {
    const lijst = [...(data?.modellen ?? [])];
    return lijst.sort((a, b) => {
      const fa = FAMILIE_VOLGORDE.indexOf(familie(a.id));
      const fb = FAMILIE_VOLGORDE.indexOf(familie(b.id));
      if (fa !== fb) return (fa === -1 ? 99 : fa) - (fb === -1 ? 99 : fb);
      return b.id.localeCompare(a.id, "en", { numeric: true });
    });
  }, [data]);

  const groepen = useMemo(() => {
    const per = new Map<string, ModelPlek[]>();
    for (const p of data?.plekken ?? []) per.set(p.groep, [...(per.get(p.groep) ?? []), p]);
    return [...per.entries()];
  }, [data]);

  /** Hoe vaak elk model nu draait, voor het overzicht. */
  const gebruik = useMemo(() => {
    const telling = new Map<string, string[]>();
    for (const p of data?.plekken ?? []) {
      const { model } = actiefModel(p, data?.keuzes[p.id]);
      telling.set(model, [...(telling.get(model) ?? []), p.naam]);
    }
    return telling;
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Model garden laden…
      </div>
    );
  }
  if (fout && !data) return <div className="alert alert--error">{fout}</div>;
  if (!data) return null;

  const beschikbaar = new Set(modellen.map((m) => m.id));
  const naamVan = (id: string) => modellen.find((m) => m.id === id)?.naam ?? modelNaam(id);
  const prijsVan = (id: string) => modellen.find((m) => m.id === id)?.prijs ?? data.standaardPrijzen[id] ?? null;

  return (
    <div className="space-y-6">
      <div className="alert alert--info">
        Hier zie je per plek in PSV Tools welk Claude-model er draait, en kies je een ander model uit de modellen die
        de API-sleutel van PSV Tools kan aanroepen. Een wijziging is binnen een halve minuut overal actief. De
        beeldmodellen van Groepsfoto en Kleurplaat beheer je daar zelf, via Replicate.
      </div>

      {data.modellenFout && <div className="alert alert--warning">{data.modellenFout}</div>}

      {/* Plekken */}
      {groepen.map(([groep, plekken]) => (
        <Card key={groep} className="p-5 sm:p-6">
          <h2 className="mb-4 font-heading text-xl uppercase tracking-wide">{groep}</h2>
          <div className="divide-y divide-border">
            {plekken.map((p) => {
              const keuze = data.keuzes[p.id];
              const actief = actiefModel(p, keuze);
              const nietMeer = data.modellen.length > 0 && !beschikbaar.has(actief.model);
              const waarschuwingen = opmerkingen(p, actief.model, actief.kenmerken);
              return (
                <div key={p.id} className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[1fr_minmax(0,340px)]">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-heading text-base uppercase tracking-wide">{p.naam}</span>
                      {actief.gekozen ? (
                        <Badge variant="gold">Gewijzigd</Badge>
                      ) : (
                        <Badge variant="outline">Standaard</Badge>
                      )}
                      {p.tools && <Badge variant="info">Tools</Badge>}
                      {p.json && <Badge variant="info">JSON</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {p.beschrijving}
                      {p.href && (
                        <>
                          {" "}
                          <Link href={p.href} className="underline underline-offset-2 hover:text-foreground">
                            Naar de pagina
                          </Link>
                        </>
                      )}
                    </p>
                    <p className="text-sm">
                      <span className="font-mono">{actief.model}</span>
                      <span className="text-muted-foreground"> · {formatPrijs(prijsVan(actief.model))}</span>
                    </p>
                    {keuze && (
                      <p className="text-xs text-muted-foreground">
                        Gekozen door {keuze.gewijzigdDoor}, {formatMoment(keuze.gewijzigdOp)}. Standaard:{" "}
                        <span className="font-mono">{p.standaard}</span>
                      </p>
                    )}
                    {nietMeer && (
                      <p className="form-error">
                        Dit model staat niet (meer) in de lijst van de API. Kies een ander model.
                      </p>
                    )}
                    {waarschuwingen.map((w) => (
                      <p key={w} className="text-xs text-warning">
                        {w}
                      </p>
                    ))}
                    {rijFout?.plek === p.id && <p className="form-error">{rijFout.tekst}</p>}
                  </div>

                  <div className="flex items-start gap-2">
                    <select
                      aria-label={`Model voor ${p.naam}`}
                      className={SELECT_CLASS}
                      value={actief.gekozen ? actief.model : ""}
                      disabled={bezig !== null || modellen.length === 0}
                      onChange={(e) => kies(p, e.target.value || null)}
                    >
                      <option value="">Standaard: {naamVan(p.standaard)}</option>
                      {actief.gekozen && !beschikbaar.has(actief.model) && (
                        <option value={actief.model}>{actief.model}</option>
                      )}
                      {modellen
                        .filter((m) => m.id !== p.standaard)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.naam} · {formatPrijs(m.prijs)}
                          </option>
                        ))}
                    </select>
                    {bezig === p.id ? (
                      <Loader2 className="mt-3 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      actief.gekozen && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="Terug naar het standaardmodel"
                          aria-label={`Zet ${p.naam} terug op het standaardmodel`}
                          disabled={bezig !== null}
                          onClick={() => kies(p, null)}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      {/* Beschikbare modellen */}
      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-heading text-xl uppercase tracking-wide">Beschikbaar via de API</h2>
          <Button type="button" variant="outline" size="sm" onClick={laad} disabled={loading} className="gap-2">
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Vernieuwen
          </Button>
        </div>
        {modellen.length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen modellen opgehaald.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-4 font-heading uppercase tracking-wide">Model</th>
                  <th className="py-2 pr-4 font-heading uppercase tracking-wide">Context</th>
                  <th className="py-2 pr-4 font-heading uppercase tracking-wide">Prijs</th>
                  <th className="py-2 font-heading uppercase tracking-wide">In gebruik</th>
                </tr>
              </thead>
              <tbody>
                {modellen.map((m) => {
                  const plekken = gebruik.get(m.id) ?? [];
                  return (
                    <tr key={m.id} className="border-b border-border last:border-0 align-top">
                      <td className="py-2 pr-4">
                        <div>{m.naam}</div>
                        <div className="font-mono text-xs text-muted-foreground">{m.id}</div>
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">{formatTokens(m.context)}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{formatPrijs(m.prijs)}</td>
                      <td className="py-2 text-muted-foreground">{plekken.length ? plekken.join(", ") : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="form-hint mt-3">Prijzen zijn indicatief (Anthropic API, invoer / uitvoer).</p>
      </Card>
    </div>
  );
}
