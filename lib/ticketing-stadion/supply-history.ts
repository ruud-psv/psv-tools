/**
 * Het aanbod per dag van de thuiswedstrijden: hoeveel er aan het eind van elke
 * dag nog te koop was, in de vrije verkoop (vrije plaatsen) en in de resale
 * (door de houder aangeboden).
 *
 * De stoelstatus kent alleen de stand van nu. De cron legt daarom na elke run
 * per wedstrijd de stand van vandaag vast (`recordSupply()`); de laatste meting
 * van een dag blijft staan. Een dag van vóór de eerste meting is niet terug te
 * rekenen: wanneer een kaart in de resale werd gezet, bewaart Ringside niet.
 *
 * Puur, zodat het te testen is. De opslag staat in `store.ts`.
 */

/** `YYYY-MM-DD` (Nederlandse tijd) → [vrije verkoop, resale]. */
export type SupplyDays = Record<string, [free: number, resale: number]>;

export interface SupplyHistoryMatch {
  name: string | null;
  eventDate: string | null;
  days: SupplyDays;
}

export interface SupplyHistory {
  matches: Record<string, SupplyHistoryMatch>;
}

/** Zo lang na de wedstrijd blijft het aanbod per dag bewaard. */
export const SUPPLY_RETENTION_DAYS = 400;

export function emptySupplyHistory(): SupplyHistory {
  return { matches: {} };
}

/** Wat `recordSupply()` van een wedstrijd nodig heeft; een `StadionMatch` past. */
export interface SupplyInput {
  eventId: string;
  name: string | null;
  eventDate: string | null;
  total: { free: number; resale: number };
}

function dayNumber(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return null;
  return Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000);
}

function dayString(number: number): string {
  return new Date(number * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Legt de stand van vandaag vast voor elke wedstrijd en ruimt wedstrijden op
 * die langer dan `SUPPLY_RETENTION_DAYS` voorbij zijn.
 *
 * Een wedstrijd die al gespeeld is, krijgt geen nieuwe dag meer: de laatste dag
 * is zijn eindstand. Geeft `changed: false` als er niets te schrijven is, zodat
 * de cron niet elk kwartier hetzelfde bestand wegschrijft.
 */
export function recordSupply(
  history: SupplyHistory,
  matches: Iterable<SupplyInput>,
  today: string
): { history: SupplyHistory; changed: boolean } {
  const next: SupplyHistory = { matches: { ...history.matches } };
  let changed = false;
  const todayNumber = dayNumber(today);

  for (const match of matches) {
    const eventDay = match.eventDate ? dayNumber(match.eventDate) : null;
    if (eventDay !== null && todayNumber !== null && eventDay < todayNumber) continue;

    const previous = next.matches[match.eventId];
    const value: [number, number] = [match.total.free, match.total.resale];
    const stored = previous?.days[today];
    const sameDay = stored !== undefined && stored[0] === value[0] && stored[1] === value[1];
    const sameMeta = previous !== undefined && previous.name === match.name && previous.eventDate === match.eventDate;
    if (sameDay && sameMeta) continue;

    next.matches[match.eventId] = {
      name: match.name,
      eventDate: match.eventDate,
      days: { ...previous?.days, [today]: value },
    };
    changed = true;
  }

  if (todayNumber !== null) {
    for (const [eventId, match] of Object.entries(next.matches)) {
      const eventDay = match.eventDate ? dayNumber(match.eventDate) : null;
      if (eventDay !== null && todayNumber - eventDay > SUPPLY_RETENTION_DAYS) {
        delete next.matches[eventId];
        changed = true;
      }
    }
  }

  return { history: changed ? next : history, changed };
}

/** Eén dag in de grafiek; `null` als er die dag niet gemeten is. */
export interface SupplyPoint {
  /** `YYYY-MM-DD`. */
  date: string;
  /** Dagen tot de wedstrijd; 0 is de wedstrijddag. `null` zonder wedstrijddatum. */
  daysOut: number | null;
  free: number | null;
  resale: number | null;
}

/**
 * De dagen van de eerste tot de laatste meting, zonder gaten: een dag zonder
 * meting (de cron lag stil) staat erin met `null`, zodat de as doorloopt.
 * Dagen na de wedstrijddag vallen weg.
 */
export function supplySeries(days: SupplyDays, eventDate: string | null): SupplyPoint[] {
  const eventDay = eventDate ? dayNumber(eventDate) : null;
  const numbers = Object.keys(days)
    .map(dayNumber)
    .filter((n): n is number => n !== null && (eventDay === null || n <= eventDay))
    .sort((a, b) => a - b);
  if (numbers.length === 0) return [];

  const points: SupplyPoint[] = [];
  for (let n = numbers[0]; n <= numbers[numbers.length - 1]; n++) {
    const date = dayString(n);
    const value = days[date];
    points.push({
      date,
      daysOut: eventDay === null ? null : eventDay - n,
      free: value ? value[0] : null,
      resale: value ? value[1] : null,
    });
  }
  return points;
}
