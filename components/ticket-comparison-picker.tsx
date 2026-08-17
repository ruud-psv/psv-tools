"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, History } from "lucide-react";
import { ItemChecklist } from "@/components/report-wizard/ItemChecklist";
import { extractOpponent } from "@/lib/ticket-sales-aggregate";
import type { ComparisonInput, ComparisonMode, ComparisonWindow } from "@/lib/ticket-sales-comparison";

/**
 * "Vergelijk met het verleden": kies historische wedstrijden om tegen de huidige
 * verkoopcurve af te zetten.
 *
 * De index (een paar kB) wordt pas geladen bij het openklappen, de dagreeksen
 * pas bij een selectie. Zo kost het paneel niets voor iedereen die het niet
 * opent — ook niet op de publieke share-pagina.
 */

const MAX_SELECTED = 3;

interface IndexEntry {
  id: string;
  name: string;
  date: string;
  season: string;
  opponent: string;
  totalTickets: number;
  firstOffset: number;
  lastOffset: number;
}

interface DetailEvent extends IndexEntry {
  tickets: number[];
}

function formatDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

export interface TicketComparisonPickerProps {
  /** Naam van de live wedstrijd; bepaalt welke historie als suggestie bovenaan komt. */
  liveEventName: string;
  selected: string[];
  onSelectedChange: (next: string[]) => void;
  mode: ComparisonMode;
  onModeChange: (next: ComparisonMode) => void;
  window: ComparisonWindow;
  onWindowChange: (next: ComparisonWindow) => void;
  /** De opgehaalde dagreeksen, zodat de grafiek ze kan tekenen. */
  onInputsChange: (inputs: ComparisonInput[]) => void;
  /** Open klappen bij het eerste renderen — bv. wanneer een share-link al een selectie bevat. */
  defaultOpen?: boolean;
}

