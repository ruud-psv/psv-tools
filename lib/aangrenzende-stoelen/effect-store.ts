/**
 * Opslag voor het effect van een mail, in Vercel Blob.
 *
 * Per wedstrijd één bestand met alle ticketregels (`./effect-data.ts`),
 * gecomprimeerd: een wedstrijd in het Philips Stadion is zo'n 35.000 tickets
 * plus retouren en reserveringen, een paar megabyte als JSON. Daarnaast de
 * toestand van het inlezen: om welke wedstrijd het nu gaat, de cursor, het slot,
 * en welke wedstrijden al helemaal zijn ingelezen.
 *
 * Er wordt één wedstrijd tegelijk ingelezen. Een wedstrijd die klaar is, blijft
 * bruikbaar als daarna een andere wordt ingelezen; zijn cursor blijft bewaard,
 * zodat hij later snel kan worden bijgewerkt.
 */

import { gunzipSync, gzipSync } from "node:zlib";
import { put } from "@vercel/blob";
import { readPrivateBlob } from "../blob/read";
import type { EffectData } from "./effect-data";

const PREFIX = "aangrenzende-stoelen/effect";
const STATE_PATH = `${PREFIX}/state.json`;

function dataPath(productId: string): string {
  return `${PREFIX}/${productId}.json.gz`;
}

/** Een wedstrijd die één keer helemaal is ingelezen. */
export interface EffectReady {
  name: string;
  eventDate: string;
  tickets: number;
  /** Wanneer de stroom voor deze wedstrijd voor het laatst tot het eind gelezen is. */
  caughtUpAt: string;
  /** Waar het bijwerken verdergaat. */
  cursor: string | null;
}

export interface EffectIngestState {
  /** De wedstrijd die nu wordt ingelezen of bijgewerkt; `null` tot er een gekozen is. */
  productId: string | null;
  name: string | null;
  /** De aftrap zoals de productenlijst hem geeft: Nederlandse tijd, zonder offset. */
  eventDate: string | null;
  /** Waar de volgende run verdergaat; `null` is het begin van de stroom. */
  salesCursor: string | null;
  /** `true` zodra de stroom voor deze wedstrijd één keer tot het eind gelezen is. */
  salesComplete: boolean;
  salesRead: number;
  /** Hoeveel ticketregels van deze wedstrijd er nu liggen. */
  tickets: number;
  runs: number;
  updatedAt: string;
  lastError: string | null;
  /** Slot tegen twee runs tegelijk; zie `isEffectLocked()`. */
  runningUntil: string | null;
  /** Wedstrijden die klaar zijn, op product-id. */
  ready: Record<string, EffectReady>;
}

export const EMPTY_EFFECT_STATE: EffectIngestState = {
  productId: null,
  name: null,
  eventDate: null,
  salesCursor: null,
  salesComplete: false,
  salesRead: 0,
  tickets: 0,
  runs: 0,
  updatedAt: "",
  lastError: null,
  runningUntil: null,
  ready: {},
};

/**
 * Of er een andere run bezig is. Twee runs tegelijk lezen dezelfde cursor en
 * overschrijven daarna elkaars bestand. Een verlopen slot telt niet, zodat een
 * gecrashte run niets blokkeert.
 */
export function isEffectLocked(state: EffectIngestState, now = Date.now()): boolean {
  if (!state.runningUntil) return false;
  const until = new Date(state.runningUntil).getTime();
  return Number.isFinite(until) && until > now;
}

export async function readEffectState(): Promise<EffectIngestState> {
  const bytes = await readPrivateBlob(STATE_PATH);
  if (!bytes) return structuredClone(EMPTY_EFFECT_STATE);
  try {
    return { ...structuredClone(EMPTY_EFFECT_STATE), ...(JSON.parse(bytes.toString("utf8")) as Partial<EffectIngestState>) };
  } catch {
    console.error(`[aangrenzende-stoelen/effect] ${STATE_PATH} niet te lezen.`);
    return structuredClone(EMPTY_EFFECT_STATE);
  }
}

export async function writeEffectState(state: EffectIngestState): Promise<void> {
  await put(STATE_PATH, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function readEffectData(productId: string): Promise<EffectData | null> {
  const bytes = await readPrivateBlob(dataPath(productId));
  if (!bytes) return null;
  try {
    return JSON.parse(gunzipSync(bytes).toString("utf8")) as EffectData;
  } catch {
    console.error(`[aangrenzende-stoelen/effect] data van ${productId} niet te lezen.`);
    return null;
  }
}

export async function writeEffectData(data: EffectData): Promise<void> {
  await put(dataPath(data.productId), gzipSync(JSON.stringify(data)), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/gzip",
  });
}
