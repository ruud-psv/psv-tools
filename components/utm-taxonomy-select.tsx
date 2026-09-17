"use client";

import { useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Sentinel-waarde voor het "nieuw toevoegen"-item in de dropdown. */
const ADD_NEW = "__add_new__";

/**
 * Dropdown voor een utm_source of utm_medium, met onderin de optie om een
 * nieuwe waarde toe te voegen. Die nieuwe waarde wordt via `onAdd` opgeslagen
 * (zodat iedereen hem voortaan in de lijst ziet) en meteen geselecteerd.
 */
export function UtmTaxonomySelect({
  id,
  value,
  options,
  placeholder,
  addLabel,
  addPlaceholder,
  onChange,
  onAdd,
  disabled,
}: {
  id: string;
  value: string;
  options: string[];
  placeholder: string;
  addLabel: string;
  addPlaceholder: string;
  onChange: (value: string) => void;
  /** Slaat de nieuwe waarde op; retourneert de genormaliseerde waarde, of een foutmelding. */
  onAdd: (value: string) => Promise<{ value: string } | { error: string }>;
  disabled?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startAdding() {
    setDraft("");
    setError("");
    setAdding(true);
    // De dropdown sluit pas na dit event; focus daarna pas de input.
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancelAdding() {
    setAdding(false);
    setDraft("");
    setError("");
  }

  async function confirmAdd() {
    const raw = draft.trim();
    if (!raw) {
      setError("Vul een waarde in.");
      return;
    }
    setSaving(true);
    setError("");
    const result = await onAdd(raw);
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onChange(result.value);
    cancelAdding();
  }

  if (adding) {
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            id={id}
            value={draft}
            placeholder={addPlaceholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void confirmAdd();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                cancelAdding();
              }
            }}
          />
          <Button type="button" size="icon" onClick={() => void confirmAdd()} disabled={saving} aria-label="Toevoegen">
            <Check className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="outline" onClick={cancelAdding} disabled={saving} aria-label="Annuleren">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Letters, cijfers en _ - . — spaties worden underscores. Enter om op te slaan.
          </p>
        )}
      </div>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={(v) => (v === ADD_NEW ? startAdding() : onChange(v))}
      disabled={disabled}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {/* Bovenaan: bij een lange lijst blijft toevoegen anders onder de scroll hangen. */}
        <SelectItem value={ADD_NEW}>
          <span className="inline-flex items-center gap-1.5 font-heading uppercase tracking-wide text-xs">
            <Plus className="h-3.5 w-3.5" />
            {addLabel}
          </span>
        </SelectItem>
        <SelectSeparator />
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
