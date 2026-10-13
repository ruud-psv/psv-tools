"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import {
  ArrowUp,
  BookOpen,
  Check,
  FileText,
  Flag,
  Loader2,
  MessageSquarePlus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveBron } from "@/lib/kennisbank";
import { FEEDBACK_FORM_URL } from "@/components/feedback-tab";
import type { GesprekBericht, GesprekSamenvatting } from "@/lib/kennisbank-gesprekken";

const SUGGESTIES = [
  "Hoe maak ik een doelgroep aan?",
  "Hoe verstuur ik een e-mail?",
  "Hoe bereik ik seizoenkaarthouders?",
  "Hoe maak ik een redirect aan?",
];

/** De assistent sluit elk antwoord af met een regel `BRONNEN: slug#sectie, …` of `BRONNEN: geen`. */
const MARKER = "BRONNEN:";

function splitAntwoord(raw: string): { tekst: string; bronnen: string[]; geen: boolean } {
  const i = raw.lastIndexOf(MARKER);
  if (i === -1) {
    // Tijdens het binnenkomen: verberg een half geschreven markering ("BRON…").
    const regelStart = raw.lastIndexOf("\n") + 1;
    const laatsteRegel = raw.slice(regelStart).trim();
    const tekst = laatsteRegel && MARKER.startsWith(laatsteRegel) ? raw.slice(0, regelStart) : raw;
    return { tekst: tekst.trim(), bronnen: [], geen: false };
  }
  const refs = raw
    .slice(i + MARKER.length)
    .split(/[,\n]/)
    .map((r) => r.trim().replace(/^\[?bron:\s*/i, "").replace(/\]$/, ""))
    .filter(Boolean);
  const geen = refs.length === 0 || refs.every((r) => r.toLowerCase() === "geen");
  return { tekst: raw.slice(0, i).trim(), bronnen: geen ? [] : refs, geen };
}

/** **vet**, [tekst](url) en losse links binnen een regel. */
function inline(text: string) {
  const parts = text.split(
    /(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s)]*[^\s).,;:!?])/g
  );
  const linkClass = "text-psv-red-primary underline underline-offset-2 hover:opacity-80";
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    const md = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (md)
      return (
        <a key={i} href={md[2]} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {md[1]}
        </a>
      );
    if (/^https?:\/\//.test(part))
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={`${linkClass} break-all`}>
          {part}
        </a>
      );
    return <span key={i}>{part}</span>;
  });
}

/** Minimale formatter: alinea's, "- " opsommingen en "1. " stappen. */
function formatAnswer(text: string) {
  const blocks: React.ReactNode[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  const flushList = (key: string) => {
    if (!list) return;
    const items = list.items.map((li, i) => <li key={i}>{inline(li)}</li>);
    blocks.push(
      list.type === "ul" ? (
        <ul key={key} className="list-disc space-y-1 pl-5">{items}</ul>
      ) : (
        <ol key={key} className="list-decimal space-y-1 pl-5">{items}</ol>
      )
    );
    list = null;
  };

  text.split("\n").forEach((line, i) => {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    const stap = trimmed.match(/^\d+[.)]\s+(.*)$/);
    const item = bullet ?? stap;
    if (item) {
      const type = bullet ? "ul" : "ol";
      if (list && list.type !== type) flushList(`l-${i}`);
      if (!list) list = { type, items: [] };
      list.items.push(item[1]);
    } else {
      flushList(`l-${i}`);
      if (trimmed) blocks.push(<p key={`p-${i}`}>{inline(trimmed)}</p>);
    }
  });
  flushList("l-end");
  return blocks;
}

function Antwoord({
  raw,
  bezig,
  gemeld,
  onMeld,
}: {
  raw: string;
  bezig: boolean;
  gemeld: boolean;
  onMeld: () => void;
}) {
  const { tekst, bronnen, geen } = splitAntwoord(raw);

  if (!tekst && bezig) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Bezig met zoeken in de kennisbank…
      </div>
    );
  }

  const links = bronnen
    .map(resolveBron)
    .filter((l): l is { href: string; label: string } => l !== null)
    .filter((l, i, alle) => alle.findIndex((x) => x.href === l.href) === i);
  const ontbreekt = geen && !bezig;

  return (
    <div
      className={cn(
        "space-y-3 text-sm leading-relaxed text-foreground",
        ontbreekt && "border-l-4 border-l-warning bg-warning-bg py-3 pl-4 pr-3"
      )}
    >
      <div className="space-y-2">{formatAnswer(tekst)}</div>

      {links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-psv-red-primary hover:text-foreground"
            >
              <FileText className="h-3.5 w-3.5" />
              {l.label}
            </Link>
          ))}
        </div>
      )}

      {!bezig &&
        (gemeld ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-success" />
            Gemeld, dank je
          </p>
        ) : ontbreekt ? (
          <button
            type="button"
            onClick={onMeld}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 font-heading text-xs uppercase tracking-wide transition-colors hover:border-warning"
          >
            <Flag className="h-3.5 w-3.5 text-warning" />
            Meld als ontbrekend
          </button>
        ) : (
          <a
            href={FEEDBACK_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Flag className="h-3 w-3" />
            Mist er iets? Meld het
            <span className="sr-only">(opent het feedbackformulier in een nieuw tabblad)</span>
          </a>
        ))}
    </div>
  );
}

