"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Loader2, MessageSquarePlus, Sparkles } from "lucide-react";
import { formatAnswer } from "@/components/chat-opmaak";
import type { PaidAdsResponse } from "@/lib/paid-ads/types";
import { cn } from "@/lib/utils";

/** Vragen waar collega's die niet dagelijks in het dashboard werken mee kunnen beginnen. */
const SUGGESTIES = [
  "Wat heeft het deze periode opgeleverd, en wat heeft het gekost?",
  "Welke koopreden werkt het best?",
  "Welke creatives doen het goed, en welke kunnen uit?",
  "Hoe staan de tests ervoor?",
  "Zitten we onder ons CPA-doel?",
];

interface Bericht {
  role: "user" | "assistant";
  content: string;
  fout?: boolean;
}

/**
 * Een vraag stellen over wat het dashboard nu toont: de gekozen periode en
 * filters gaan mee. Het antwoord komt binnen terwijl het geschreven wordt;
 * vervolgvragen gaan over hetzelfde gesprek.
 */
export function VraagPaneel({
  data,
  periode,
  filters,
}: {
  data: PaidAdsResponse | null;
  periode: string;
  filters: string;
}) {
  const [berichten, setBerichten] = useState<Bericht[]>([]);
  const [invoer, setInvoer] = useState("");
  const [bezig, setBezig] = useState(false);
  const afbreken = useRef<AbortController | null>(null);
  const invoerRef = useRef<HTMLTextAreaElement>(null);
  const hasData = Boolean(data?.campaigns.length);

  useEffect(() => () => afbreken.current?.abort(), []);

  useEffect(() => {
    const el = invoerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [invoer]);

  async function vraag(tekst: string) {
    const q = tekst.trim();
    if (!q || bezig || !data || !hasData) return;
    const geschiedenis = berichten.filter((b) => !b.fout);
    const nieuw: Bericht[] = [...geschiedenis, { role: "user", content: q }];
    setBerichten([...nieuw, { role: "assistant", content: "" }]);
    setInvoer("");
    setBezig(true);

    const controller = new AbortController();
    afbreken.current = controller;
    const zetAntwoord = (content: string, fout = false) =>
      setBerichten([...nieuw, { role: "assistant", content, fout }]);

    try {
      const res = await fetch("/api/paid-ads/vraag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          berichten: nieuw.map(({ role, content }) => ({ role, content })),
          data: voorVraag(data),
          periode,
          filters,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Het antwoord kon niet worden opgehaald.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let antwoord = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const regels = buffer.split("\n");
        buffer = regels.pop() ?? "";
        for (const regel of regels) {
          if (!regel.trim()) continue;
          const bericht = JSON.parse(regel) as { t: string; d: string };
          if (bericht.t === "tekst") {
            antwoord += bericht.d;
            zetAntwoord(antwoord);
          } else if (bericht.t === "fout") {
            throw new Error(bericht.d);
          }
        }
      }
      if (!antwoord.trim()) throw new Error("Er kwam geen antwoord.");
    } catch (err) {
      if (controller.signal.aborted) return;
      zetAntwoord(err instanceof Error ? err.message : "Er ging iets mis.", true);
    } finally {
      if (afbreken.current === controller) afbreken.current = null;
      setBezig(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    vraag(invoer);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      vraag(invoer);
    }
  }

  function opnieuw() {
    afbreken.current?.abort();
    setBerichten([]);
    setBezig(false);
    invoerRef.current?.focus();
  }

  return (
    <section className="rounded-md border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-psv-red-primary" />
          <div>
            <h2 className="font-heading text-lg uppercase leading-tight">Vraag het dashboard</h2>
            <p className="text-xs text-muted-foreground">
              Stel je vraag in gewone taal. Het antwoord gaat over {periode.toLowerCase()}
              {filters !== "geen" ? `, ${filters}` : ""}.
            </p>
          </div>
        </div>
        {berichten.length > 0 && (
          <button
            type="button"
            onClick={opnieuw}
            className="inline-flex shrink-0 items-center gap-1.5 font-heading text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Nieuwe vraag
          </button>
        )}
      </div>

      {berichten.length > 0 && (
        <div className="mt-4 max-h-[480px] space-y-4 overflow-y-auto pr-1" aria-live="polite">
          {berichten.map((b, i) =>
            b.role === "user" ? (
              <p key={i} className="ml-auto w-fit max-w-[85%] rounded-md bg-muted px-3 py-2 text-sm">
                {b.content}
              </p>
            ) : (
              <div
                key={i}
                className={cn(
                  "border-l-2 pl-3 text-sm leading-relaxed",
                  b.fout ? "border-destructive text-destructive" : "border-psv-red-primary"
                )}
              >
                {b.content ? (
                  b.fout ? b.content : formatAnswer(b.content)
                ) : (
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Even rekenen…
                  </span>
                )}
              </div>
            )
          )}
        </div>
      )}

      {berichten.length === 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => vraag(s)}
              disabled={!hasData}
              className="rounded-full border border-border px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-psv-red-primary hover:text-foreground disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-4 flex items-end gap-2">
        <textarea
          ref={invoerRef}
          rows={1}
          value={invoer}
          onChange={(e) => setInvoer(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={!hasData}
          maxLength={2000}
          placeholder={
            hasData
              ? berichten.length > 0
                ? "Stel een vervolgvraag"
                : "Bijv. wat kost een kaartverkoop via Meta, en is dat goed?"
              : "Beschikbaar zodra er campagnedata is"
          }
          className="min-h-[40px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!hasData || bezig || !invoer.trim()}
          aria-label="Vraag versturen"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-psv-red-primary text-white transition-opacity disabled:opacity-40"
        >
          {bezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </form>
    </section>
  );
}

/**
 * Wat er meegaat naar de server: zonder de ruwe dagreeks per campagne, de
 * leeftijdsuitsplitsing en vorig jaar. Die gebruikt het antwoord niet, en zo
 * blijft het verzoek klein, ook bij een heel seizoen.
 */
function voorVraag(data: PaidAdsResponse): PaidAdsResponse {
  return {
    ...data,
    campaignDaily: [],
    demographics: [],
    benchmarks: { ...data.benchmarks, yearAgoCampaigns: null },
  };
}
