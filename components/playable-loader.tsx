"use client";

import { useState } from "react";
import { Check, Copy, FolderOpen, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import type { PageSource } from "@/lib/playable-loader/bundle";
import type { PublishedPage } from "@/lib/playable-loader/store";

/**
 * Playable loader (beta, test): de pagina-code van een campagne in PSV Tools
 * beheren en naar Bunny publiceren. In Playable staat één keer een vast stukje
 * code dat de pagina daar vandaan laadt.
 */

interface LoadResponse {
  campaignId: number;
  kitVersie: string;
  bundleUrl: string;
  published: PublishedPage | null;
  starter: PageSource;
  loader: PageSource;
}

const FIELDS: { key: keyof PageSource; label: string; rows: number }[] = [
  { key: "html", label: "HTML", rows: 14 },
  { key: "css", label: "CSS", rows: 8 },
  { key: "js", label: "JavaScript", rows: 8 },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CodeBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Klembord geblokkeerd: de tekst blijft selecteerbaar.
    }
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="form-label !mb-0">{label}-veld</p>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Gekopieerd" : "Kopieer"}
        </Button>
      </div>
      <pre className="max-h-64 overflow-auto border border-border bg-muted p-3 text-xs">{value}</pre>
    </div>
  );
}

export function PlayableLoader() {
  const [campaign, setCampaign] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LoadResponse | null>(null);
  const [source, setSource] = useState<PageSource>({ html: "", css: "", js: "" });
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justPublished, setJustPublished] = useState<PublishedPage | null>(null);

  async function open(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setJustPublished(null);
    try {
      const res = await fetch(`/api/playable-loader?campagne=${encodeURIComponent(campaign.trim())}`);
      const json = await res.json().catch(() => ({ error: `Onverwacht antwoord (${res.status}).` }));
      if (!res.ok) throw new Error(json.error ?? `Openen mislukt (${res.status}).`);
      const loaded = json as LoadResponse;
      setData(loaded);
      setSource(loaded.published?.source ?? loaded.starter);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function publish() {
    if (!data) return;
    setPublishing(true);
    setError(null);
    setJustPublished(null);
    try {
      const res = await fetch("/api/playable-loader", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: data.campaignId, ...source }),
      });
      const json = await res.json().catch(() => ({ error: `Onverwacht antwoord (${res.status}).` }));
      if (!res.ok) throw new Error(json.error ?? `Publiceren mislukt (${res.status}).`);
      setJustPublished(json.published as PublishedPage);
      setData({ ...data, published: json.published, loader: json.loader });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }

  const published = data?.published ?? null;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <form onSubmit={open}>
          <label htmlFor="loader-campaign" className="form-label">
            Campagne-ID
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              id="loader-campaign"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder="244347"
              inputMode="numeric"
              autoComplete="off"
              disabled={loading}
            />
            <Button type="submit" disabled={loading || campaign.trim() === ""} className="shrink-0">
              {loading ? <Loader2 className="animate-spin" /> : <FolderOpen />}
              Openen
            </Button>
          </div>
          <p className="form-hint">Het ID staat in Playable in de adresbalk en in Landingspagina&apos;s.</p>
        </form>
      </Card>

      {error && <div className="alert alert--error">{error}</div>}

      {data && (
        <>
          <Card className="p-6 space-y-4">
            <div>
              <h2 className="text-xl mb-1">Pagina van campagne {data.campaignId}</h2>
              {published ? (
                <p className="text-sm text-muted-foreground">
                  Laatst gepubliceerd {formatDate(published.publishedAt)} door{" "}
                  {published.publishedByName ?? published.publishedBy}.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nog niet gepubliceerd. Hieronder staat de startpagina van de kit ({data.kitVersie}). Plak er de
                  huidige code van de campagne overheen, of probeer het met deze startpagina.
                </p>
              )}
            </div>

            <p className="form-hint !mt-0">
              Plak de inhoud van de drie velden van het html-element. De kit ({data.kitVersie}) zet PSV Tools er
              zelf bij; staat hij er al in, dan haalt PSV Tools hem eruit.
            </p>

            {FIELDS.map(({ key, label, rows }) => (
              <div key={key}>
                <label htmlFor={`loader-${key}`} className="form-label">
                  {label}
                </label>
                <Textarea
                  id={`loader-${key}`}
                  value={source[key]}
                  onChange={(e) => setSource({ ...source, [key]: e.target.value })}
                  rows={rows}
                  spellCheck={false}
                  className="font-mono text-xs"
                />
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={publish} disabled={publishing || source.html.trim() === ""}>
                {publishing ? <Loader2 className="animate-spin" /> : <Upload />}
                {publishing ? "Bezig…" : "Publiceren"}
              </Button>
              <p className="text-sm text-muted-foreground">
                Staat de loader al in Playable, dan is dit binnen een minuut live op de pagina.
              </p>
            </div>

            {justPublished && (
              <div className="alert alert--success !mb-0">
                Gepubliceerd om {formatDate(justPublished.publishedAt)}.{" "}
                {/* Met ?v= het net gepubliceerde bestand, niet een bewaarde versie. */}
                <a
                  className="underline"
                  href={`${justPublished.bundleUrl}?v=${Date.parse(justPublished.publishedAt)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Bekijk de bundel
                </a>
              </div>
            )}
            {justPublished?.warnings.map((w) => (
              <div key={w} className="alert alert--warning !mb-0">
                {w}
              </div>
            ))}
          </Card>

          <Card className="p-6 space-y-4">
            <div>
              <h2 className="text-xl mb-1">Eenmalig in Playable</h2>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Bewaar eerst de huidige code: plak de drie velden hierboven en publiceer.</li>
                <li>
                  Vervang in Playable de inhoud van de drie velden van het html-element door de drie blokken
                  hieronder, en sla op.
                </li>
                <li>Open de demo. De pagina komt nu uit PSV Tools.</li>
              </ol>
            </div>
            <CodeBlock label="HTML" value={data.loader.html} />
            <CodeBlock label="CSS" value={data.loader.css} />
            <CodeBlock label="JavaScript" value={data.loader.js} />
          </Card>
        </>
      )}
    </div>
  );
}
