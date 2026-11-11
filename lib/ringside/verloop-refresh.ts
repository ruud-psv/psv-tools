/**
 * Na elke run van de stoelstatus: het verkoopverloop bijwerken.
 *
 * Drie dingen, alleen voor wedstrijden waarvan we de plattegrond kennen (PSV 1
 * thuis, Jong PSV en PSV Vrouwen):
 *
 * 1. **Bevriezen.** Een wedstrijd die de stoelstatus opruimt omdat hij gespeeld
 *    is, krijgt zijn laatste reeksen als eindstand.
 * 2. **Komende wedstrijden** opnieuw uitrekenen uit de tickets.
 * 3. **Eén meting per uur** van de stand: verkocht, vrij, aangeboden.
 *
 * Alleen als de stoelstatus bij is en elk ticket een dag heeft; anders blijven
 * de vorige reeksen staan en komt er geen meting. Een halve stand vastleggen
 * is erger dan een uur missen.
 */

import { isPsvHomeMatch } from "../aangrenzende-stoelen/events";
import { isHerdgangMatch } from "../ticketing-herdgang/events";
import { appendPoint, hourKey, seriesFromSeatState, timelinePoint, type SeatSeries } from "./seat-series";
import type { EventSeatState, EventStates } from "./seat-state";
import {
  readSeatSeries,
  readTimeline,
  writeSeatSeries,
  writeTimeline,
  type SeatSeriesFile,
} from "./verloop-store";

export function isTrackedMatch(name: string | null | undefined): boolean {
  return isPsvHomeMatch(name) || isHerdgangMatch(name);
}

export interface VerloopDeps {
  readSeatSeries: typeof readSeatSeries;
  writeSeatSeries: typeof writeSeatSeries;
  readTimeline: typeof readTimeline;
  writeTimeline: typeof writeTimeline;
}

const DEFAULT_DEPS: VerloopDeps = { readSeatSeries, writeSeatSeries, readTimeline, writeTimeline };

export interface VerloopInput {
  /** De komende wedstrijden na deze run. */
  events: EventStates;
  /** Wedstrijden die deze run zijn opgeruimd, zoals ze er voor het laatst uitzagen. */
  leaving: EventSeatState[];
  /** De stoelstatus is bij en compleet: stoelen, tickets, capaciteit, reserveringen en dagen. */
  complete: boolean;
  now: Date;
}

export interface VerloopResult {
  frozen: number;
  upcoming: number;
  measured: number;
}

export async function updateVerloop(input: VerloopInput, deps: VerloopDeps = DEFAULT_DEPS): Promise<VerloopResult> {
  const result: VerloopResult = { frozen: 0, upcoming: 0, measured: 0 };
  const file: SeatSeriesFile = (await deps.readSeatSeries()) ?? { updatedAt: "", measuredHour: null, upcoming: {}, frozen: {} };

  for (const event of input.leaving) {
    // De laatste reeks van toen hij nog liep, of anders wat de tickets nu geven.
    const last: SeatSeries | null = file.upcoming[event.eventId] ?? (input.complete ? seriesFromSeatState(event) : null);
    delete file.upcoming[event.eventId];
    if (last && isTrackedMatch(event.name)) {
      file.frozen[event.eventId] = last;
      result.frozen++;
    }
  }

  const tracked = [...input.events.values()].filter((event) => isTrackedMatch(event.name));
  if (input.complete) {
    const upcoming: Record<string, SeatSeries> = {};
    for (const event of tracked) {
      const series = seriesFromSeatState(event);
      // Nog niet elk ticket heeft een dag: de vorige reeks houden.
      const keep = series ?? file.upcoming[event.eventId];
      if (keep) upcoming[event.eventId] = keep;
    }
    file.upcoming = upcoming;
  }
  result.upcoming = Object.keys(file.upcoming).length;

  // Eén meting per uur. Het uur staat in het reeksenbestand, zodat de runs
  // daartussen de metingen van alle wedstrijden niet hoeven te openen.
  const hour = hourKey(input.now);
  if (input.complete && file.measuredHour !== hour) {
    await Promise.all(
      tracked.map(async (event) => {
        const timeline = (await deps.readTimeline(event.eventId)) ?? {
          eventId: event.eventId,
          name: event.name,
          eventDate: event.eventDate,
          points: [],
        };
        timeline.name = event.name;
        timeline.eventDate = event.eventDate;
        if (appendPoint(timeline.points, timelinePoint(event, input.now))) {
          await deps.writeTimeline(timeline);
          result.measured++;
        }
      })
    );
    file.measuredHour = hour;
  }

  file.updatedAt = input.now.toISOString();
  await deps.writeSeatSeries(file);
  return result;
}

/** Als `updateVerloop()`, maar gooit nooit: de stoelstatus zelf staat dan al veilig. */
export async function refreshVerloop(input: VerloopInput): Promise<VerloopResult | null> {
  try {
    return await updateVerloop(input);
  } catch (error) {
    console.error("[ringside/verloop] bijwerken mislukt:", error instanceof Error ? error.message : error);
    return null;
  }
}
