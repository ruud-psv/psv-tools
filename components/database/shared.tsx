"use client";

import { cn } from "@/lib/utils";

/**
 * Opmaak en bouwstenen die de drie tabs van de Database-tool delen. Alles in
 * het Nederlands geformatteerd; de cijfers hier worden in rapportages geplakt.
 */

/** De vaste kleuren van de analyse. Nieuw is de uitkomst waar het om draait,
 *  dus die krijgt PSV-rood; onbekend is een signaal, dus oranje. */
export const OUTCOME_COLORS = {
  isNew: "#e82026",
  existing: "#999999",
  unknown: "#b95000",
} as const;

export function formatNumber(value: number): string {
  return value.toLocaleString("nl-NL");
}

/** Eén decimaal, want bij 40.000 deelnemers is een heel procent te grof. */
export function formatPercent(part: number, total: number): string {
  if (!total) return "—";
  return `${((part / total) * 100).toLocaleString("nl-NL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

/** `YYYY-MM-DD` of een ISO-tijdstempel naar `3 jul 2025`. */
export function formatDate(value: string): string {
  if (!value) return "—";
  const [date] = value.split("T");
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Met tijd erbij — voor "laatste update". */
export function formatDateTime(value: string): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMonth(value: string): string {
  const [y, m] = value.split("-").map(Number);
  if (!y || !m) return value;
  return new Date(y, m - 1, 1).toLocaleDateString("nl-NL", {
    month: "short",
    year: "2-digit",
  });
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${bytes} B`;
}

/** Eén getal met een label eronder. */
export function StatTile({
  label,
  value,
  sub,
  accent,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <p className="font-heading text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className="mt-1 font-heading text-2xl uppercase leading-none"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Melding in de trant van de `.alert`-classes uit de huisstijl. */
export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "warning" | "error" | "success";
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const tones = {
    info: "border-info bg-info-bg text-psv-gray-11",
    warning: "border-warning bg-warning-bg text-psv-gray-11",
    error: "border-error bg-error-bg text-psv-gray-11",
    success: "border-success bg-success-bg text-psv-gray-11",
  } as const;

  return (
    <div className={cn("rounded-md border-l-4 px-4 py-3 text-sm", tones[tone])}>
      {title && (
        <p className="font-heading uppercase tracking-wide">{title}</p>
      )}
      <div className={cn(title && "mt-1")}>{children}</div>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Veelgebruikte as- en gridopmaak, zodat de grafieken op elkaar lijken. */
export const AXIS_PROPS = {
  tick: { fill: "#888", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export const GRID_PROPS = {
  strokeDasharray: "3 3",
  stroke: "#333",
  strokeOpacity: 0.2,
} as const;

export const TOOLTIP_PROPS = {
  contentStyle: {
    background: "#fff",
    border: "1px solid #e5e5e5",
    borderRadius: 8,
    fontSize: 12,
  },
  // Recharts geeft hier `ValueType | undefined` door; vandaar `unknown`.
  formatter: (value: unknown) =>
    typeof value === "number" ? formatNumber(value) : String(value ?? ""),
} as const;
