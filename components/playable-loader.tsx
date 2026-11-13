"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  FolderOpen,
  Loader2,
  MousePointerClick,
  RefreshCw,
  Send,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlayableLoaderPreview, type PreviewHandle } from "@/components/playable-loader-preview";
import { StappenBalk, type Stap, type StapId } from "@/components/playable-loader-steps";
import { zonderKit, type PageSource } from "@/lib/playable-loader/bundle";
import type { PlayableCampaign } from "@/lib/playable-loader/playable";
import { selectieNotitie, type Aanwijzing, type Selectie } from "@/lib/playable-loader/selectie";
import type { BundleStatus } from "@/lib/playable-loader/status";
import type { PublishedPage, RecentCampaign } from "@/lib/playable-loader/store";
import { cn } from "@/lib/utils";

/**
 * Playable loader (beta), in stappen zoals een flow in Maileon:
 * 1. Campagne: ID invullen of een recente kiezen; PSV Tools controleert of
 *    Playable de campagne kent en of Bunny de laatste versie geeft.
 * 2. Aanpassen: met Claude, naast een voorbeeld van het concept. In het
 *    voorbeeld kun je een onderdeel aanwijzen; dat gaat mee met de vraag.
 * 3. Publiceren: het concept live zetten.
 * 4. Code: de HTML, CSS en JS zelf, en het vaste stukje voor Playable.
 */

interface LoadResponse {
  campaignId: number;
  kitVersie: string;
  bundleUrl: string;
  published: PublishedPage | null;
  campaign: PlayableCampaign | null;
  playableFout: string | null;
  bundleStatus: BundleStatus;
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
  /** Het onderdeel dat bij deze vraag was aangewezen in het voorbeeld. */
  selectie?: Selectie;
  wijzigingen?: Wijziging[];
  fout?: boolean;
}

