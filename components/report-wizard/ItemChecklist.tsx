"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * Doorzoekbare, aanvinkbare lijst van live opgehaalde items. `load` levert de
 * beschikbare items voor de huidige context; wanneer `depKey` verandert wordt
 * opnieuw geladen. Reeds geselecteerde items die niet (meer) in de lijst zitten
 * worden alsnog getoond zodat ze uit te vinken zijn.
 */
export function ItemChecklist({
  load, depKey, values, onChange, label, emptyAllHint,
  searchPlaceholder = "Zoeken…", disabled = false, disabledHint,
}: {
  load: (signal: AbortSignal) => Promise<string[]>;
  depKey: string;
  values: string[];
  onChange: (next: string[]) => void;
  label: string;
  emptyAllHint: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (disabled) { setItems([]); return; }
    const ctrl = new AbortController();
    setLoading(true);
    setLoadError(false);
    loadRef.current(ctrl.signal)
      .then((next) => setItems(next))
      .catch((err) => {
        if (err?.name !== "AbortError") setLoadError(true);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, disabled]);

  // Geselecteerde-maar-niet-geladen items bovenaan meenemen.
  const allOptions = useMemo(() => {
    const set = new Set(items);
    const extras = values.filter((v) => !set.has(v));
    return [...extras, ...items];
  }, [items, values]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter((o) => o.toLowerCase().includes(q));
  }, [allOptions, query]);

  const selectedSet = useMemo(() => new Set(values), [values]);

  function toggle(item: string) {
    if (selectedSet.has(item)) onChange(values.filter((v) => v !== item));
    else onChange([...values, item]);
  }

  if (disabled) {
    return (
      <div className="space-y-1.5">
        <p className="text-sm font-heading uppercase tracking-wide">{label}</p>
        <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-3">
          {disabledHint ?? "Kies eerst een periode."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-heading uppercase tracking-wide">{label}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {values.length > 0 && (
            <>
              <span>{values.length} gekozen</span>
              <button type="button" onClick={() => onChange([])} className="underline hover:text-foreground">
                Wissen
              </button>
            </>
          )}
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9"
        />
      </div>

      <div className="max-h-72 overflow-y-auto rounded-md border">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Laden…
          </div>
        )}
        {!loading && loadError && (
          <p className="px-3 py-6 text-center text-sm text-destructive">Kon de lijst niet laden.</p>
        )}
        {!loading && !loadError && filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {query.trim() ? "Geen resultaten." : "Niets beschikbaar in deze periode."}
          </p>
        )}
        {!loading && !loadError && filtered.map((item) => {
          const checked = selectedSet.has(item);
          return (
            <button
              key={item}
              type="button"
              onClick={() => toggle(item)}
              className={cn(
                "flex w-full items-center gap-2.5 border-b px-3 py-2 text-left text-sm last:border-b-0 transition-colors",
                checked ? "bg-primary/5" : "hover:bg-accent/40"
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm border",
                  checked ? "border-primary bg-primary text-primary-foreground" : "border-input"
                )}
              >
                {checked && <Check className="h-3 w-3" />}
              </span>
              <span className="truncate">{item}</span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">{values.length === 0 ? emptyAllHint : `${values.length} geselecteerd`}</p>
    </div>
  );
}
