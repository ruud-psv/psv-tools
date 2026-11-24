"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import type { Occupancy } from "@/lib/ticketing-herdgang/occupancy";
import type { FlexAreaStatus } from "@/lib/ticketing-stadion/summary";

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

/** Korte aanduiding voor in een rij: alleen als vak MM open is. */
export function FlexAreaTag({ flex }: { flex: FlexAreaStatus | undefined }) {
  if (!flex || flex.state !== "open") return null;
  return (
    <span className="tag tag--gold shrink-0 text-[10px] px-1.5 py-0" title={`Vak MM open voor ${number.format(flex.open)} plaatsen`}>
      MM open · {number.format(flex.open)}
    </span>
  );
}

/**
 * Of vak MM open is voor PSV-fans, en voor hoeveel. Dat bepaalt mee wat de
 * capaciteit en de bezetting zijn: alleen het open deel telt mee.
 */
export function FlexAreaStatusLine({ flex, wheelchair }: { flex: FlexAreaStatus | undefined; wheelchair?: Occupancy }) {
  if (!flex) return null;
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2 text-sm">
      <span className="font-heading uppercase tracking-wide">Vak MM</span>
      {flex.state === "open" ? (
        <>
          <span className="tag tag--gold">Open voor {number.format(flex.open)}</span>
          <span className="text-muted-foreground">
            {number.format(flex.sold)} verkocht · {number.format(flex.free)} vrij
            {flex.reserved ? ` · ${number.format(flex.reserved)} gereserveerd` : ""}
            {flex.locked ? ` · ${number.format(flex.locked)} van de ${number.format(flex.capacity)} bij het uitvak` : ""}
          </span>
        </>
      ) : flex.state === "dicht" ? (
        <>
          <span className="tag tag--black">Dicht</span>
          <span className="text-muted-foreground">
            Hoort bij het uitvak ({number.format(flex.capacity)} plaatsen); telt niet mee in de capaciteit.
          </span>
        </>
      ) : (
        <span className="text-muted-foreground">Staat niet in de stoelenkaart van deze wedstrijd.</span>
      )}
      {wheelchair && wheelchair.capacity > 0 && (
        <span className="basis-full text-xs text-muted-foreground">
          Capaciteit en bezetting zonder rolstoelvakken ({number.format(wheelchair.capacity)} plaatsen,{" "}
          {number.format(wheelchair.sold)} verkocht) en zonder het uitvak. Vak MM telt mee voor het deel dat open is.
        </span>
      )}
    </div>
  );
}