const FIELDS: { key: keyof PageSource; label: string; rows: number }[] = [
  { key: "html", label: "HTML", rows: 16 },
  { key: "css", label: "CSS", rows: 10 },
  { key: "js", label: "JavaScript", rows: 10 },
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

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({ error: `Onverwacht antwoord (${res.status}).` }));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Er ging iets mis (${res.status}).`);
  return data as T;
}

/* ---------- Kleine onderdelen ---------- */

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

/** Wat er in het voorbeeld is aangewezen, met de niveaus erboven om een groter blok te kiezen. */
function AanwijzingChip({
  aanwijzing,
  onNiveau,
  onWis,
}: {
  aanwijzing: Aanwijzing;
  onNiveau: (niveau: number) => void;
  onWis: () => void;
}) {
  return (
    <div className="border border-primary bg-primary/5 px-3 py-2 text-xs">
      <div className="flex items-start gap-2">
        <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-heading uppercase tracking-wide text-primary">Aangewezen in het voorbeeld</p>
          {aanwijzing.tekst && <p className="line-clamp-2 break-words">&ldquo;{aanwijzing.tekst}&rdquo;</p>}
          <nav aria-label="Kies een groter of kleiner onderdeel" className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
            {aanwijzing.niveaus.map((n, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-muted-foreground" aria-hidden="true">›</span>}
                <button
                  type="button"
                  onClick={() => onNiveau(i)}
                  aria-current={i === aanwijzing.niveau || undefined}
                  title={n}
                  className={cn(
                    "max-w-[14rem] truncate font-mono transition-colors",
                    i === aanwijzing.niveau
                      ? "bg-primary px-1 text-primary-foreground"
                      : "text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                  )}
                >
                  {n}
                </button>
              </span>
            ))}
          </nav>
        </div>
        <button
          type="button"
          onClick={onWis}
          className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
          aria-label="Aanwijzing weghalen"
          title="Aanwijzing weghalen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

/** Wat de demo nu van Bunny krijgt, vergeleken met de laatste publicatie in PSV Tools. */
function BundelStatus({
  status,
  published,
  onCache,
  cacheBezig,
}: {
  status: BundleStatus;
  published: PublishedPage | null;
  onCache: () => void;
  cacheBezig: boolean;
}) {
  const bunny = status.bunnyPublishedAt ? formatDate(status.bunnyPublishedAt) : null;
  const cacheKnop = (
    <Button type="button" size="sm" variant="outline" onClick={onCache} disabled={cacheBezig}>
      {cacheBezig ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      Cache legen
    </Button>
  );
  switch (status.status) {
    case "gelijk":
      return (
        <p className="flex items-center gap-2">
          <Badge variant="success">Live gelijk</Badge>
          Demo en livepagina krijgen de laatste publicatie ({bunny}).
        </p>
      );
    case "ouder":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="warning">Oude versie</Badge>
          <span>
            Bunny geeft nog de versie van {bunny}, de laatste publicatie is van{" "}
            {published ? formatDate(published.publishedAt) : "later"}.
          </span>
          {cacheKnop}
        </div>
      );
    case "anders":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="warning">Andere versie</Badge>
          <span>Bunny geeft een versie ({bunny}) die PSV Tools niet als laatste kent. Publiceer opnieuw.</span>
          {cacheKnop}
        </div>
      );
    case "leeg":
      return (
        <p className="flex items-center gap-2">
          <Badge variant="outline">Niet gepubliceerd</Badge>
          Er staat nog geen pagina op Bunny voor deze campagne.
        </p>
      );
    default:
      return (
        <p className="flex items-center gap-2">
          <Badge variant="warning">Onbekend</Badge>
          Bunny kon niet worden gecontroleerd{status.detail ? `: ${status.detail}` : "."}
        </p>
      );
  }
}

/* ---------- De loader ---------- */

export function PlayableLoader() {
  const [stap, setStap] = useState<StapId>("campagne");
  const [campaign, setCampaign] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LoadResponse | null>(null);
  const [source, setSource] = useState<PageSource>({ html: "", css: "", js: "" });
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentCampaign[] | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [justPublished, setJustPublished] = useState<PublishedPage | null>(null);
  const [cacheBezig, setCacheBezig] = useState(false);

  const [chat, setChat] = useState<ChatBericht[]>([]);
  const [vraag, setVraag] = useState("");
  const [bezig, setBezig] = useState(false);
  const [geschiedenis, setGeschiedenis] = useState<PageSource[]>([]);
  const [aanwijzing, setAanwijzing] = useState<Aanwijzing | null>(null);
  const chatEinde = useRef<HTMLDivElement>(null);
  const voorbeeld = useRef<PreviewHandle>(null);
  const vraagVeld = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEinde.current?.scrollIntoView({ block: "nearest" });
  }, [chat, bezig]);

  async function laadRecent() {
    try {
      const res = await json<{ recent: RecentCampaign[] }>(await fetch("/api/playable-loader/recent"));
      setRecent(res.recent);
    } catch {
      setRecent([]);
    }
  }

  // Bij openen: de recente campagnes, en een campagne uit de adresbalk
  // (zo blijft hij open na verversen).
  useEffect(() => {
    laadRecent();
    const uitAdres = new URLSearchParams(window.location.search).get("campagne");
    if (uitAdres) openCampagne(uitAdres);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openCampagne(id: string) {
    const schoon = id.trim();
    if (!schoon) return;
    setCampaign(schoon);
    setLoading(true);
    setError(null);
    setJustPublished(null);
    try {
      const loaded = await json<LoadResponse>(
        await fetch(`/api/playable-loader?campagne=${encodeURIComponent(schoon)}`)
      );
      setData(loaded);
      setSource(loaded.published?.source ?? loaded.starter);
      setChat([]);
      setGeschiedenis([]);
      setAanwijzing(null);
      setStap("aanpassen");
      window.history.replaceState(null, "", `?campagne=${loaded.campaignId}`);
    } catch (err) {
      setData(null);
      setStap("campagne");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function stuur(tekst: string) {
    if (!data || !tekst.trim() || bezig) return;
    const selectie: Selectie | undefined = aanwijzing
      ? { pad: aanwijzing.pad, tekst: aanwijzing.tekst, html: aanwijzing.html }
      : undefined;
    const nieuw: ChatBericht[] = [...chat, { rol: "gebruiker", tekst: tekst.trim(), selectie }];
    setChat(nieuw);
    setVraag("");
    setBezig(true);
    try {
      const res = await json<{ antwoord: string; bron: PageSource | null; wijzigingen: Wijziging[] }>(
        await fetch("/api/playable-loader/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId: data.campaignId,
            // Foutmeldingen horen niet bij het gesprek met Claude. Bij eerdere
            // vragen staat kort wat er toen was aangewezen; het hele onderdeel
            // gaat alleen mee met de nieuwe vraag.
            berichten: nieuw
              .filter((b) => !b.fout)
              .map(({ rol, tekst, selectie: s }, i, alle) => ({
                rol,
                tekst: s && i < alle.length - 1 ? `${tekst}\n\n${selectieNotitie(s)}` : tekst,
              })),
            bron: source,
            selectie: selectie ?? null,
          }),
        })
      );
      if (res.bron) {
        setGeschiedenis((g) => [...g, source]);
        setSource(res.bron);
      }
      setChat([...nieuw, { rol: "assistent", tekst: res.antwoord, wijzigingen: res.bron ? res.wijzigingen : undefined }]);
    } catch (err) {
      setChat([...nieuw, { rol: "assistent", tekst: err instanceof Error ? err.message : String(err), fout: true }]);
    } finally {
      setBezig(false);
    }
  }

  function wisAanwijzing() {
    voorbeeld.current?.wis();
    setAanwijzing(null);
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
      const res = await json<{ published: PublishedPage; loader: PageSource; bundleStatus: BundleStatus }>(
        await fetch("/api/playable-loader", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: data.campaignId, campaignName: data.campaign?.name, ...source }),
        })
      );
      setJustPublished(res.published);
      setData({ ...data, published: res.published, loader: res.loader, bundleStatus: res.bundleStatus });
      laadRecent();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }

  async function legeCache() {
    if (!data) return;
    setCacheBezig(true);
    setError(null);
    try {
      const res = await json<{ bundleStatus: BundleStatus }>(
        await fetch("/api/playable-loader/cache", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: data.campaignId }),
        })
      );
      setData({ ...data, bundleStatus: res.bundleStatus });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCacheBezig(false);
    }
  }

  const published = data?.published ?? null;
  const conceptAfwijkend = !!data && (!published || !zelfde(source, published.source));
  const bunnyAandacht = !!data && ["ouder", "anders", "fout"].includes(data.bundleStatus.status);

  const stappen: Stap[] = [
    { id: "campagne", label: "Campagne", staat: stap === "campagne" ? "huidig" : data ? "klaar" : "open" },
    {
      id: "aanpassen",
      label: "Aanpassen",
      disabled: !data,
      staat: stap === "aanpassen" ? "huidig" : geschiedenis.length > 0 ? "klaar" : "open",
    },
    {
      id: "publiceren",
      label: "Publiceren",
      disabled: !data,
      staat:
        stap === "publiceren"
          ? "huidig"
          : conceptAfwijkend || bunnyAandacht
            ? "aandacht"
            : published
              ? "klaar"
              : "open",
      hint: conceptAfwijkend
        ? "Het concept wijkt af van wat live staat"
        : bunnyAandacht
          ? "Bunny geeft niet de laatste versie"
          : undefined,
    },
    {
      id: "code",
      label: "Code",
      disabled: !data,
      staat: stap === "code" ? "huidig" : data && !published ? "aandacht" : "open",
      hint: data && !published ? "Nog niet gepubliceerd: zet het vaste stukje in Playable" : undefined,
    },
  ];

  return (
    <div className="space-y-5">
      {data && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-heading uppercase tracking-wide text-muted-foreground">
            Campagne {data.campaignId}
          </span>
          {data.campaign && <span className="font-semibold">{data.campaign.name}</span>}
          {data.campaign && (
            <Badge variant={data.campaign.active ? "success" : "outline"}>
              {data.campaign.active ? "Actief" : "Niet actief"}
            </Badge>
          )}
          {data.campaign?.demoUrl && <Link href={data.campaign.demoUrl}>Demo</Link>}
          {data.campaign?.liveUrl && <Link href={data.campaign.liveUrl}>Live</Link>}
          <button
            type="button"
            onClick={() => setStap("campagne")}
            className="text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            Andere campagne
          </button>
        </div>
      )}

      <StappenBalk stappen={stappen} onKies={setStap} />

      {data && stap !== "campagne" && (
        <div className="space-y-1 border-l-4 border-border bg-muted/50 px-4 py-3 text-sm">
          {data.playableFout && <p className="text-warning">{data.playableFout}</p>}
          <BundelStatus status={data.bundleStatus} published={published} onCache={legeCache} cacheBezig={cacheBezig} />
        </div>
      )}

      {error && <div className="alert alert--error !mb-0">{error}</div>}

      {/* ---------- 1. Campagne ---------- */}
      {stap === "campagne" && (
        <Card className="max-w-5xl p-6 space-y-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              openCampagne(campaign);
            }}
          >
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
            <p className="form-hint">
              Het ID staat in Playable in de adresbalk en in Landingspagina&apos;s. PSV Tools controleert of
              Playable de campagne kent en welke versie de demo krijgt.
            </p>
          </form>

          <div>
            <p className="form-label">Jouw recente campagnes</p>
            {recent === null ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Laden…
              </p>
            ) : recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Hier komen de campagnes waar jij op publiceert. Je hebt er nog geen.
              </p>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {recent.map((r) => (
                  <li key={r.campaignId}>
                    <button
                      type="button"
                      onClick={() => openCampagne(String(r.campaignId))}
                      disabled={loading}
                      className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-2 py-3 text-left text-sm transition-colors hover:bg-muted"
                    >
                      <span>
                        <span className="font-mono text-muted-foreground">{r.campaignId}</span>
                        <span className="ml-3 font-semibold">{r.campaignName ?? "Naam onbekend"}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Door jou gepubliceerd {formatDate(r.publishedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      )}

      {/* ---------- 2. Aanpassen ---------- */}
      {stap === "aanpassen" && data && (
        <div className="grid gap-6 xl:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] xl:items-start">
          <Card className="flex flex-col p-6">
            <h2 className="text-xl mb-1">Wat moet er anders?</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Zeg in gewone taal wat er op de pagina moet veranderen. Claude past het concept aan; er gaat pas iets
              live als je publiceert.
            </p>

            <div
              className="flex-1 space-y-3 overflow-y-auto pr-1 xl:max-h-[max(16rem,calc(100svh_-_30rem))]"
              aria-live="polite"
            >
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
                  {b.selectie && (
                    <span className="mt-1 flex items-center gap-1 text-xs opacity-80">
                      <MousePointerClick className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="truncate font-mono">{b.selectie.pad.split(" > ").pop()}</span>
                    </span>
                  )}
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
              {aanwijzing ? (
                <AanwijzingChip
                  aanwijzing={aanwijzing}
                  onNiveau={(n) => voorbeeld.current?.kiesNiveau(n)}
                  onWis={wisAanwijzing}
                />
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MousePointerClick className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Tip: met Aanwijzen klik je in het voorbeeld aan waar je vraag over gaat.
                </p>
              )}
              <Textarea
                ref={vraagVeld}
                value={vraag}
                onChange={(e) => setVraag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    stuur(vraag);
                  }
                }}
                rows={3}
                placeholder={
                  aanwijzing
                    ? "Bijvoorbeeld: maak deze tekst korter"
                    : "Bijvoorbeeld: zet de datum op zondag 15 november, 14.30 uur"
                }
                disabled={bezig}
                aria-label="Wat moet er anders?"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={ongedaan}
                  disabled={bezig || geschiedenis.length === 0}
                >
                  <Undo2 />
                  Ongedaan maken
                </Button>
                <Button type="submit" disabled={bezig || !vraag.trim()}>
                  {bezig ? <Loader2 className="animate-spin" /> : <Send />}
                  Versturen
                </Button>
              </div>
            </form>

            <div className="mt-4 border-t border-border pt-4">
              <Button
                type="button"
                variant={conceptAfwijkend ? "default" : "outline"}
                className="w-full"
                onClick={() => setStap("publiceren")}
              >
                Verder naar publiceren
                <ArrowRight />
              </Button>
            </div>
          </Card>

          <Card className="p-4 sm:p-6 xl:sticky xl:top-4">
            <PlayableLoaderPreview
              ref={voorbeeld}
              bron={source}
              aanwijzing={aanwijzing}
              onAanwijzing={(a, klik) => {
                setAanwijzing(a);
                if (a && klik) vraagVeld.current?.focus({ preventScroll: true });
              }}
            />
          </Card>
        </div>
      )}

      {/* ---------- 3. Publiceren ---------- */}
      {stap === "publiceren" && data && (
        <Card className="max-w-5xl p-6 space-y-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl">Publiceren</h2>
              {conceptAfwijkend ? (
                <Badge variant="warning">Concept wijkt af van live</Badge>
              ) : (
                <Badge variant="success">Concept gelijk aan live</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {published
                ? `Laatst gepubliceerd ${formatDate(published.publishedAt)} door ${published.publishedByName ?? published.publishedBy}.`
                : "Deze campagne is nog niet gepubliceerd vanuit PSV Tools."}{" "}
              Staat het vaste stukje code in Playable, dan is een publicatie binnen een minuut te zien op de demo en
              de livepagina.
            </p>
            {geschiedenis.length > 0 && (
              <p className="text-sm text-muted-foreground">
                In dit concept: {geschiedenis.length === 1 ? "1 wijziging" : `${geschiedenis.length} wijzigingen`} via
                de chat.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={() => setStap("aanpassen")}>
              <ArrowLeft />
              Terug naar aanpassen
            </Button>
            <Button type="button" onClick={publish} disabled={publishing || source.html.trim() === ""}>
              {publishing ? <Loader2 className="animate-spin" /> : <Upload />}
              {publishing ? "Bezig…" : "Publiceren"}
            </Button>
            {data.campaign?.demoUrl && <Link href={data.campaign.demoUrl}>Demo bekijken</Link>}
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
      )}

      {/* ---------- 4. Code ---------- */}
      {stap === "code" && data && (
        <Card className="max-w-7xl p-6">
          <Tabs defaultValue={published ? "code" : "playable"}>
            <TabsList>
              <TabsTrigger value="code">HTML, CSS en JS</TabsTrigger>
              <TabsTrigger value="playable">Eenmalig in Playable</TabsTrigger>
            </TabsList>

            <TabsContent value="code" className="space-y-4 pt-4">
              <p className="form-hint !mt-0">
                Het concept zelf bekijken of aanpassen, of de code uit Playable plakken. De Kit ({data.kitVersie})
                zet PSV Tools er zelf bij; staat hij er al in, dan haalt PSV Tools hem eruit.
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
            </TabsContent>

            <TabsContent value="playable" className="space-y-4 pt-4">
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Plak eerst de huidige code uit Playable onder HTML, CSS en JS en publiceer, zodat hij bewaard is.</li>
                <li>
                  Vervang in Playable de inhoud van de drie velden van het html-element door de drie blokken
                  hieronder, en sla op.
                </li>
                <li>Open de demo. De pagina komt nu uit PSV Tools.</li>
              </ol>
              <p className="form-hint !mt-0">
                Of het vaste stukje in Playable staat, kan PSV Tools niet zien: de API van Playable kijkt niet in
                het html-element. Controleer het op de demo.
              </p>
              <CodeBlock label="HTML" value={data.loader.html} />
              <CodeBlock label="CSS" value={data.loader.css} />
              <CodeBlock label="JavaScript" value={data.loader.js} />
            </TabsContent>
          </Tabs>
        </Card>
      )}
    </div>
  );
}
