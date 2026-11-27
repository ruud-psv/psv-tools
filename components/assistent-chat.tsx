"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowUp, Check, ChevronRight, Database, FileText, History, Loader2, MessageSquarePlus, PanelLeftClose, PanelLeftOpen, Presentation, Sparkles, Trash2, X } from "lucide-react";
import { StukPaneel } from "@/components/stuk/stuk-paneel";
import { STUK_SOORT_LABEL, type Stuk, type StukSoort } from "@/lib/stukken/model";
import { formatAnswer } from "@/components/chat-opmaak";
import { cn } from "@/lib/utils";
import { pakEersteVraag, SUGGESTIES } from "@/lib/assistent-start";
import type { GesprekSamenvatting, GesprekStap } from "@/lib/kennisbank-gesprekken";
import { leesCreatives, type AssistentCreative } from "@/lib/assistent/creative-tools";
import { AssistentCreatives } from "@/components/assistent-creatives";

/**
 * De chat van de assistent: één gesprek over de databronnen van PSV Tools
 * heen. De server haalt de data op (`/api/assistent/chat`); de chat toont het
 * antwoord terwijl het binnenkomt en welke bronnen ervoor zijn geraadpleegd.
 */

interface Bron {
  naam: string;
  label: string;
  href: string;
}

interface Beurt {
  role: "user" | "assistant";
  content: string;
  bronnen?: Bron[];
  stappen?: GesprekStap[];
  creatives?: AssistentCreative[];
}

/**
 * De vragen achter de knoppen "Rapport maken" en "Slide deck maken". Is er al
 * een stuk, dan zet de knop het om naar de andere soort.
 */
const MAAK_VRAAG: Record<StukSoort, { nieuw: string; omzetten: string }> = {
  rapport: {
    nieuw: "Maak een rapport van dit gesprek.",
    omzetten: "Zet het stuk om naar een rapport. Zet tekst en conclusie waar het past naast elkaar.",
  },
  deck: {
    nieuw: "Maak een slide deck van dit gesprek.",
    omzetten: "Zet het stuk om naar een slide deck in het PSV-template: met hoofdstukken, korte titels en beeld-, speciaal- of quoteslides waar het past.",
  },
};

/** Iets maken op basis van het gesprek: een rapport of een slide deck. */
function MaakKnoppen({ stuk, uit, onVraag }: { stuk: Stuk | null; uit: boolean; onVraag: (vraag: string) => void }) {
  const soorten: { soort: StukSoort; icoon: typeof FileText }[] = [
    { soort: "rapport", icoon: FileText },
    { soort: "deck", icoon: Presentation },
  ];
  const te = soorten.filter(({ soort }) => soort !== stuk?.soort);
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">{stuk ? "Het stuk als" : "Maak van dit gesprek een"}</span>
      {te.map(({ soort, icoon: Icoon }) => (
        <button
          key={soort}
          type="button"
          disabled={uit}
          onClick={() => onVraag(stuk ? MAAK_VRAAG[soort].omzetten : MAAK_VRAAG[soort].nieuw)}
          className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground transition-colors hover:border-psv-red-primary disabled:opacity-40"
        >
          <Icoon className="h-3.5 w-3.5 text-psv-red-primary" />
          {STUK_SOORT_LABEL[soort].toLowerCase()}
        </button>
      ))}
    </div>
  );
}

