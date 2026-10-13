"use client";

import { useEffect, useState } from "react";
import { Check, Flag } from "lucide-react";
import type { Melding } from "@/lib/kennisbank-meldingen";

const datum = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" });

/**
 * Vragen die collega's vanuit de chat als ontbrekend hebben gemeld. Laat zien
 * welke inhoud de kennisbank nog mist; "Afgehandeld" haalt een melding weg
 * zodra die inhoud erin staat. Toont niets als er niets gemeld is.
 */
export function Meldingen() {
  const [meldingen, setMeldingen] = useState<Melding[]>([]);
  const [bezig, setBezig] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/kennisbank/meldingen")
      .then((res) => (res.ok ? res.json() : { meldingen: [] }))
      .then((data) => setMeldingen(data.meldingen ?? []))
      .catch(() => setMeldingen([]));
  }, []);

  async function afhandelen(id: string) {
    setBezig(id);
    try {
      const res = await fetch(`/api/kennisbank/meldingen/${id}`, { method: "DELETE" });
      if (res.ok) setMeldingen((huidig) => huidig.filter((m) => m.id !== id));
    } finally {
      setBezig(null);
    }
  }

  if (meldingen.length === 0) return null;

  return (
    <section className="mb-10 rounded-lg border border-border border-l-4 border-l-warning bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Flag className="h-4 w-4 text-warning" />
        <h2 className="font-heading text-xs uppercase tracking-wider">
          Gemeld als ontbrekend ({meldingen.length})
        </h2>
      </div>
      <ul className="divide-y divide-border">
        {meldingen.map((m) => (
          <li key={m.id} className="flex items-start justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{m.vraag}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {m.createdByName ?? m.createdBy} · {datum.format(new Date(m.createdAt))}
              </p>
            </div>
            <button
              type="button"
              onClick={() => afhandelen(m.id)}
              disabled={bezig === m.id}
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1 font-heading text-xs uppercase tracking-wide text-muted-foreground transition-colors hover:border-success hover:text-success disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              Afgehandeld
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
