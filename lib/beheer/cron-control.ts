/**
 * Crons pauzeren en weer starten vanuit Beheer.
 *
 * De pauze staat in een eigen klein bestand, níet in de toestand van de cron
 * zelf. Een run leest zijn toestand aan het begin en schrijft hem aan het eind
 * helemaal terug; een pauze die tijdens de run in die toestand gezet werd, zou
 * hij dus ongemerkt overschrijven.
 *
 * Een gepauzeerde cron start geen nieuwe run en zet zijn ketting niet voort.
 * Een run die al bezig is, maakt zijn werk af (hooguit een paar minuten) en
 * slaat netjes op; daarna stopt hij.
 */

import { put } from "@vercel/blob";
import { readPrivateBlob } from "../blob/read";

const PATH = "beheer/cron-pauze.json";

export const CONTROLLED_JOBS = ["ringside-verkoop", "ringside-stoelen"] as const;
export type ControlledJob = (typeof CONTROLLED_JOBS)[number];

export interface PauseEntry {
  paused: boolean;
  by: string | null;
  at: string | null;
}

export type PauseState = Partial<Record<ControlledJob, PauseEntry>>;

export function isControlledJob(value: unknown): value is ControlledJob {
  return typeof value === "string" && (CONTROLLED_JOBS as readonly string[]).includes(value);
}

/**
 * Leest de pauzes. Gooit nooit: is het bestand er niet of onleesbaar, dan is
 * niets gepauzeerd. Liever een cron die doorloopt dan een die stil ligt omdat
 * een bestand haperde.
 */
export async function readPauses(): Promise<PauseState> {
  try {
    const bytes = await readPrivateBlob(PATH);
    return bytes ? (JSON.parse(bytes.toString("utf8")) as PauseState) : {};
  } catch (error) {
    console.error("[beheer/crons] pauzes niet te lezen:", error instanceof Error ? error.message : error);
    return {};
  }
}

export async function isPaused(job: ControlledJob): Promise<boolean> {
  return Boolean((await readPauses())[job]?.paused);
}

export async function setPaused(job: ControlledJob, paused: boolean, by: string): Promise<PauseState> {
  const pauses = await readPauses();
  pauses[job] = { paused, by, at: new Date().toISOString() };
  await put(PATH, JSON.stringify(pauses), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  return pauses;
}
