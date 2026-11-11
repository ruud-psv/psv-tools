"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, FolderOpen, Loader2, Send, Undo2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayableLoaderPreview } from "@/components/playable-loader-preview";
import { zonderKit, type PageSource } from "@/lib/playable-loader/bundle";
import type { PublishedPage } from "@/lib/playable-loader/store";
import { cn } from "@/lib/utils";

/**
 * Playable loader (beta): de pagina van een campagne aanpassen met Claude,
 * het concept bekijken en publiceren naar Bunny. In Playable staat één keer
 * een vast stukje code dat de pagina daar vandaan laadt.
 */

interface LoadResponse {
  campaignId: number;
  kitVersie: string;
  bundleUrl: string;
  published: PublishedPage | null;
  starter: PageSource;
  loader: PageSource;
}

interface Wijziging {
  veld: keyof PageSource;
  zoek: string;
  vervang: string;
}

interface ChatBericht {
  rol: "gebruiker" | "assistent";
  tekst: string;
  wijzigingen?: Wijziging[];
  fout?: boolean;
}

const FIELDS: { key: keyof PageSource; label: string; rows: number }[] = [
  { key: "html", label: "HTML", rows: 14 },
  { key: "css", label: "CSS", rows: 8 },
  { key: "js", label: "JavaScript", rows: 8 },
];

