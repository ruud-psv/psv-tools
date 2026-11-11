/**
 * Het verkoopverloop van een lopende wedstrijd, gerekend uit de stoelstatus.
 *
 * De verkoop-ingest (`sales-ingest.ts`) telt regels op. Dat klopt voor een
 * volledige doorloop, maar bij het bijhouden levert Ringside een gewijzigde
 * regel opnieuw aan en is de eerdere versie niet terug te draaien: een ticket
 * kan dubbel tellen en een retour gaat er niet af. De stoelstatus heeft dat
 * probleem niet: daar wint de laatste versie van een regel. Voor komende
 * wedstrijden rekenen we de reeksen daarom elke run opnieuw uit de tickets.
 *
 * Hier ook de meting per uur: de stand van verkocht, vrij en aangeboden op één
 * moment. Die is achteraf niet te reconstrueren.
 */

import { isPsvHomeMatch } from "../aangrenzende-stoelen/events";
import { normalizeArea } from "../aangrenzende-stoelen/neighbors";
import { STADIUM_AREAS } from "../aangrenzende-stoelen/stadium";
import { isHerdgangMatch } from "../ticketing-herdgang/events";
import { HERDGANG_AREAS, mapArea } from "../ticketing-herdgang/herdgang";
import { occupancyByArea } from "../ticketing-herdgang/occupancy";
import { isStandTicket, type CategoryDays } from "./sales-series";
import { categoryFromCode, type EventSeatState } from "./seat-state";

export interface SeatSeries {
  stand: CategoryDays;
  other: CategoryDays;
}

/**
 * De reeksen van één wedstrijd uit zijn tickets: afgenomen tickets (geen
 * openstaande reserveringen) plus de doorverkochte kaarten van verkopers.
 * `null` als nog niet elk ticket een dag heeft; dan is de reeks onvolledig.
 */
export function seriesFromSeatState(event: EventSeatState): SeatSeries | null {
  const series: SeatSeries = { stand: {}, other: {} };
  const name = event.name ?? "";
  const add = (area: string, day: string, code: number | undefined) => {
    const bucket = isStandTicket(name, area) ? series.stand : series.other;
    const days = (bucket[categoryFromCode(code)] ??= {});
    days[day] = (days[day] ?? 0) + 1;
  };

  for (const ticket of Object.values(event.tickets)) {
    if (ticket[6] === 1) continue;
    const day = ticket[7];
    if (!day) return null;
    // Het vak van de stoelenkaart gaat voor, net als bij de bezetting.
    const seat = ticket[0] ? event.seats[ticket[0]] : undefined;
    add(seat ? seat[0] : ticket[1], day, ticket[8]);
  }
  for (const [day, code, area] of Object.values(event.resold ?? {})) add(area, day, code);
  return series;
}

/* ---------- Meting per uur ---------- */

/** `[uur, capaciteit, verkocht, gereserveerd, vrij, aangeboden in de resale]`. */
export type TimelinePoint = [hour: string, capacity: number, sold: number, reserved: number, free: number, resale: number];

const STADIUM_STANDS = new Set(STADIUM_AREAS.map((shape) => normalizeArea(shape.area)));
const HERDGANG_STANDS = new Set(HERDGANG_AREAS.map((shape) => mapArea(shape.area)));

/** Welke vakken tribune zijn voor deze wedstrijd; `undefined` als we de plattegrond niet kennen. */
function standFilter(name: string | null): ((area: string) => boolean) | undefined {
  if (isPsvHomeMatch(name)) return (area) => STADIUM_STANDS.has(normalizeArea(area));
  if (isHerdgangMatch(name)) return (area) => HERDGANG_STANDS.has(mapArea(area));
  return undefined;
}

/** Het uur van een meting, in UTC: `2026-11-11T14`. */
export function hourKey(now: Date): string {
  return now.toISOString().slice(0, 13);
}

/** De stand van één wedstrijd op dit moment, alleen de tribunevakken. */
export function timelinePoint(event: EventSeatState, now: Date): TimelinePoint {
  const { total } = occupancyByArea(event, standFilter(event.name));
  return [hourKey(now), total.capacity, total.sold, total.reserved, total.free, total.resale];
}

/**
 * Voegt een meting toe. Eén per uur: een tweede meting in hetzelfde uur
 * vervangt de eerste niet, zodat de reeks een vast ritme houdt.
 */
export function appendPoint(points: TimelinePoint[], point: TimelinePoint): boolean {
  const last = points[points.length - 1];
  if (last && last[0] >= point[0]) return false;
  points.push(point);
  return true;
}
