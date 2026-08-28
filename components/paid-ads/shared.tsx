"use client";

import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DerivedMetrics, ScoredCampaign, Tone } from "@/lib/paid-ads/derive";
import { PaidAdsResponse, PaidPlatform } from "@/lib/paid-ads/types";

/* ---------- Kleur per tone ---------- */

/** Statuskleuren komen uit de PSV tokens; geen losse hex-waarden. */
export const TONE_BADGE: Record<Tone, string> = {
  good: "bg-success-bg text-success",
  warn: "bg-warning-bg text-warning",
  bad: "bg-error-bg text-error",
  neutral: "bg-muted text-muted-foreground",
};

export const TONE_BAR: Record<Tone, string> = {
  good: "bg-success",
  warn: "bg-warning",
  bad: "bg-error",
  neutral: "bg-psv-gray-08",
};

export const TONE_MARK: Record<Tone, string> = {
  good: "✓",
  warn: "!",
  bad: "!",
  neutral: "·",
};

/** Vaste kleur per platform, zodat een kanaal overal dezelfde kleur houdt. */
export const PLATFORM_DOT: Record<PaidPlatform, string> = {
  meta: "bg-psv-red-primary",
  tiktok: "bg-psv-neutralDark",
  google: "bg-psv-gold",
  linkedin: "bg-info",
};

/* ---------- Bouwstenen ---------- */

export function SectionCard({
  title,
  hint,
  action,
  children,
  className,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row flex-wrap items-baseline gap-x-3 gap-y-1 space-y-0 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

export function Badge({
  tone = "neutral",
  children,
  className,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-bold tabular-nums",
        TONE_BADGE[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Balk met een waarde ernaast — het terugkerende patroon in dit dashboard. */
export function BarRow({
  width,
  tone = "neutral",
  className,
}: {
  /** 0-100. */
  width: number;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cn("h-1.5 flex-1 overflow-hidden rounded-sm bg-psv-gray-07", className)}>
      <div
        className={cn("h-full rounded-sm", TONE_BAR[tone])}
        style={{ width: `${Math.max(0, Math.min(100, width))}%` }}
      />
    </div>
  );
}

/** Rode balk voor volumeverdelingen, waar geen goed/slecht aan vastzit. */
export function VolumeBar({ width, className }: { width: number; className?: string }) {
  return (
    <div className={cn("h-1.5 flex-1 overflow-hidden rounded-sm bg-psv-gray-07", className)}>
      <div
        className="h-full rounded-sm bg-psv-red-primary"
        style={{ width: `${Math.max(0, Math.min(100, width))}%` }}
      />
    </div>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  delta,
  deltaTone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: string | null;
  deltaTone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-heading text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon && <span className="shrink-0 text-psv-red-primary opacity-80">{icon}</span>}
      </div>
      <p className="mt-2 font-heading text-3xl uppercase leading-none">{value}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {delta && <Badge tone={deltaTone}>{delta}</Badge>}
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
    </Card>
  );
}

export function MiniKpi({
  label,
  value,
  delta,
  deltaTone = "neutral",
}: {
  label: string;
  value: string;
  delta?: string | null;
  deltaTone?: Tone;
}) {
  return (
    <div className="flex items-center gap-3 border border-border bg-card px-4 py-2.5">
      <p className="font-heading text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="ml-auto font-heading text-xl uppercase leading-none">{value}</p>
      {delta && <Badge tone={deltaTone}>{delta}</Badge>}
    </div>
  );
}

/** Tegel zonder rode koprand, voor totalen bínnen een kaart. */
export function TotalTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-muted/40 px-3 py-2.5">
      <p className="font-heading text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-2xl uppercase leading-none">{value}</p>
    </div>
  );
}

/**
 * Wat er in een sectie staat zolang de koppeling ontbreekt. Bewust rustig: de
 * structuur blijft zichtbaar zonder te doen alsof er iets misgaat.
 */
export function EmptySection({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-[96px] items-center justify-center border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
      {children ?? "Nog geen data voor deze periode."}
    </div>
  );
}

/* ---------- Tabel ---------- */

export function Th({
  children,
  align = "left",
  className,
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground",
        align === "right" ? "text-right" : "text-left",
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-3 py-2.5 text-sm",
        // Getallen breken nooit over twee regels af.
        align === "right" ? "whitespace-nowrap text-right tabular-nums" : "text-left",
        className
      )}
    >
      {children}
    </td>
  );
}

export function DataTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse", className)}>{children}</table>
    </div>
  );
}

/* ---------- Gedeelde props ---------- */


/** Wat elke weergave krijgt: de ruwe respons plus wat er al uit afgeleid is. */
export interface PaidViewProps {
  data: PaidAdsResponse;
  /** Campagnes na filtering, met score en afgeleide metrics. */
  scored: ScoredCampaign[];
  /** Totalen over de gefilterde campagnes. */
  totals: DerivedMetrics;
  /** Gemiddelde kosten per resultaat — de norm waar CPA's tegen afgezet worden. */
  avgCpa: number | null;
  /** Waar de huidige periode mee vergeleken wordt. */
  benchmark: DerivedMetrics | null;
  benchmarkLabel: string;
}