const VOORBEELDEN = [
  "Verander de kop van de vooruitblik in: Vooruitblik PSV - NEC",
  "Vervang de quote door: \"We willen thuis winnen.\"",
  "Zet de knop van de merchandise op: Bekijk het nieuwe shirt",
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function zelfde(a: PageSource, b: PageSource): boolean {
  const x = zonderKit(a);
  const y = zonderKit(b);
  return x.html === y.html && x.css.trim() === y.css.trim() && x.js.trim() === y.js.trim();
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

function WijzigingenLijst({ wijzigingen }: { wijzigingen: Wijziging[] }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted-foreground">
        {wijzigingen.length === 1 ? "1 wijziging" : `${wijzigingen.length} wijzigingen`} in de code bekijken
      </summary>
      <ul className="mt-2 space-y-2">
        {wijzigingen.map((w, i) => (
          <li key={i} className="border border-border bg-background p-2">
            <p className="font-heading uppercase tracking-wide text-muted-foreground mb-1">{w.veld}</p>
            {w.zoek && (
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-destructive line-through">
                {w.zoek}
              </pre>
            )}
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-success">{w.vervang}</pre>
          </li>
        ))}
      </ul>
    </details>
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

  const [chat, setChat] = useState<ChatBericht[]>([]);
  const [vraag, setVraag] = useState("");
  const [bezig, setBezig] = useState(false);
  const [geschiedenis, setGeschiedenis] = useState<PageSource[]>([]);
  const chatEinde = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEinde.current?.scrollIntoView({ block: "nearest" });
  }, [chat, bezig]);

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
      setChat([]);
      setGeschiedenis([]);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function stuur(tekst: string) {
    if (!data || !tekst.trim() || bezig) return;
    const nieuw: ChatBericht[] = [...chat, { rol: "gebruiker", tekst: tekst.trim() }];
    setChat(nieuw);
    setVraag("");
    setBezig(true);
    try {
      const res = await fetch("/api/playable-loader/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: data.campaignId,
          // Foutmeldingen horen niet bij het gesprek met Claude.
          berichten: nieuw.filter((b) => !b.fout).map(({ rol, tekst }) => ({ rol, tekst })),
          bron: source,
        }),
      });
      const json = await res.json().catch(() => ({ error: `Onverwacht antwoord (${res.status}).` }));
      if (!res.ok) throw new Error(json.error ?? `Er ging iets mis (${res.status}).`);
      if (json.bron) {
        setGeschiedenis((g) => [...g, source]);
        setSource(json.bron as PageSource);
      }
      setChat([...nieuw, { rol: "assistent", tekst: json.antwoord, wijzigingen: json.bron ? json.wijzigingen : undefined }]);
    } catch (err) {
      setChat([...nieuw, { rol: "assistent", tekst: err instanceof Error ? err.message : String(err), fout: true }]);
    } finally {
      setBezig(false);
    }
  }

  function ongedaan() {
    const vorige = geschiedenis[geschiedenis.length - 1];
    if (!vorige) return;
    setSource(vorige);
    setGeschiedenis(geschiedenis.slice(0, -1));
    setChat([...chat, { rol: "assistent", tekst: "De laatste wijziging is teruggedraaid in het concept." }]);
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
  const conceptAfwijkend = !published || !zelfde(source, published.source);

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
          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            {/* ---------- Chat ---------- */}
            <Card className="flex flex-col p-6">
              <h2 className="text-xl mb-1">Wat moet er anders?</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Zeg in gewone taal wat er op de pagina van campagne {data.campaignId} moet veranderen. Claude past
                het concept aan; er gaat pas iets live als je publiceert.
              </p>

              <div className="flex-1 space-y-3 overflow-y-auto pr-1 xl:max-h-[560px]" aria-live="polite">
                {chat.length === 0 && (
                  <div className="space-y-2">
                    <p className="form-label">Bijvoorbeeld</p>
                    {VOORBEELDEN.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setVraag(v)}
                        className="block w-full border border-border px-3 py-2 text-left text-sm transition-colors hover:border-primary hover:text-primary"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
                {chat.map((b, i) => (
                  <div
                    key={i}
                    className={cn(
                      "max-w-[90%] px-3 py-2 text-sm whitespace-pre-wrap",
                      b.rol === "gebruiker"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : b.fout
                          ? "alert alert--error !mb-0"
                          : "border border-border bg-muted"
                    )}
                  >
                    {b.tekst}
                    {b.wijzigingen && b.wijzigingen.length > 0 && <WijzigingenLijst wijzigingen={b.wijzigingen} />}
                  </div>
                ))}
                {bezig && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Claude past de pagina aan. Dat kan een minuut duren.
                  </div>
                )}
                <div ref={chatEinde} />
              </div>

              <form
                className="mt-4 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  stuur(vraag);
                }}
              >
                <Textarea
                  value={vraag}
                  onChange={(e) => setVraag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      stuur(vraag);
                    }
                  }}
                  rows={3}
                  placeholder="Bijvoorbeeld: zet de datum op zondag 15 november, 14.30 uur"
                  disabled={bezig}
                  aria-label="Wat moet er anders?"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={ongedaan} disabled={bezig || geschiedenis.length === 0}>
                    <Undo2 />
                    Ongedaan maken
                  </Button>
                  <Button type="submit" disabled={bezig || !vraag.trim()}>
                    {bezig ? <Loader2 className="animate-spin" /> : <Send />}
                    Versturen
                  </Button>
                </div>
              </form>
            </Card>

            {/* ---------- Voorbeeld ---------- */}
            <Card className="p-6">
              <PlayableLoaderPreview bron={source} />
            </Card>
          </div>

          {/* ---------- Publiceren ---------- */}
          <Card className="p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl">Publiceren</h2>
                  {conceptAfwijkend ? (
                    <Badge variant="warning">Concept wijkt af van live</Badge>
                  ) : (
                    <Badge variant="success">Gelijk aan live</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {published
                    ? `Laatst gepubliceerd ${formatDate(published.publishedAt)} door ${published.publishedByName ?? published.publishedBy}.`
                    : "Nog niet gepubliceerd."}{" "}
                  Staat de loader in Playable, dan is een publicatie binnen een minuut live.
                </p>
              </div>
              <Button type="button" onClick={publish} disabled={publishing || source.html.trim() === ""}>
                {publishing ? <Loader2 className="animate-spin" /> : <Upload />}
                {publishing ? "Bezig…" : "Publiceren"}
              </Button>
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

          {/* ---------- Code ---------- */}
          <Card className="p-6">
            <details>
              <summary className="cursor-pointer">
                <span className="font-heading uppercase text-xl">Code</span>
                <span className="ml-2 text-sm text-muted-foreground">
                  Zelf bekijken of aanpassen, of de code uit Playable plakken
                </span>
              </summary>
              <div className="mt-4 space-y-4">
                <p className="form-hint !mt-0">
                  De Kit ({data.kitVersie}) zet PSV Tools er zelf bij; staat hij er al in, dan haalt PSV Tools hem
                  eruit.
                  {!published && " Nog niet gepubliceerd: hieronder staat de startpagina van de Kit."}
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
              </div>
            </details>
          </Card>

          {/* ---------- Eenmalig in Playable ---------- */}
          <Card className="p-6">
            <details open={!published}>
              <summary className="cursor-pointer">
                <span className="font-heading uppercase text-xl">Eenmalig in Playable</span>
                <span className="ml-2 text-sm text-muted-foreground">Het vaste stukje code voor het html-element</span>
              </summary>
              <div className="mt-4 space-y-4">
                <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>Plak eerst de huidige code uit Playable onder Code en publiceer, zodat hij bewaard is.</li>
                  <li>
                    Vervang in Playable de inhoud van de drie velden van het html-element door de drie blokken
                    hieronder, en sla op.
                  </li>
                  <li>Open de demo. De pagina komt nu uit PSV Tools.</li>
                </ol>
                <CodeBlock label="HTML" value={data.loader.html} />
                <CodeBlock label="CSS" value={data.loader.css} />
                <CodeBlock label="JavaScript" value={data.loader.js} />
              </div>
            </details>
          </Card>
        </>
      )}
    </div>
  );
}
