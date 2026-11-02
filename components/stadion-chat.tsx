"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, MessageSquare, Send, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** **vet** binnen een regel. */
function inline(text: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

/** Alinea's en lijstjes met "- "; meer opmaak vraagt de chat niet. */
function Answer({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={blocks.length} className="list-disc pl-5 space-y-0.5">
          {list.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>
      );
      list = [];
    }
  };
  for (const line of text.split("\n")) {
    const item = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (item) {
      list.push(item[1]);
      continue;
    }
    flush();
    if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <div className="space-y-2">{blocks.map((block, i) => <Fragment key={i}>{block}</Fragment>)}</div>;
}

/**
 * Vragen stellen over de data die op de pagina staat. De server rekent de data
 * zelf uit (`/api/ticketing-stadion/vraag`); hier gaan alleen de vragen heen,
 * plus welke wedstrijd en welke vergelijkingen er in beeld zijn.
 */
export function StadionChat({
  eventId,
  compareIds = [],
  suggestions,
}: {
  eventId?: string;
  compareIds?: string[];
  suggestions: string[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  async function ask(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setQuestion("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ticketing-stadion/vraag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // De laatste tien vragen en antwoorden zijn genoeg context voor een vervolgvraag.
        body: JSON.stringify({ eventId, compareIds, messages: next.slice(-19) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      setMessages((current) => [...current, { role: "assistant", content: data.answer }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      // De vraag terugzetten, zodat hij opnieuw te sturen is.
      setMessages((current) => current.slice(0, -1));
      setQuestion(content);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Vraag het de data
            </h2>
            <p className="text-sm text-muted-foreground max-w-3xl">
              Stel een vraag over wat op deze pagina staat. Het antwoord komt van AI: controleer belangrijke getallen.
            </p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setError(null);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-heading uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Opnieuw
            </button>
          )}
        </div>

        {messages.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => ask(suggestion)}
                disabled={busy}
                className="tag tag--outlined normal-case tracking-normal font-sans text-left"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : (
          <div ref={listRef} className="max-h-[28rem] overflow-y-auto space-y-3 pr-1" aria-live="polite">
            {messages.map((message, i) => (
              <div key={i} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${
                    message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  {message.role === "user" ? message.content : <Answer text={message.content} />}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Even rekenen…
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-error">{error}</p>}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            ask(question);
          }}
          className="flex gap-2"
        >
          <label htmlFor="stadion-vraag" className="sr-only">
            Je vraag
          </label>
          <input
            id="stadion-vraag"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Bijvoorbeeld: hoeveel tweetjes zijn er nog in Noord?"
            maxLength={2000}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button type="submit" disabled={busy || !question.trim()} className="btn btn--medium shrink-0 h-10 py-0 inline-flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="sr-only sm:not-sr-only">Vraag</span>
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
