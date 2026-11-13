/**
 * De verkoop per dag van één wedstrijd als CSV: per kalenderdag een regel, met
 * per soort ticket het aantal. Werkt voor elke wedstrijd in de verkoop per dag,
 * ook gespeelde wedstrijden van eerdere seizoenen; de export per stoel kan dat
 * niet, want de stoelstatus houdt alleen komende wedstrijden bij.
 *
 * Dezelfde tellingen als de grafieken (`lib/ringside/store.ts`): verkochte
 * tickets in de vakken van de plattegrond, per Nederlandse kalenderdag van de
 * aankoop. Hier met alle vier de reeksen, ook seizoenkaarten en vrijkaarten,
 * zodat je in Excel zelf kiest wat je optelt. Geen persoonsgegevens.
 *
 * Puur, zodat het te testen is.
 */

import { SALES_CATEGORIES, type SalesCategory, type StoredEvent } from "../ringside/sales-series";
import { toCsv } from "./export";

const CATEGORY_LABEL: Record<SalesCategory, string> = {
  vrij: "Losse verkoop",
  resale: "Resale",
  seizoenkaart: "Seizoenkaart",
  vrijkaart: "Vrijkaart",
};

export const DAILY_SALES_COLUMNS = [
  "Wedstrijd",
  "Datum wedstrijd",
  "Seizoen",
  "Dag",
  "Dagen tot de wedstrijd",
  ...SALES_CATEGORIES.map((category) => CATEGORY_LABEL[category]),
  "Totaal",
] as const;

function dayNumber(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return null;
  return Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000);
}

function hasSales(bucket: StoredEvent["stand"]): boolean {
  return SALES_CATEGORIES.some((category) => Object.values(bucket[category] ?? {}).some((count) => count > 0));
}

export function buildDailySalesExport(event: StoredEvent): string {
  // Net als `toEventSales()`: past geen enkel vak op de plattegrond (een
  // wedstrijd elders), dan telt alles.
  const bucket = hasSales(event.stand) ? event.stand : event.other;
  const days = new Set<string>();
  for (const category of SALES_CATEGORIES) {
    for (const [day, count] of Object.entries(bucket[category] ?? {})) if (count) days.add(day);
  }
  const eventDay = dayNumber(event.eventDate);

  const lines: string[][] = [[...DAILY_SALES_COLUMNS]];
  for (const day of [...days].sort()) {
    const counts = SALES_CATEGORIES.map((category) => bucket[category]?.[day] ?? 0);
    const dayIndex = dayNumber(day);
    lines.push([
      event.name,
      event.eventDate,
      event.season,
      day,
      eventDay !== null && dayIndex !== null ? String(eventDay - dayIndex) : "",
      ...counts.map(String),
      String(counts.reduce((sum, count) => sum + count, 0)),
    ]);
  }
  return toCsv(lines);
}