/** Wat de assistent heeft opgezocht, met welke invoer: uitklapbaar onder het antwoord. */
function Zoekstappen({ stappen }: { stappen: GesprekStap[] }) {
  const mislukt = stappen.filter((s) => !s.ok).length;
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none font-heading uppercase tracking-wide hover:text-foreground">
        Zoekstappen ({stappen.length}
        {mislukt > 0 ? `, ${mislukt} mislukt` : ""})
      </summary>
      <ol className="mt-2 space-y-2 border-l border-border pl-3">
        {stappen.map((stap, i) => (
          <li key={i} className="flex gap-2">
            {stap.ok ? (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-label="gelukt" />
            ) : (
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-error" aria-label="mislukt" />
            )}
            <div className="min-w-0">
              <span className="text-foreground">{stap.label}</span>
              <code className="mt-0.5 block break-all font-mono text-[11px] leading-snug">{stap.invoer}</code>
              {stap.melding && <span className="mt-0.5 block text-error">{stap.melding}</span>}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}

function Antwoord({ beurt, bezig }: { beurt: Beurt; bezig: boolean }) {
  const bronnen = beurt.bronnen ?? [];
  const stappen = beurt.stappen ?? [];
  const creatives = beurt.creatives ?? [];
  // Meerdere tools van dezelfde pagina tonen als één bron.
  const paginas = bronnen.filter((b, i) => bronnen.findIndex((x) => x.href === b.href) === i);

  return (
    <div className="space-y-3 text-sm leading-relaxed text-foreground">
      {beurt.content ? (
        <div className="space-y-2">{formatAnswer(beurt.content)}</div>
      ) : (
        bezig && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {bronnen.length > 0 ? `${bronnen[bronnen.length - 1].label} geraadpleegd, bezig met het antwoord…` : "Bezig met het ophalen van de data…"}
          </div>
        )
      )}

      {creatives.length > 0 && <AssistentCreatives creatives={creatives} />}

      {paginas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-heading text-xs uppercase tracking-wide text-muted-foreground">Bronnen</span>
          {paginas.map((b) => (
            <Link
              key={b.href}
              href={b.href}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-psv-red-primary hover:text-foreground"
            >
              <Database className="h-3.5 w-3.5" />
              {b.label.split(" · ")[0]}
            </Link>
          ))}
        </div>
      )}

      {stappen.length > 0 && <Zoekstappen stappen={stappen} />}
    </div>
  );
}

function LegeStaat({ onKies }: { onKies: (vraag: string) => void }) {
  return (
    <div className="flex min-h-full animate-fade-up flex-col items-center justify-center px-4 py-10 text-center">
      <Sparkles className="mb-3 h-7 w-7 text-psv-red-primary" />
      <h2 className="font-heading text-2xl uppercase tracking-tight">Wat wil je weten?</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Stel een vraag over de ticketverkoop, de FANdesk of een werkwijze uit de kennisbank. De assistent
        haalt de cijfers op uit PSV Tools en laat zien uit welke bron ze komen.
      </p>
      <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
        {SUGGESTIES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onKies(s)}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-psv-red-primary hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AssistentChat() {
  /** Het stuk bij dit gesprek (rapport of slide deck), als de assistent er een maakte. */
  const [stuk, setStuk] = useState<Stuk | null>(null);
  /** Op kleinere schermen: het stuk tonen in plaats van het gesprek. */
  const [toonStuk, setToonStuk] = useState(false);
  /** Op mobiel: de lijst met gesprekken over het gesprek heen tonen. */
  const [toonGesprekken, setToonGesprekken] = useState(false);
  /** De gesprekken met een stuk, voor het icoon in de lijst. */
  const [metStuk, setMetStuk] = useState<Set<string>>(new Set());
  const [gesprekken, setGesprekken] = useState<GesprekSamenvatting[]>([]);
  const [gesprekId, setGesprekId] = useState<string | null>(null);
  /** De titel van het gesprek (gemaakt door de assistent); bovenaan en in de lijst. */
  const [titel, setTitel] = useState<string | null>(null);
  const [beurten, setBeurten] = useState<Beurt[]>([]);
  const [invoer, setInvoer] = useState("");
  const [bezig, setBezig] = useState(false);
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  /** Desktop: de gesprekkenlijst ingeklapt, zodat het stuk (en de slides) meer ruimte krijgt. */
  const [ingeklapt, setIngeklapt] = useState(false);
  /** Ingeklapt: de lijst zweeft erover zolang de muis op de strook links of op de lijst staat. */
  const [zweeft, setZweeft] = useState(false);
  const zweefTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const invoerRef = useRef<HTMLTextAreaElement>(null);
  /** Meescrollen zolang je onderaan staat; wie omhoog scrollt, blijft daar. */
  const plakRef = useRef(true);

  const laadGesprekken = useCallback(async () => {
    try {
      const res = await fetch("/api/assistent/gesprekken");
      if (!res.ok) return;
      const data = await res.json();
      setGesprekken(data.gesprekken ?? []);
      const stukken = await fetch("/api/assistent/stukken").then((r) => (r.ok ? r.json() : { stukken: [] }));
      setMetStuk(new Set((stukken.stukken ?? []).map((s: { id: string }) => s.id)));
    } catch {
      // De geschiedenis is bijzaak; de chat werkt ook zonder.
    }
  }, []);

  // Ingeklapt of niet: per browser onthouden.
  useEffect(() => {
    try {
      setIngeklapt(localStorage.getItem("assistent:gesprekken-ingeklapt") === "1");
    } catch {
      // Geen opslag (privévenster): gewoon uitgeklapt.
    }
  }, []);

  function zetIngeklapt(waarde: boolean) {
    setIngeklapt(waarde);
    setZweeft(false);
    try {
      localStorage.setItem("assistent:gesprekken-ingeklapt", waarde ? "1" : "0");
    } catch {
      // Niet erg: dan alleen voor nu.
    }
  }

  function toonZwevend() {
    if (zweefTimer.current) clearTimeout(zweefTimer.current);
    setZweeft(true);
  }

  /** Met een korte vertraging, zodat de lijst niet wegspringt als de muis even buiten de rand komt. */
  function verbergZwevend() {
    if (zweefTimer.current) clearTimeout(zweefTimer.current);
    zweefTimer.current = setTimeout(() => setZweeft(false), 250);
  }

  useEffect(() => {
    laadGesprekken();
    return () => abortRef.current?.abort();
  }, [laadGesprekken]);

  // Kom je van het dashboard met een vraag, dan start het gesprek meteen.
  // In een timeout: React draait effecten in ontwikkeling twee keer, en de
  // opruiming hierboven breekt een lopend verzoek af.
  // Vanuit Mijn documenten (`?gesprek=<id>`) opent het gesprek met zijn stuk.
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const gesprek = params.get("gesprek");
      if (gesprek && /^[a-f0-9]{32}$/.test(gesprek)) {
        window.history.replaceState(null, "", window.location.pathname);
        openGesprek(gesprek);
        return;
      }
      const vraag = pakEersteVraag();
      if (vraag) stel(vraag);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = threadRef.current;
    if (el && plakRef.current) el.scrollTo({ top: el.scrollHeight });
  }, [beurten]);

  useEffect(() => {
    const el = invoerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
  }, [invoer]);

  function onScroll() {
    const el = threadRef.current;
    if (el) plakRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setBezig(false);
  }

  async function stel(vraag: string) {
    const q = vraag.trim();
    if (!q || bezig) return;
    const vorige = beurten;
    const geschiedenis: Beurt[] = [...vorige, { role: "user", content: q }];
    setFout(null);
    setInvoer("");
    setBeurten([...geschiedenis, { role: "assistant", content: "" }]);
    setBezig(true);
    plakRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/assistent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gesprekId, messages: geschiedenis.map(({ role, content }) => ({ role, content })) }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Er ging iets mis.");
      }
      const id = res.headers.get("X-Gesprek-Id");
      if (id) setGesprekId(id);
      if (!vorige.length) setTitel(null);

      // Het antwoord komt binnen als regels JSON; een regel kan over twee stukken verdeeld zijn.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let rest = "";
      let antwoord = "";
      const bronnen: Bron[] = [];
      const stappen: GesprekStap[] = [];
      let creatives: AssistentCreative[] = [];
      const verwerk = (regel: string) => {
        if (!regel.trim()) return;
        const gebeurtenis = JSON.parse(regel) as { t: string; d?: string; stuk?: Stuk; titel?: string; creatives?: unknown } & Partial<Bron> & Partial<GesprekStap>;
        if (gebeurtenis.t === "tekst") antwoord += gebeurtenis.d ?? "";
        else if (gebeurtenis.t === "wis") antwoord = "";
        else if (gebeurtenis.t === "bron" && gebeurtenis.naam && gebeurtenis.label && gebeurtenis.href)
          bronnen.push({ naam: gebeurtenis.naam, label: gebeurtenis.label, href: gebeurtenis.href });
        else if (gebeurtenis.t === "stuk" && gebeurtenis.stuk) {
          const nieuw = gebeurtenis.stuk;
          setStuk(nieuw);
          setMetStuk((huidig) => new Set(huidig).add(nieuw.id));
        }
        else if (gebeurtenis.t === "titel" && gebeurtenis.titel) {
          const nieuweTitel = gebeurtenis.titel;
          setTitel(nieuweTitel);
          if (id) setGesprekken((huidig) => huidig.map((g) => (g.id === id ? { ...g, titel: nieuweTitel } : g)));
        }
        else if (gebeurtenis.t === "stap" && gebeurtenis.label && typeof gebeurtenis.invoer === "string")
          stappen.push({ label: gebeurtenis.label, invoer: gebeurtenis.invoer, ok: gebeurtenis.ok === true, melding: gebeurtenis.melding });
        else if (gebeurtenis.t === "creatives") creatives = leesCreatives(gebeurtenis.creatives);
        else if (gebeurtenis.t === "fout") throw new Error(gebeurtenis.d || "Er ging iets mis.");
      };
      while (true) {
        const { done, value } = await reader.read();
        if (controller.signal.aborted) return;
        rest += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const regels = rest.split("\n");
        rest = done ? "" : (regels.pop() ?? "");
        regels.forEach(verwerk);
        setBeurten([...geschiedenis, { role: "assistant", content: antwoord, bronnen: [...bronnen], stappen: [...stappen], creatives }]);
        if (done) break;
      }
      if (!antwoord.trim()) throw new Error("Er kwam geen antwoord terug.");
      laadGesprekken();
    } catch (e) {
      if (controller.signal.aborted) return;
      // Zet de vraag terug in het invoerveld, zodat je hem opnieuw kunt sturen.
      setBeurten(vorige);
      setInvoer(q);
      setFout(e instanceof Error && e.message !== "network error" ? e.message : "Er ging iets mis.");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBezig(false);
      }
    }
  }

  function nieuwGesprek() {
    stop();
    setGesprekId(null);
    setTitel(null);
    setStuk(null);
    setToonStuk(false);
    setToonGesprekken(false);
    setBeurten([]);
    setFout(null);
    setInvoer("");
    invoerRef.current?.focus();
  }

  async function openGesprek(id: string) {
    setToonGesprekken(false);
    setZweeft(false);
    if (id === gesprekId && !bezig) return;
    stop();
    setLaden(true);
    setFout(null);
    try {
      const res = await fetch(`/api/assistent/gesprekken/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Openen van het gesprek mislukt.");
      const bekend: Record<string, Bron> = data.bronnen ?? {};
      setGesprekId(id);
      setTitel(typeof data.gesprek.titel === "string" ? data.gesprek.titel : null);
      setBeurten(
        (data.gesprek.berichten as { role: Beurt["role"]; content: string; bronnen?: string[]; stappen?: GesprekStap[]; creatives?: unknown }[]).map((b) => ({
          role: b.role,
          content: b.content,
          bronnen: (b.bronnen ?? []).map((naam) => bekend[naam]).filter(Boolean),
          stappen: b.stappen ?? [],
          creatives: leesCreatives(b.creatives),
        }))
      );
      plakRef.current = true;
      // Het stuk bij dit gesprek, als dat er is.
      setToonStuk(false);
      const stukRes = await fetch(`/api/assistent/stukken/${id}`);
      setStuk(stukRes.ok ? ((await stukRes.json()).stuk as Stuk) : null);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Openen van het gesprek mislukt.");
    } finally {
      setLaden(false);
    }
  }

  async function verwijder(id: string) {
    if (!window.confirm("Dit gesprek verwijderen?")) return;
    const res = await fetch(`/api/assistent/gesprekken/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setFout("Verwijderen van het gesprek mislukt.");
      return;
    }
    setGesprekken((huidig) => huidig.filter((g) => g.id !== id));
    if (id === gesprekId) nieuwGesprek();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    stel(invoer);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      stel(invoer);
    }
  }

  const heeftGesprek = beurten.length > 0;
  /** Bovenaan: de titel van het gesprek; tot die er is de eerste vraag; zonder gesprek "Assistent". */
  const eersteVraag = beurten.find((b) => b.role === "user")?.content.replace(/\s+/g, " ").trim();
  const kop = titel ?? (eersteVraag ? (eersteVraag.length > 60 ? `${eersteVraag.slice(0, 59)}…` : eersteVraag) : "Assistent");

  /**
   * Nieuw gesprek + eerdere gesprekken: in de kolom links (desktop), zwevend
   * over de chat als de kolom is ingeklapt, of over de chat heen (mobiel).
   */
  const gesprekkenLijst = (modus: "vast" | "zwevend" | "mobiel") => (
    <>
        <div className="flex gap-2 p-3">
          <button
            type="button"
            onClick={() => {
              nieuwGesprek();
              setZweeft(false);
            }}
            className="flex flex-1 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 font-heading text-xs uppercase tracking-wide transition-colors hover:border-psv-red-primary"
          >
            <MessageSquarePlus className="h-4 w-4 text-psv-red-primary" />
            Nieuw gesprek
          </button>
          {modus !== "mobiel" && (
            <button
              type="button"
              onClick={() => zetIngeklapt(modus === "vast")}
              aria-label={modus === "vast" ? "Gesprekken inklappen" : "Gesprekken vastzetten"}
              title={modus === "vast" ? "Inklappen: meer ruimte voor het stuk" : "Vastzetten"}
              className="rounded-md border border-border p-2 text-muted-foreground transition-colors hover:border-psv-red-primary hover:text-foreground"
            >
              {modus === "vast" ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </button>
          )}
        </div>

        <p className="px-5 pb-1 pt-3 font-heading text-xs uppercase tracking-wider text-muted-foreground">
          Eerdere gesprekken
        </p>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {gesprekken.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Je gesprekken verschijnen hier.</p>
          ) : (
            <ul className="space-y-0.5">
              {gesprekken.map((g) => (
                <li key={g.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => openGesprek(g.id)}
                    title={g.titel}
                    className={cn(
                      "w-full truncate rounded-md py-1.5 pl-2 pr-8 text-left text-sm transition-colors",
                      g.id === gesprekId
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    {metStuk.has(g.id) && (
                      <FileText className="mr-1.5 inline h-3.5 w-3.5 -translate-y-px text-psv-red-primary" aria-label="met stuk" />
                    )}
                    {g.titel}
                  </button>
                  <button
                    type="button"
                    onClick={() => verwijder(g.id)}
                    aria-label={`Gesprek verwijderen: ${g.titel}`}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-opacity hover:text-foreground focus:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>
    </>
  );

  return (
    <div className="relative flex h-full min-h-0">
      {ingeklapt ? (
        <>
          {/* Ingeklapt: een smalle strook; met de muis erop (of de knop) zweeft de lijst eroverheen. */}
          <div
            className="hidden w-11 flex-shrink-0 flex-col items-center gap-2 border-r border-border bg-background py-3 md:flex"
            onMouseEnter={toonZwevend}
            onMouseLeave={verbergZwevend}
          >
            <button
              type="button"
              onClick={() => zetIngeklapt(false)}
              onFocus={toonZwevend}
              aria-label="Gesprekken tonen"
              title="Gesprekken tonen"
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={nieuwGesprek}
              aria-label="Nieuw gesprek"
              title="Nieuw gesprek"
              className="rounded-md p-2 text-psv-red-primary transition-colors hover:bg-accent"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
            <History className="mt-1 h-4 w-4 text-muted-foreground" aria-hidden />
          </div>
          {zweeft && (
            <aside
              className="absolute inset-y-0 left-0 z-30 hidden w-72 animate-fade-up flex-col border-r border-border bg-background shadow-psv-lg md:flex"
              onMouseEnter={toonZwevend}
              onMouseLeave={verbergZwevend}
              aria-label="Gesprekken"
            >
              {gesprekkenLijst("zwevend")}
            </aside>
          )}
        </>
      ) : (
        <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-border bg-background md:flex">
          {gesprekkenLijst("vast")}
        </aside>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col">
        {stuk && toonStuk && (
          <StukPaneel stuk={stuk} onStuk={setStuk} onSluit={() => setToonStuk(false)} uitgeschakeld={bezig} className="absolute inset-0 z-20 xl:hidden" />
        )}
        {toonGesprekken && (
          <div className="absolute inset-0 z-30 flex flex-col bg-background md:hidden" role="dialog" aria-label="Gesprekken">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="font-heading text-xl uppercase tracking-tight">Gesprekken</p>
              <button
                type="button"
                onClick={() => setToonGesprekken(false)}
                aria-label="Gesprekken sluiten"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {gesprekkenLijst("mobiel")}
          </div>
        )}
        {/* Kop + (op kleinere schermen) de balk naar het stuk: blijven bovenaan staan. */}
        <div className="sticky top-0 z-10 flex-shrink-0 bg-background">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="h-4 w-4 flex-shrink-0 text-psv-red-primary" />
              <h1 className="truncate font-heading text-xl uppercase tracking-tight" title={kop}>
                {kop}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setToonGesprekken(true)}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 font-heading text-xs uppercase tracking-wide text-muted-foreground transition-colors hover:border-psv-red-primary hover:text-foreground md:hidden"
              >
                <History className="h-4 w-4 text-psv-red-primary" />
                Gesprekken
              </button>
              {heeftGesprek && (
                <button
                  type="button"
                  onClick={nieuwGesprek}
                  aria-label="Nieuw gesprek"
                  className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:border-psv-red-primary hover:text-foreground md:hidden"
                >
                  <MessageSquarePlus className="h-4 w-4" />
                </button>
              )}
            </div>
          </header>
          {stuk && (
            <button
              type="button"
              onClick={() => setToonStuk(true)}
              className="flex w-full items-center gap-3 border-b border-border bg-card px-4 py-2.5 text-left transition-colors hover:bg-accent/50 sm:px-6 xl:hidden"
            >
              <FileText className="h-5 w-5 flex-shrink-0 text-psv-red-primary" />
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-xs uppercase tracking-wide text-muted-foreground">
                  {STUK_SOORT_LABEL[stuk.soort]} · versie {stuk.versie}
                </span>
                <span className="block truncate font-sans text-sm font-semibold text-foreground">{stuk.titel}</span>
              </span>
              <span className="flex flex-shrink-0 items-center gap-1 font-heading text-xs uppercase tracking-wide text-psv-red-primary">
                Bekijken
                <ChevronRight className="h-4 w-4" />
              </span>
            </button>
          )}
        </div>

        <div ref={threadRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
          {laden ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Gesprek openen…
            </div>
          ) : !heeftGesprek ? (
            <LegeStaat onKies={stel} />
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
              {beurten.map((b, i) =>
                b.role === "user" ? (
                  <div key={i} className="flex animate-fade-up justify-end">
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-psv-red-primary px-4 py-2.5 text-sm text-white">
                      {b.content}
                    </p>
                  </div>
                ) : (
                  <Antwoord key={i} beurt={b} bezig={bezig && i === beurten.length - 1} />
                )
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border bg-background px-4 py-3 sm:px-6">
          <form onSubmit={onSubmit} className="mx-auto max-w-3xl">
            {heeftGesprek && !laden && <MaakKnoppen stuk={stuk} uit={bezig} onVraag={stel} />}
            {fout && (
              <p className="mb-2 rounded-md border-l-4 border-l-error bg-error-bg p-3 text-sm text-foreground">
                <span className="font-medium">Er ging iets mis:</span> {fout}
              </p>
            )}
            <div className="flex items-end gap-2 rounded-lg border border-border bg-card p-2 shadow-sm transition-colors focus-within:border-psv-red-primary focus-within:ring-1 focus-within:ring-psv-red-primary">
              <textarea
                ref={invoerRef}
                rows={1}
                value={invoer}
                onChange={(e) => setInvoer(e.target.value)}
                onKeyDown={onKeyDown}
                aria-label="Je vraag"
                placeholder={heeftGesprek ? "Stel een vervolgvraag…" : "Stel een vraag over de data in PSV Tools…"}
                className="max-h-48 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={bezig || !invoer.trim()}
                aria-label="Vraag versturen"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-psv-red-primary text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {bezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-center text-xs text-muted-foreground">
              De assistent leest alleen en kan zich vergissen. Twijfel je, check dan de bron.
            </p>
          </form>
        </div>
      </div>

      {stuk && (
        <StukPaneel stuk={stuk} onStuk={setStuk} uitgeschakeld={bezig} className={cn("hidden flex-shrink-0 border-l border-border xl:flex", ingeklapt ? "w-[62%]" : "w-[46%] max-w-3xl")} />
      )}
    </div>
  );
}
