/**
 * Opslag van de instroom in Vercel Blob.
 *
 * Twee bestanden: de toestand van het inlezen (cursors, voortgang, het slot en
 * om welke wedstrijd het gaat) en de data van die wedstrijd, gecomprimeerd.
 * Een wedstrijd in het Philips Stadion is zo'n 35.000 tickets en evenveel
 * scans; gehashte ids comprimeren slecht, dus dat blijft een paar megabyte.
 */

import { gunzipSync, gzipSync } from "node:zlib";
import { put } from "@vercel/blob";
import { readPrivateBlob } from "../blob/read";
import type { InstroomData } from "./state";

const PREFIX = "ringside/instroom";
const STATE_PATH = `${PREFIX}/state.json`;

function dataPath(productId: string): string {
  return `${PREFIX}/${productId}.json.gz`;
}

export interface InstroomState {
  /** De wedstrijd die wordt ingelezen; `null` tot hij is opgezocht. */
  productId: string | null;
  name: string | null;
  /** De aftrap zoals de productenlijst hem geeft: Nederlandse tijd, zonder offset. */
  eventDate: string | null;
  /** Waar de volgende run verdergaat; `null` is het begin van de stroom. */
  salesCursor: string | null;
  attendanceCursor: string | null;
  /** `true` zodra de stroom één keer tot het eind gelezen is. */
  salesComplete: boolean;
  attendanceComplete: boolean;
  salesRead: number;
  attendanceRead: number;
  /** Hoeveel tickets en scans van deze wedstrijd er nu liggen. */
  tickets: number;
  scans: number;
  runs: number;
  updatedAt: string;
  lastError: string | null;
  /** Slot tegen twee runs tegelijk; zie `isInstroomLocked()`. */
  runningUntil: string | null;
}

export const EMPTY_INSTROOM_STATE: InstroomState = {
  productId: null,
  name: null,
  eventDate: null,
  salesCursor: null,
  attendanceCursor: null,
  salesComplete: false,
  attendanceComplete: false,
  salesRead: 0,
  attendanceRead: 0,
  tickets: 0,
  scans: 0,
  runs: 0,
  updatedAt: "",
  lastError: null,
  runningUntil: null,
};

/**
 * Of er een andere run bezig is. Twee runs tegelijk lezen dezelfde cursor en
 * overschrijven daarna elkaars bestand. Een verlopen slot telt niet, zodat een
 * gecrashte run niets blokkeert.
 */
export function isInstroomLocked(state: InstroomState, now = Date.now()): boolean {
  if (!state.runningUntil) return false;
  const until = new Date(state.runningUntil).getTime();
  return Number.isFinite(until) && until > now;
}

export async function readInstroomState(): Promise<InstroomState> {
  const bytes = await readPrivateBlob(STATE_PATH);
  if (!bytes) return { ...EMPTY_INSTROOM_STATE };
  try {
    return { ...EMPTY_INSTROOM_STATE, ...(JSON.parse(bytes.toString("utf8")) as Partial<InstroomState>) };
  } catch {
    console.error(`[ringside/instroom] ${STATE_PATH} niet te lezen.`);
    return { ...EMPTY_INSTROOM_STATE };
  }
}

export async function writeInstroomState(state: InstroomState): Promise<void> {
  await put(STATE_PATH, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function readInstroomData(productId: string): Promise<InstroomData | null> {
  const bytes = await readPrivateBlob(dataPath(productId));
  if (!bytes) return null;
  try {
    return JSON.parse(gunzipSync(bytes).toString("utf8")) as InstroomData;
  } catch {
    console.error(`[ringside/instroom] data van ${productId} niet te lezen.`);
    return null;
  }
}

export async function writeInstroomData(data: InstroomData): Promise<void> {
  await put(dataPath(data.productId), gzipSync(JSON.stringify(data)), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/gzip",
  });
}