export function TicketComparisonPicker({
  liveEventName,
  selected,
  onSelectedChange,
  mode,
  onModeChange,
  window: windowMode,
  onWindowChange,
  onInputsChange,
  defaultOpen = false,
}: TicketComparisonPickerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [index, setIndex] = useState<IndexEntry[] | null>(null);
  const [indexError, setIndexError] = useState(false);

  // Een voorselectie uit een share-link is pas bekend nadat het token is
  // gedecodeerd, dus ná de eerste render. Alsnog openklappen — maar nooit
  // dichtklappen, zodat de bezoeker het paneel zelf kan sluiten.
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  // De index één keer laden zodra het paneel voor het eerst opengaat.
  useEffect(() => {
    if (!open || index !== null) return;
    let cancelled = false;
    fetch("/api/ticket-history/historical")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { events?: IndexEntry[] }) => {
        if (!cancelled) setIndex(d.events ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setIndex([]);
          setIndexError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, index]);

  // Dagreeksen van de gekozen wedstrijden ophalen en doorgeven aan de grafiek.
  useEffect(() => {
    if (selected.length === 0) {
      onInputsChange([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/ticket-history/historical?ids=${encodeURIComponent(selected.join(","))}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { events?: DetailEvent[] }) => {
        if (cancelled) return;
        const inputs: ComparisonInput[] = (d.events ?? []).map((event) => {
          const perOffset = new Map<number, number>();
          for (let i = 0; i < event.tickets.length; i++) {
            perOffset.set(event.firstOffset - i, event.tickets[i]);
          }
          return {
            id: event.id,
            name: `${event.name} (${event.season})`,
            season: event.season,
            eventDate: event.date,
            perOffset,
            total: event.tickets.reduce((a, b) => a + b, 0),
          };
        });
        // Volgorde van de selectie aanhouden, zodat kleuren niet verspringen.
        inputs.sort((a, b) => selected.indexOf(a.id) - selected.indexOf(b.id));
        onInputsChange(inputs);
      })
      .catch(() => {
        if (!cancelled) onInputsChange([]);
      });
    return () => {
      cancelled = true;
    };
    // `onInputsChange` hoort niet in de deps: die verandert per render van de ouder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.join(",")]);

  const liveOpponent = useMemo(() => extractOpponent(liveEventName), [liveEventName]);

  const byId = useMemo(() => {
    const map = new Map<string, IndexEntry>();
    for (const entry of index ?? []) map.set(entry.id, entry);
    return map;
  }, [index]);

  /**
   * Onbekende id's uit de selectie halen zodra de index binnen is. Een
   * share-token is niet ondertekend, dus er kan alles in staan; zonder deze
   * stap zou zo'n id als naamloze regel in de lijst blijven staan.
   */
  useEffect(() => {
    if (index === null || index.length === 0) return;
    const known = selected.filter((id) => byId.has(id));
    if (known.length !== selected.length) onSelectedChange(known);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, byId, selected.join(",")]);

  /**
   * Wedstrijden tegen dezelfde tegenstander bovenaan: dat is bijna altijd de
   * vergelijking die iemand zoekt. Daarna op datum, nieuwste eerst.
   */
  const orderedIds = useMemo(() => {
    const entries = [...(index ?? [])];
    entries.sort((a, b) => {
      const aMatch = Boolean(liveOpponent) && a.opponent === liveOpponent;
      const bMatch = Boolean(liveOpponent) && b.opponent === liveOpponent;
      if (aMatch !== bMatch) return aMatch ? -1 : 1;
      return b.date.localeCompare(a.date);
    });
    return entries.map((e) => e.id);
  }, [index, liveOpponent]);

  const loadIds = useCallback(async () => orderedIds, [orderedIds]);

  const searchTextOf = useCallback(
    (id: string) => {
      const entry = byId.get(id);
      return entry ? `${entry.name} ${entry.season} ${entry.date}` : id;
    },
    [byId]
  );

  const renderItem = useCallback(
    (id: string) => {
      const entry = byId.get(id);
      if (!entry) return <span className="truncate">{id}</span>;
      const isSameOpponent = Boolean(liveOpponent) && entry.opponent === liveOpponent;
      return (
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 truncate">
            <span className="truncate">{entry.name}</span>
            {isSameOpponent && (
              <span className="shrink-0 rounded-sm bg-primary/10 px-1 py-0.5 text-[9px] font-heading uppercase tracking-wide text-primary">
                zelfde tegenstander
              </span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDate(entry.date)} · {entry.season} ·{" "}
            {entry.totalTickets.toLocaleString("nl-NL")} tickets
          </span>
        </span>
      );
    },
    [byId, liveOpponent]
  );

  const hasData = (index?.length ?? 0) > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs font-heading uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
      >
        <History className="h-3.5 w-3.5" />
        Vergelijk met het verleden
        {selected.length > 0 && (
          <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
            {selected.length}
          </span>
        )}
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="mt-3 space-y-4 rounded-md border border-border bg-background p-3">
          {index === null ? (
            <p className="text-xs text-muted-foreground">Wedstrijden laden…</p>
          ) : !hasData ? (
            <p className="text-xs text-muted-foreground">
              {indexError
                ? "De historische data is nu niet op te halen."
                : "Er is nog geen historische data toegevoegd."}
            </p>
          ) : (
            <>
              <ItemChecklist
                label="Wedstrijden uit het verleden"
                depKey={`hist:${orderedIds.length}:${liveOpponent}`}
                load={loadIds}
                values={selected}
                onChange={onSelectedChange}
                searchPlaceholder="Zoek op tegenstander, seizoen of datum…"
                emptyAllHint="Kies één of meer wedstrijden om te vergelijken."
                renderItem={renderItem}
                searchTextOf={searchTextOf}
                max={MAX_SELECTED}
              />

              {selected.length > 0 && (
                <div className="flex flex-wrap gap-4">
                  <ToggleGroup
                    label="Weergave"
                    value={mode}
                    onChange={(v) => onModeChange(v as ComparisonMode)}
                    options={[
                      { value: "perDag", label: "Per dag" },
                      { value: "tempo", label: "Tempo (%)" },
                    ]}
                  />
                  <ToggleGroup
                    label="Periode"
                    value={windowMode}
                    onChange={(v) => onWindowChange(v as ComparisonWindow)}
                    options={[
                      { value: "live", label: "Huidig venster" },
                      { value: "full", label: "Volledige verkoop" },
                    ]}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ToggleGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-heading uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="inline-flex overflow-hidden rounded-md border border-border">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={
              "px-2.5 py-1 text-[11px] font-heading uppercase tracking-wide transition-colors " +
              (value === option.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent/40")
            }
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
