"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, UserPlus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidEmail, normalizeEmail } from "@/lib/access";
import type { Collega, GedeeldMet } from "@/lib/stukken/collegas";

/**
 * Een stuk delen met collega's op naam: zoek een collega die in PSV Tools
 * zit, en hij ziet het stuk in Mijn documenten onder "Gedeeld met mij". Gebruikt
 * in het paneel naast de chat en op de pagina Mijn documenten.
 */
export function DelenMetCollegas({
  stukId,
  gedeeldMet,
  onWijziging,
}: {
  stukId: string;
  gedeeldMet: GedeeldMet[];
  onWijziging: (gedeeldMet: GedeeldMet[]) => void;
}) {
  const [zoek, setZoek] = useState("");
  const [suggesties, setSuggesties] = useState<Collega[]>([]);
  const [open, setOpen] = useState(false);
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    const ctrl = new AbortController();
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/assistent/collegas?q=${encodeURIComponent(zoek)}`, { signal: ctrl.signal });
        const data = await res.json().catch(() => ({}));
        setSuggesties(res.ok ? (data.collegas ?? []) : []);
      } catch {
        // Afgebroken of offline: geen suggesties, typen blijft werken.
      }
    }, 200);
    return () => {
      ctrl.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [zoek, open]);

  const al = new Set(gedeeldMet.map((c) => c.email));
  const getypt = normalizeEmail(zoek);
  const kandidaten = suggesties.filter((c) => !al.has(c.email));
  // Staat de collega niet in de lijst (nog nooit ingelogd), dan kan het met een volledig e-mailadres.
  const losAdres = isValidEmail(getypt) && !al.has(getypt) && !kandidaten.some((c) => c.email === getypt);

  async function voegToe(collega: Collega) {
    setFout(null);
    setBezig(collega.email);
    try {
      const res = await fetch(`/api/assistent/stukken/${stukId}/collegas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collega),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Delen is mislukt.");
      onWijziging(data.gedeeldMet ?? []);
      setZoek("");
      setOpen(false);
    } catch (err) {
      setFout((err as Error).message);
    } finally {
      setBezig(null);
    }
  }

  async function haalWeg(collega: GedeeldMet) {
    if (!confirm(`Stoppen met delen met ${collega.naam ?? collega.email}?`)) return;
    setFout(null);
    setBezig(collega.email);
    try {
      const res = await fetch(`/api/assistent/stukken/${stukId}/collegas`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: collega.email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Stoppen met delen is mislukt.");
      onWijziging(data.gedeeldMet ?? []);
    } catch (err) {
      setFout((err as Error).message);
    } finally {
      setBezig(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="form-group relative">
        <Label htmlFor={`collega-${stukId}`} className="form-label">
          Delen met collega&apos;s
        </Label>
        <Input
          id={`collega-${stukId}`}
          value={zoek}
          placeholder="Zoek op naam of e-mailadres"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setZoek(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter") {
              e.preventDefault();
              const eerste = kandidaten[0] ?? (losAdres ? { email: getypt } : null);
              if (eerste) voegToe(eerste);
            }
          }}
        />
        <p className="form-hint">Ze zien het stuk in Mijn documenten, altijd de nieuwste versie, en kunnen het alleen lezen.</p>
        {open && (kandidaten.length > 0 || losAdres) && (
          <ul className="absolute left-0 right-0 top-[4.25rem] z-20 max-h-64 overflow-y-auto border border-border bg-card shadow-lg" role="listbox">
            {kandidaten.map((c) => (
              <li key={c.email}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => voegToe(c)}
                >
                  <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate">{c.naam ?? c.email}</span>
                    {c.naam && <span className="block truncate text-xs text-muted-foreground">{c.email}</span>}
                  </span>
                </button>
              </li>
            ))}
            {losAdres && (
              <li>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => voegToe({ email: getypt })}
                >
                  <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  Delen met {getypt}
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {gedeeldMet.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Gedeeld met">
          {gedeeldMet.map((c) => (
            <li key={c.email} className="flex items-center gap-1 border border-border bg-background py-0.5 pl-2 pr-0.5 text-xs" title={c.email}>
              {c.naam ?? c.email}
              <button
                type="button"
                onClick={() => haalWeg(c)}
                disabled={bezig === c.email}
                className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
                aria-label={`Stoppen met delen met ${c.naam ?? c.email}`}
              >
                {bezig === c.email ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {bezig && !gedeeldMet.some((c) => c.email === bezig) && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Delen…
        </p>
      )}
      {fout && <p className="form-error">{fout}</p>}
    </div>
  );
}
