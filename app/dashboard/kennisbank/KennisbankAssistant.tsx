"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import { Sparkles, ArrowUp, Loader2, X } from "lucide-react";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

/** Minimale formatter: **vet** en "- " opsommingen, regels als paragrafen. */
function formatAnswer(text: string) {
  const withBold = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        <span key={i}>{part}</span>
      )
    );

  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flushList = (key: string) => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={key} className="list-disc pl-5 space-y-1">
        {list.map((li, i) => (
          <li key={i}>{withBold(li)}</li>
        ))}
      </ul>
    );
    list = [];
  };

  text.split("\n").forEach((line, i) => {
    const trimmed = line.trim();
    if (/^[-*]\s+/.test(trimmed)) {
      list.push(trimmed.replace(/^[-*]\s+/, ""));
    } else {
      flushList(`ul-${i}`);
      if (trimmed) blocks.push(<p key={`p-${i}`}>{withBold(trimmed)}</p>);
    }
  });
  flushList("ul-end");
  return blocks;
}

const SUGGESTIONS = [
  "Welke waardes sluit ik uit bij een seizoenkaart-selectie in TwoCircles?",
  "Wat is het formaat van de Maileon-header?",
  "Hoe ziet de taxonomie van een Typeform-formulier eruit?",
];

export function KennisbankAssistant() {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    setInput("");
    const nextTurns: Turn[] = [...turns, { role: "user", content: q }];
    setTurns(nextTurns);
    setLoading(true);
    try {
      const res = await fetch("/api/kennisbank/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextTurns }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Er ging iets mis.");
      setTurns([...nextTurns, { role: "assistant", content: data.answer }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Er ging iets mis.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    ask(input);
  }

  function reset() {
    setTurns([]);
    setError(null);
    setInput("");
  }

  const hasThread = turns.length > 0;

  return (
    <div className="mb-8">
      <form onSubmit={onSubmit} className="relative">
        <Sparkles className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-psv-red-primary" />
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Stel een vraag over de kennisbank…"
          className="w-full rounded-lg border border-border bg-card py-3 pl-10 pr-12 text-sm shadow-sm outline-none transition-colors focus:border-psv-red-primary focus:ring-1 focus:ring-psv-red-primary"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          aria-label="Vraag stellen"
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md bg-psv-red-primary text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </form>

      {!hasThread && !error && (
        <div className="mt-2 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-psv-red-primary hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {(hasThread || error) && (
        <div className="mt-3 rounded-lg border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="font-heading text-xs uppercase tracking-wider text-muted-foreground">
              Kennisbank-assistent
            </span>
            <button
              type="button"
              onClick={reset}
              aria-label="Gesprek wissen"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div ref={threadRef} className="max-h-96 space-y-4 overflow-y-auto px-4 py-4">
            {turns.map((turn, i) =>
              turn.role === "user" ? (
                <p key={i} className="text-sm font-medium">
                  {turn.content}
                </p>
              ) : (
                <div key={i} className="space-y-2 text-sm text-muted-foreground">
                  {formatAnswer(turn.content)}
                </div>
              )
            )}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Bezig met zoeken in de kennisbank…
              </div>
            )}
            {error && (
              <p className="rounded-md border-l-4 border-l-error bg-error-bg p-3 text-sm text-foreground">
                <span className="font-medium">Er ging iets mis:</span> {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
