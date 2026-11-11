/**
 * Opslag van wat de stoelstatus aan het verkoopverloop bijdraagt, in Vercel
 * Blob onder `ringside/verloop/`.
 *
 * - **`stoelstatus.json.gz`**: de reeksen van komende wedstrijden (`upcoming`,
 *   elke run opnieuw gerekend) en de eindstand van gespeelde wedstrijden
 *   (`frozen`, vastgelegd op het moment dat de stoelstatus de wedstrijd
 *   opruimt). `readEventSales()` legt beide over de tellingen van de
 *   verkoop-ingest heen. Eén schrijver: de cron van de stoelstatus.
 * - **`metingen/<eventId>.json.gz`**: per wedstrijd de stand per uur. Blijft
 *   staan na de wedstrijd.
 */

import { gunzipSync, gzipSync } from "node:zlib";
import { put } from "@vercel/blob";
import { readPrivateBlob } from "../blob/read";
import type { SeatSeries, TimelinePoint } from "./seat-series";

const SERIES_PATH = "ringside/verloop/stoelstatus.json.gz";

function timelinePath(eventId: string): string {
  return `ringside/verloop/metingen/${eventId}.json.gz`;
}

export interface SeatSeriesFile {
  updatedAt: string;
  /** Het uur (UTC, `2026-11-11T14`) van de laatste meting. */
  measuredHour: string | null;
  upcoming: Record<string, SeatSeries>;
  frozen: Record<string, SeatSeries>;
}

export interface EventTimeline {
  eventId: string;
  name: string | null;
  eventDate: string | null;
  points: TimelinePoint[];
}

async function readGzip<T>(path: string): Promise<T | null> {
  const bytes = await readPrivateBlob(path);
  if (!bytes) return null;
  return JSON.parse(gunzipSync(bytes).toString("utf8")) as T;
}

async function writeGzip(path: string, value: unknown): Promise<void> {
  await put(path, gzipSync(JSON.stringify(value)), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/gzip",
  });
}

/** `null` als het bestand er niet is; gooit als het niet te lezen is. */
export async function readSeatSeries(): Promise<SeatSeriesFile | null> {
  const file = await readGzip<Partial<SeatSeriesFile>>(SERIES_PATH);
  return file ? { updatedAt: file.updatedAt ?? "", measuredHour: file.measuredHour ?? null, upcoming: file.upcoming ?? {}, frozen: file.frozen ?? {} } : null;
}

export async function writeSeatSeries(file: SeatSeriesFile): Promise<void> {
  await writeGzip(SERIES_PATH, file);
}

export async function readTimeline(eventId: string): Promise<EventTimeline | null> {
  return readGzip<EventTimeline>(timelinePath(eventId));
}

export async function writeTimeline(timeline: EventTimeline): Promise<void> {
  await writeGzip(timelinePath(timeline.eventId), timeline);
}
