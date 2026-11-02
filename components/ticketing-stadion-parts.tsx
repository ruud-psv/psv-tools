"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import type { Occupancy } from "@/lib/ticketing-herdgang/occupancy";

/** Gedeeld door het overzicht en de wedstrijdpagina van Ticketing Stadion. */

export const number = new Intl.NumberFormat("nl-NL");
export const percent = new Intl.NumberFormat("nl-NL", { style: "percent", maximumFractionDigits: 0 });

export function share(part: number, whole: number): string {
  return whole > 0 ? percent.format(part / whole) : "–";
}

export function formatDateTime(value: string | null): string {
  if (!value) return "onbekend";
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatEventDate(value: string | null): string {
  if (!value) return "datum onbekend";
  const parsed = new Date(value.replace(" ", "T"));
  if (isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function daysLabel(days: number): string {
  if (days === 0) return "Vandaag";
  if (days === 1) return "Morgen";
  return `Over ${days} dagen`;
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-heading tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Verkocht in rood, daarvan in de resale in goud, gereserveerd in grijs. */
export function OccupancyBar({ row }: { row: Occupancy }) {
  const width = (value: number) => `${row.capacity > 0 ? Math.min((value / row.capacity) * 100, 100) : 0}%`;
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className="bg-psv-red-primary" style={{ width: width(row.sold - row.resale) }} />
      <div className="bg-psv-gold" style={{ width: width(row.resale) }} />
      <div className="bg-muted-foreground/50" style={{ width: width(row.reserved) }} />
    </div>
  );
}

/** Verschil met een eerdere wedstrijd op hetzelfde aantal dagen voor de aftrap. */
export function Delta({ label, own, reference, detail }: { label: string; own: number; reference: number; detail: string }) {
  const diff = own - reference;
  const ahead = diff >= 0;
  const Icon = ahead ? TrendingUp : TrendingDown;
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${ahead ? "text-success" : "text-error"}`} />
      <div>
        <span className="font-medium">{label}: </span>
        <span className={`tabular-nums font-medium ${ahead ? "text-success" : "text-error"}`}>
          {ahead ? "+" : "−"}
          {number.format(Math.abs(diff))}
          {reference > 0 && ` (${ahead ? "+" : "−"}${percent.format(Math.abs(diff) / reference)})`}
        </span>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

