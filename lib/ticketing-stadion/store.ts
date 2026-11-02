/**
 * De samenvatting van Ticketing Stadion in Vercel Blob.
 *
 * De cron van de stoelstatus (`/api/ringside/stoelen`) heeft alle komende
 * wedstrijden toch al in het geheugen. Daar rekenen we de bezetting per vak
 * van de thuiswedstrijden van PSV 1 uit en schrijven één klein bestand weg.
 * De pagina leest alleen dat bestand: snel, en zonder per klik de
 * stoelenkaarten van tienduizenden stoelen te openen.
 */

import { get, put } from "@vercel/blob";
import type { EventStates } from "../ringside/seat-state";
import { readEventSeats, type SeatIndex } from "../ringside/seat-store";
import { isPsvHomeMatch, summarizeMatch, type StadionMatch } from "./summary";

const SUMMARY_PATH = "ticketing-stadion/summary.json";

export interface StadionSummary {
  generatedAt: string;
  matches: Record<string, StadionMatch>;
}

export async function readStadionSummary(): Promise<StadionSummary | null> {
  const result = await get(SUMMARY_PATH, { access: "private", useCache: false });
  if (!result || !result.stream) return null;
  try {
    return JSON.parse(await new Response(result.stream).text()) as StadionSummary;
  } catch {
    console.error(`[ticketing-stadion] ${SUMMARY_PATH} niet te lezen.`);
    return null;
  }
}

async function writeStadionSummary(summary: StadionSummary): Promise<void> {
  await put(SUMMARY_PATH, JSON.stringify(summary), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/** Rekent de samenvatting uit voor de thuiswedstrijden van PSV 1. */
export function buildStadionSummary(events: EventStates): StadionSummary {
  const matches: Record<string, StadionMatch> = {};
  for (const event of events.values()) {
    if (isPsvHomeMatch(event.name)) matches[event.eventId] = summarizeMatch(event);
  }
  return { generatedAt: new Date().toISOString(), matches };
}

/**
 * Na een run van de stoelstatus: schrijft de samenvatting opnieuw als er een
 * thuiswedstrijd van PSV 1 veranderd of verdwenen is. Gooit nooit: de
 * stoelstatus zelf is dan al veilig opgeslagen, en de volgende run probeert
 * het opnieuw.
 */
export async function refreshStadionSummary(
  events: EventStates,
  changed: Set<string>,
  removed: string[]
): Promise<void> {
  try {
    const touched = [...changed, ...removed].some((eventId) => {
      const event = events.get(eventId);
      return !event || isPsvHomeMatch(event.name);
    });
    if (!touched && (await readStadionSummary())) return;
    await writeStadionSummary(buildStadionSummary(events));
  } catch (error) {
    console.error("[ticketing-stadion] samenvatting bijwerken mislukt:", error instanceof Error ? error.message : error);
  }
}

/**
 * Als er nog geen samenvatting is (de eerste keer, voor de cron hem schreef):
 * zelf uitrekenen uit de bestanden van alleen de thuiswedstrijden.
 */
export async function buildStadionSummaryFromIndex(index: SeatIndex): Promise<StadionSummary> {
  const ids = Object.values(index)
    .filter((entry) => isPsvHomeMatch(entry.name))
    .map((entry) => entry.eventId);
  const events: EventStates = new Map();
  for (const event of await Promise.all(ids.map(readEventSeats))) if (event) events.set(event.eventId, event);
  return buildStadionSummary(events);
}
