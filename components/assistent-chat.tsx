"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowUp, Database, Loader2, MessageSquarePlus, Sparkles, Trash2 } from "lucide-react";
import { formatAnswer } from "@/components/chat-opmaak";
import { cn } from "@/lib/utils";
import type { GesprekSamenvatting } from "@/lib/kennisbank-gesprekken";

/**
 * De chat van de assistent: één gesprek over de databronnen van PSV Tools
 * heen. De server haalt de data op (`/api/assistent/chat`); de chat toont het
 * antwoord terwijl het binnenkomt en welke bronnen ervoor zijn geraadpleegd.
 */

const SUGGESTIES = [
  "Hoe loopt de verkoop van de eerstvolgende thuiswedstrijd?",
  "Waar gingen de vragen aan de FANdesk deze week over?",
  "Hoeveel plekken voor twee naast elkaar zijn er nog?",
  "Hoe deel ik een bestand met persoonsgegevens?",
];

interface Bron {
  naam: string;
  label: string;
  href: string;
}

interface Beurt {
  role: "user" | "assistant";
  content: string;
  bronnen?: Bron[];
}

function Antwoord({ beurt, bezig }: { beurt: Beurt; bezig: boolean }) {
  const bronnen = beurt.bronnen ?? [];
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
    </div>
  );
}

function LegeStaat({ onKies }: { onKies: (vraag: string) => void }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10 text-center">
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
  const [gesprekken, setGesprekken] = useState<GesprekSamenvatting[]>([]);
  const [gesprekId, setGesprekId] = useState<string | null>(null);
  const [beurten, setBeurten] = useState<Beurt[]>([]);
  const [invoer, setInvoer] = useState("");
  const [bezig, setBezig] = useState(false);
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

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
    } catch {
      // De geschiedenis is bijzaak; de chat werkt ook zonder.
    }
  }, []);

  useEffect(() => {
    laadGesprekken();
    return () => abortRef.current?.abort();
  }, [laadGesprekken]);

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

      // Het antwoord komt binnen als regels JSON; een regel kan over twee stukken verdeeld zijn.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let rest = "";
      let antwoord = "";
      const bronnen: Bron[] = [];
      const verwerk = (regel: string) => {
        if (!regel.trim()) return;
        const gebeurtenis = JSON.parse(regel) as { t: string; d?: string } & Partial<Bron>;
        if (gebeurtenis.t === "tekst") antwoord += gebeurtenis.d ?? "";
        else if (gebeurtenis.t === "wis") antwoord = "";
        else if (gebeurtenis.t === "bron" && gebeurtenis.naam && gebeurtenis.label && gebeurtenis.href)
          bronnen.push({ naam: gebeurtenis.naam, label: gebeurtenis.label, href: gebeurtenis.href });
        else if (gebeurtenis.t === "fout") throw new Error(gebeurtenis.d || "Er ging iets mis.");
      };
      while (true) {
        const { done, value } = await reader.read();
        if (controller.signal.aborted) return;
        rest += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const regels = rest.split("\n");
        rest = done ? "" : (regels.pop() ?? "");
        regels.forEach(verwerk);
        setBeurten([...geschiedenis, { role: "assistant", content: antwoord, bronnen: [...bronnen] }]);
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
    setBeurten([]);
    setFout(null);
    setInvoer("");
    invoerRef.current?.focus();
  }

  async function openGesprek(id: string) {
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
      setBeurten(
        (data.gesprek.berichten as { role: Beurt["role"]; content: string; bronnen?: string[] }[]).map((b) => ({
          role: b.role,
          content: b.content,
          bronnen: (b.bronnen ?? []).map((naam) => bekend[naam]).filter(Boolean),
        }))
      );
      plakRef.current = true;
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

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-border bg-background md:flex">
        <div className="p-3">
          <button
            type="button"
            onClick={nieuwGesprek}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-3 py-2 font-heading text-xs uppercase tracking-wide transition-colors hover:border-psv-red-primary"
          >
            <MessageSquarePlus className="h-4 w-4 text-psv-red-primary" />
            Nieuw gesprek
          </button>
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
                    {g.titel}
                  </button>
                  <button
                    type="button"
                    onClick={() => verwijder(g.id)}
                    aria-label={`Gesprek verwijderen: ${g.titel}`}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-psv-red-primary" />
            <h1 className="font-heading text-xl uppercase tracking-tight">Assistent</h1>
          </div>
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
        </header>

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
                  <div key={i} className="flex justify-end">
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
    </div>
  );
}
