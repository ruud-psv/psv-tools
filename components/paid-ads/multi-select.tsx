"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface MultiOption {
  value: string;
  label: string;
  /** Tweede regel: platform, exploitatie of bovenliggende campagne. */
  detail?: string;
  /** Kleurstip ervoor, bijvoorbeeld de platformkleur. */
  dot?: string;
}

/**
 * Keuzelijst waarin meerdere waarden aangevinkt kunnen worden, met een
 * zoekveld. "Selecteer resultaten" vinkt alles aan wat de zoekterm oplevert —
 * zo kies je in één keer alle campagnes van "Hier in het Zuiden".
 */
export function MultiSelect({
  value,
  onChange,
  options,
  allLabel,
  unit,
  className,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options: MultiOption[];
  /** Tekst op de knop zolang er niets gekozen is, zoals "Alle campagnes". */
  allLabel: string;
  /** Meervoud voor op de knop, zoals "campagnes". */
  unit: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);

  // Sluit bij een klik ernaast of Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => `${o.label} ${o.detail ?? ""}`.toLowerCase().includes(q));
  }, [options, query]);

  const selected = new Set(value);
  const toggle = (v: string) =>
    onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  const selectVisible = () => onChange([...new Set([...value, ...visible.map((o) => o.value)])]);

  const buttonLabel =
    value.length === 0
      ? allLabel
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? `1 ${unit}`)
        : `${value.length} ${unit}`;

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={options.length === 0 && value.length === 0}
        aria-expanded={open}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50",
          value.length > 0 && "border-psv-neutralDark"
        )}
      >
        <span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>{buttonLabel}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-border bg-card shadow-lg">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Zoeken"
                className="pl-8"
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={selectVisible}
                disabled={visible.length === 0}
                className="font-semibold text-psv-red-primary hover:underline disabled:opacity-40"
              >
                {query ? `Selecteer ${visible.length} resultaten` : "Selecteer alles"}
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                disabled={value.length === 0}
                className="text-muted-foreground hover:underline disabled:opacity-40"
              >
                Wissen
              </button>
            </div>
          </div>
          <ul className="max-h-72 overflow-y-auto py-1" role="listbox" aria-multiselectable>
            {visible.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground">Niets gevonden</li>
            ) : (
              visible.map((o) => {
                const isOn = selected.has(o.value);
                return (
                  <li key={o.value} role="option" aria-selected={isOn}>
                    <button
                      type="button"
                      onClick={() => toggle(o.value)}
                      className="flex w-full items-start gap-2.5 px-3 py-1.5 text-left hover:bg-muted"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                          isOn ? "border-psv-red-primary bg-psv-red-primary text-white" : "border-input"
                        )}
                      >
                        {isOn && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm">
                          {o.dot && <span className={cn("h-2 w-2 shrink-0 rounded-full", o.dot)} />}
                          <span className="truncate">{o.label}</span>
                        </span>
                        {o.detail && (
                          <span className="block truncate text-[11px] text-muted-foreground">{o.detail}</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
