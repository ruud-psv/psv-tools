/**
 * Opslag van de wachtlijst in Vercel Blob, onder `ringside/wachtlijst/`.
 *
 * - **`data.json.gz`**: de regels van de wachtlijst, wat we van de klanten
 *   weten en de cursors. Cursor en data staan in één bestand, zodat ze nooit
 *   uit elkaar lopen.
 * - **`state.json`**: het slot en de laatste fout.
 *
 * Een databestand dat er wel is maar niet te lezen, is een fout en geen lege
 * lijst: anders begint een run leeg en schrijft dat terug over de data.
 */

import { gunzipSync, gzipSync } from "node:zlib";
import { put } from "@vercel/blob";
import { readPrivateBlob } from "../blob/read";
import { emptyWaitlistData, type WaitlistData } from "./data";

const PREFIX = "ringside/wachtlijst";
const DATA_PATH = `${PREFIX}/data.json.gz`;
const STATE_PATH = `${PREFIX}/state.json`;

export interface WaitlistState {
  runs: number;
  lastRunAt: string | null;
  lastError: string | null;
  /** Tot wanneer een run bezig is; een verlopen slot telt niet. */
  runningUntil: string | null;
}

export const EMPTY_WAITLIST_STATE: WaitlistState = { runs: 0, lastRunAt: null, lastError: null, runningUntil: null };

export function isWaitlistLocked(state: WaitlistState, now = Date.now()): boolean {
  if (!state.runningUntil) return false;
  const until = new Date(state.runningUntil).getTime();
  return Number.isFinite(until) && until > now;
}

export async function readWaitlistState(): Promise<WaitlistState> {
  const bytes = await readPrivateBlob(STATE_PATH);
  if (!bytes) return { ...EMPTY_WAITLIST_STATE };
  try {
    return { ...EMPTY_WAITLIST_STATE, ...(JSON.parse(bytes.toString("utf8")) as Partial<WaitlistState>) };
  } catch {
    console.error(`[wachtlijst] ${STATE_PATH} niet te lezen.`);
    return { ...EMPTY_WAITLIST_STATE };
  }
}

export async function writeWaitlistState(state: WaitlistState): Promise<void> {
  await put(STATE_PATH, JSON.stringify(state), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/** De data, of `null` als er nog niets is ingelezen. Gooit als het bestand onleesbaar is. */
export async function readWaitlistData(): Promise<WaitlistData | null> {
  const bytes = await readPrivateBlob(DATA_PATH);
  if (!bytes) return null;
  const parsed = JSON.parse(gunzipSync(bytes).toString("utf8")) as Partial<WaitlistData> | null;
  if (!parsed || typeof parsed !== "object" || typeof parsed.rows !== "object") {
    throw new Error(`${DATA_PATH} heeft niet de verwachte vorm.`);
  }
  const empty = emptyWaitlistData();
  return { ...empty, ...parsed, columns: { ...empty.columns, ...parsed.columns } };
}

export async function writeWaitlistData(data: WaitlistData): Promise<void> {
  await put(DATA_PATH, gzipSync(JSON.stringify(data)), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/gzip",
  });
}
