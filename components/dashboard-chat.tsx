"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ASSISTENT_HREF, SUGGESTIES, zetEersteVraag } from "@/lib/assistent-start";

/** Hoe lang de overgang naar de assistent duurt voordat de pagina wisselt. */
const OVERGANG_MS = 320;

/**
 * Het startpunt op het dashboard: één invoerveld, zoals bij ChatGPT en
 * Claude. Na versturen schuift het veld naar beneden en open je de
 * assistent, waar je vraag al verstuurd is en het antwoord binnenkomt.
 */
export function DashboardChat({ greeting, firstName }: { greeting: string; firstName: string }) {
  const router = useRouter();
  const [invoer, setInvoer] = useState("");
  const [verstuurd, setVerstuurd] = useState(false);
  const invoerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    router.prefetch(ASSISTENT_HREF);
    invoerRef.current?.focus();
  }, [router]);

  useEffect(() => {
    const el = invoerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [invoer]);

  function verstuur(vraag: string) {
    const q = vraag.trim();
    if (!q || verstuurd) return;
    zetEersteVraag(q);
    setInvoer(q);
    setVerstuurd(true);
    const rustig = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => router.push(ASSISTENT_HREF), rustig ? 0 : OVERGANG_MS);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    verstuur(invoer);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      verstuur(invoer);
    }
  }

  // De begroeting en suggesties vervagen omhoog; het invoerveld zakt naar
  // waar het in de assistent staat: onderaan.
  const weg = "transition-all duration-300 ease-out motion-reduce:transition-none";

  return (
    <div className="w-full">
      <header className={cn("mb-8 text-center", weg, verstuurd && "-translate-y-4 opacity-0")}>
        <h1 className="font-heading text-4xl uppercase tracking-tight sm:text-5xl">
          {greeting}
          {firstName && (
            <>
              {" "}
              <span className="text-psv-red-primary">{firstName}</span>
            </>
          )}
        </h1>
        <p className="mt-2 text-lg text-muted-foreground">Waar kan Tools je mee helpen?</p>
      </header>

      <form
        onSubmit={onSubmit}
        className={cn(
          "relative z-10 mx-auto max-w-3xl transition-all duration-300 ease-in motion-reduce:transition-none",
          verstuurd && "translate-y-[25vh] opacity-0"
        )}
      >
        <div className="rounded-xl border border-border bg-card p-3 shadow-psv-lg transition-colors focus-within:border-psv-red-primary focus-within:ring-1 focus-within:ring-psv-red-primary">
          <textarea
            ref={invoerRef}
            rows={2}
            value={invoer}
            onChange={(e) => setInvoer(e.target.value)}
            onKeyDown={onKeyDown}
            readOnly={verstuurd}
            aria-label="Je vraag aan de assistent"
            placeholder="Vraag iets over ticketing, de FANdesk, campagnes of de kennisbank…"
            className="max-h-60 w-full resize-none bg-transparent px-2 py-1.5 text-base outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between gap-3 pl-2">
            <p className="hidden text-xs text-muted-foreground sm:block">
              Enter om te versturen, Shift + Enter voor een nieuwe regel
            </p>
            <button
              type="submit"
              disabled={verstuurd || !invoer.trim()}
              aria-label="Vraag versturen"
              className="ml-auto flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-psv-red-primary text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {verstuurd ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </form>

      <div
        className={cn(
          "mx-auto mt-5 flex max-w-3xl flex-wrap justify-center gap-2 transition-opacity duration-150 motion-reduce:transition-none",
          verstuurd && "opacity-0"
        )}
      >
        {SUGGESTIES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => verstuur(s)}
            disabled={verstuurd}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-psv-red-primary hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
