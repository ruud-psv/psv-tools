"use client";

import { getDateRange } from "@/lib/dm-share";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PresetOption } from "./constants";

export interface PeriodValue {
  preset: string;
  customFrom: string;
  customTo: string;
}

/** Los een PeriodValue op naar een concreet {from,to}-bereik (voor previews). */
export function resolvePeriodValue(v: PeriodValue): { from: string; to: string } | null {
  if (v.preset === "current") return null;
  if (v.preset === "custom") {
    if (!v.customFrom || !v.customTo) return null;
    return { from: v.customFrom, to: v.customTo };
  }
  return getDateRange(v.preset);
}

export function PeriodPicker({
  value, onChange, presets, allowCustom, hint,
}: {
  value: PeriodValue;
  onChange: (next: PeriodValue) => void;
  presets: PresetOption[];
  allowCustom: boolean;
  hint?: string;
}) {
  const range = resolvePeriodValue(value);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {/* "custom" komt uit de aparte Aangepast-knop hieronder, nooit dubbel. */}
        {presets.filter((p) => p.value !== "custom").map((p) => {
          const active = value.preset === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange({ ...value, preset: p.value })}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-heading uppercase tracking-wide transition-colors",
                active
                  ? "border-psv-red-primary bg-psv-red-primary text-white"
                  : "border-border bg-background text-muted-foreground hover:border-psv-red-primary/50"
              )}
            >
              {p.label}
            </button>
          );
        })}
        {allowCustom && (
          <button
            type="button"
            onClick={() => onChange({ ...value, preset: "custom" })}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-heading uppercase tracking-wide transition-colors",
              value.preset === "custom"
                ? "border-psv-red-primary bg-psv-red-primary text-white"
                : "border-border bg-background text-muted-foreground hover:border-psv-red-primary/50"
            )}
          >
            Aangepast
          </button>
        )}
      </div>

      {allowCustom && value.preset === "custom" && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground normal-case tracking-normal font-normal">Van</Label>
            <Input
              type="date"
              value={value.customFrom}
              max={value.customTo || undefined}
              onChange={(e) => onChange({ ...value, customFrom: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground normal-case tracking-normal font-normal">Tot</Label>
            <Input
              type="date"
              value={value.customTo}
              min={value.customFrom || undefined}
              onChange={(e) => onChange({ ...value, customTo: e.target.value })}
            />
          </div>
        </div>
      )}

      {value.preset === "current" ? (
        <p className="text-xs text-muted-foreground">Toont de actuele stand op het moment van bekijken.</p>
      ) : range ? (
        <p className="text-xs text-muted-foreground">{range.from} t/m {range.to}</p>
      ) : value.preset === "custom" ? (
        <p className="text-xs text-warning">Kies een begin- en einddatum.</p>
      ) : null}

      {hint && <p className="text-xs text-muted-foreground/80 italic">{hint}</p>}
    </div>
  );
}