function LegeStaat({ onKies }: { onKies: (vraag: string) => void }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10 text-center">
      <Sparkles className="mb-3 h-7 w-7 text-psv-red-primary" />
      <h2 className="font-heading text-2xl uppercase tracking-tight">Waar kan ik je mee helpen?</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Stel je vraag over Maileon, TwoCircles, Playable, Typeform of een ander platform.
        Antwoorden komen uit de PSV-kennisbank, met een link naar de bron.
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

export function KennisbankChat() {
  const [gesprekken, setGesprekken] = useState<GesprekSamenvatting[]>([]);
  const [gesprekId, setGesprekId] = useState<string | null>(null);
  const [beurten, setBeurten] = useState<GesprekBericht[]>([]);
  const [invoer, setInvoer] = useState("");
  const [bezig, setBezig] = useState(false);
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [gemeld, setGemeld] = useState<Set<number>>(new Set());

  const abortRef = useRef<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const invoerRef = useRef<HTMLTextAreaElement>(null);
  /** Meescrollen zolang je onderaan staat; wie omhoog scrollt, blijft daar. */
  const plakRef = useRef(true);

  const laadGesprekken = useCallback(async () => {
    try {
      const res = await fetch("/api/kennisbank/gesprekken");
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
    const geschiedenis: GesprekBericht[] = [...vorige, { role: "user", content: q }];
    setFout(null);
    setInvoer("");
    setBeurten([...geschiedenis, { role: "assistant", content: "" }]);
    setBezig(true);
    plakRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/kennisbank/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gesprekId, messages: geschiedenis }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Er ging iets mis.");
      }
      const id = res.headers.get("X-Gesprek-Id");
      if (id) setGesprekId(id);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let antwoord = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (controller.signal.aborted) return;
        antwoord += decoder.decode(value, { stream: true });
        setBeurten([...geschiedenis, { role: "assistant", content: antwoord }]);
      }
      antwoord += decoder.decode();
      if (!antwoord.trim()) throw new Error("Er kwam geen antwoord terug.");
      setBeurten([...geschiedenis, { role: "assistant", content: antwoord }]);
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
    setGemeld(new Set());
    invoerRef.current?.focus();
  }

  async function openGesprek(id: string) {
    if (id === gesprekId && !bezig) return;
    stop();
    setLaden(true);
    setFout(null);
    setGemeld(new Set());
    try {
      const res = await fetch(`/api/kennisbank/gesprekken/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Openen van het gesprek mislukt.");
      setGesprekId(id);
      setBeurten(data.gesprek.berichten);
      plakRef.current = true;
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Openen van het gesprek mislukt.");
    } finally {
      setLaden(false);
    }
  }

  async function verwijder(id: string) {
    if (!window.confirm("Dit gesprek verwijderen?")) return;
    const res = await fetch(`/api/kennisbank/gesprekken/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setFout("Verwijderen van het gesprek mislukt.");
      return;
    }
    setGesprekken((huidig) => huidig.filter((g) => g.id !== id));
    if (id === gesprekId) nieuwGesprek();
  }

  async function meld(index: number) {
    const vraag = beurten[index - 1]?.content;
    if (!vraag) return;
    setGemeld((huidig) => new Set(huidig).add(index));
    try {
      const res = await fetch("/api/kennisbank/meldingen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vraag, antwoord: splitAntwoord(beurten[index].content).tekst }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setGemeld((huidig) => {
        const volgende = new Set(huidig);
        volgende.delete(index);
        return volgende;
      });
      setFout("Melden mislukt. Probeer het opnieuw.");
    }
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
        <div className="space-y-1 p-3">
          <button
            type="button"
            onClick={nieuwGesprek}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-3 py-2 font-heading text-xs uppercase tracking-wide transition-colors hover:border-psv-red-primary"
          >
            <MessageSquarePlus className="h-4 w-4 text-psv-red-primary" />
            Nieuw gesprek
          </button>
          <Link
            href="/dashboard/kennisbank/documentatie"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            <BookOpen className="h-4 w-4" />
            Documentatie
          </Link>
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
            <h1 className="font-heading text-xl uppercase tracking-tight">Kennisbank</h1>
          </div>
          <div className="flex items-center gap-2">
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
            <Link
              href="/dashboard/kennisbank/documentatie"
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 font-heading text-xs uppercase tracking-wide transition-colors hover:border-psv-red-primary"
            >
              <BookOpen className="h-4 w-4" />
              Bekijk documentatie
            </Link>
          </div>
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
                  <Antwoord
                    key={i}
                    raw={b.content}
                    bezig={bezig && i === beurten.length - 1}
                    gemeld={gemeld.has(i)}
                    onMeld={() => meld(i)}
                  />
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
                placeholder={heeftGesprek ? "Stel een vervolgvraag…" : "Stel een vraag over een tool of proces…"}
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
              Antwoorden komen uit de kennisbank. Twijfel je, check dan de bron.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
