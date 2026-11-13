/**
 * De samenvatting van Ticketing Stadion in Vercel Blob.
 *
 * De cron van de stoelstatus (`/api/ringside/stoelen`) heeft alle komende
 * wedstrijden toch al in het geheugen. Daar rekenen we de bezetting per vak
 * van de thuiswedstrijden van PSV 1 uit en schrijven één klein bestand weg.
 * De pagina leest alleen dat bestand: snel, en zonder per klik de
 * stoelenkaarten van tienduizenden stoelen te openen.
 */

import { put } from "@vercel/blob";
import { readPrivateBlob } from "../blob/read";
import { todayInAmsterdam, type EventStates } from "../ringside/seat-state";
import { readEventSeats, type SeatIndex } from "../ringside/seat-store";
import { emptySupplyHistory, recordSupply, type SupplyHistory } from "./supply-history";
import { isPsvHomeMatch, summarizeMatch, type StadionMatch } from "./summary";

const SUMMARY_PATH = "ticketing-stadion/summary.json";
const SUPPLY_PATH = "ticketing-stadion/aanbod.json";

export interface StadionSummary {
  generatedAt: string;
  matches: Record<string, StadionMatch>;
}

export async function readStadionSummary(): Promise<StadionSummary | null> {
  const bytes = await readPrivateBlob(SUMMARY_PATH);
  if (!bytes) return null;
  try {
    return JSON.parse(bytes.toString("utf8")) as StadionSummary;
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
 *
 * Geeft de samenvatting terug (nieuw of de opgeslagen), of `null` als dat
 * mislukte.
 */
export async function refreshStadionSummary(
  events: EventStates,
  changed: Set<string>,
  removed: string[]
): Promise<StadionSummary | null> {
  try {
    const touched = [...changed, ...removed].some((eventId) => {
      const event = events.get(eventId);
      return !event || isPsvHomeMatch(event.name);
    });
    if (!touched) {
      const stored = await readStadionSummary();
      if (stored) return stored;
    }
    const summary = buildStadionSummary(events);
    await writeStadionSummary(summary);
    return summary;
  } catch (error) {
    console.error("[ticketing-stadion] samenvatting bijwerken mislukt:", error instanceof Error ? error.message : error);
    return null;
  }
}

/* ---------- Aanbod per dag ---------- */

/** Het aanbod per dag van alle thuiswedstrijden; leeg als het er (nog) niet is. */
export async function readSupplyHistory(): Promise<SupplyHistory> {
  const bytes = await readPrivateBlob(SUPPLY_PATH);
  if (!bytes) return emptySupplyHistory();
  try {
    const parsed = JSON.parse(bytes.toString("utf8")) as Partial<SupplyHistory> | null;
    return parsed?.matches && typeof parsed.matches === "object" ? { matches: parsed.matches } : emptySupplyHistory();
  } catch {
    console.error(`[ticketing-stadion] ${SUPPLY_PATH} niet te lezen.`);
    throw new Error(`${SUPPLY_PATH} staat in de opslag maar is niet te lezen`);
  }
}

/**
 * Na een run van de stoelstatus: legt het aanbod van vandaag vast voor elke
 * thuiswedstrijd in de samenvatting (zie `recordSupply()`). Schrijft alleen als
 * er iets veranderd is. Gooit nooit, net als `refreshStadionSummary()`.
 *
 * Een bestand dat er wel is maar niet te lezen, wordt niet overschreven: dan
 * zou de historie verloren gaan.
 */
export async function recordStadionSupply(summary: StadionSummary): Promise<void> {
  try {
    const { history, changed } = recordSupply(await readSupplyHistory(), Object.values(summary.matches), todayInAmsterdam());
    if (!changed) return;
    await put(SUPPLY_PATH, JSON.stringify(history), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch (error) {
    console.error("[ticketing-stadion] aanbod per dag vastleggen mislukt:", error instanceof Error ? error.message : error);
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
