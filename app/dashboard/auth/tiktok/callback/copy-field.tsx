"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Toont één waarde uit de TikTok-uitwisseling met een kopieerknop.
 *
 * Een access token staat standaard gemaskeerd: deze pagina wordt tijdens het
 * instellen makkelijk gedeeld of gescreenshot, en de token verloopt niet.
 * Kopiëren werkt ook zonder hem zichtbaar te maken.
 */
export function CopyField({
  label,
  value,
  masked = false,
}: {
  label: string;
  value: string;
  masked?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(!masked);

  const display = shown
    ? value
    : `${value.slice(0, 6)}${"•".repeat(20)}${value.slice(-4)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Het klembord kan geblokkeerd zijn; de waarde blijft dan selecteerbaar.
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="font-heading text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        {/* Gemaskeerd is de tekst bewust niet te selecteren: anders kopieer je
            de bolletjes in plaats van de waarde. De knop kopieert altijd echt. */}
        <code
          className={cn(
            "min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm",
            !shown && "select-none"
          )}
        >
          {display}
        </code>
        {masked && (
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? "Verbergen" : "Tonen"}
            className="shrink-0 rounded-md border border-border p-2 transition-colors hover:bg-muted"
          >
            {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          aria-label="Kopiëren"
          className={cn(
            "shrink-0 rounded-md border p-2 transition-colors",
            copied ? "border-success text-success" : "border-border hover:bg-muted"
          )}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
