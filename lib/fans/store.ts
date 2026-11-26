/**
 * Opslag van Active & Engaged Fans in Vercel Blob, onder `fans/`:
 *
 * - `status.json`: het slot, de laatste run en de laatste fout.
 * - `<seizoen>/historie.json`: per dag de aantallen, en tot waar elke bron is
 *   ingelezen (`types.ts`).
 * - `<seizoen>/sets/<bron>/<seizoen|JJJJ-MM>.bin`: wie er in het seizoen of in
 *   een maand actief was, als hash (`sets.ts`). Geen SSO-id's.
 *
 * Een historie die er wel is maar niet te lezen, is een fout en geen lege
 * historie: anders begint een run opnieuw en schrijft dat over de cijfers heen.
 */

import { blobOpslag, geheugenOpslag, type Opslag } from "../jwplayer/store";
import { LEGE_SET, naarBytes, uitBytes, type FanSet } from "./sets";
import type { Historie } from "./types";

export { blobOpslag, geheugenOpslag, type Opslag };

export const PREFIX = "fans";
export type BronSleutel = "maileon" | "mijnpsv";

export const paden = {
  status: `${PREFIX}/status.json`,
  historie: (seizoen: string) => `${PREFIX}/${seizoen}/historie.json`,
  set: (seizoen: string, bron: BronSleutel, sleutel: string) => `${PREFIX}/${seizoen}/sets/${bron}/${sleutel}.bin`,
};

export async function leesHistorie(opslag: Opslag, seizoen: string): Promise<Historie | null> {
  const bytes = await opslag.lees(paden.historie(seizoen));
  if (!bytes) return null;
  const h = JSON.parse(bytes.toString("utf8")) as Historie | null;
  if (!h || h.versie !== 1 || !Array.isArray(h.dagen)) throw new Error(`${paden.historie(seizoen)} heeft niet de verwachte vorm.`);
  return h;
}

export async function schrijfHistorie(opslag: Opslag, h: Historie): Promise<void> {
  await opslag.schrijf(paden.historie(h.seizoen), JSON.stringify(h), "application/json");
}

export async function leesSet(opslag: Opslag, seizoen: string, bron: BronSleutel, sleutel: string): Promise<FanSet> {
  const bytes = await opslag.lees(paden.set(seizoen, bron, sleutel));
  return bytes ? uitBytes(new Uint8Array(bytes)) : LEGE_SET;
}

export async function schrijfSet(opslag: Opslag, seizoen: string, bron: BronSleutel, sleutel: string, set: FanSet): Promise<void> {
  await opslag.schrijf(paden.set(seizoen, bron, sleutel), naarBytes(set), "application/octet-stream");
}

/* ---------- Status ---------- */

export interface FansStatus {
  runs: number;
  lastRunAt: string | null;
  lastError: string | null;
  /** Tot wanneer een run bezig is; een verlopen slot telt niet. */
  runningUntil: string | null;
}

export const LEGE_STATUS: FansStatus = { runs: 0, lastRunAt: null, lastError: null, runningUntil: null };

export function isBezig(status: FansStatus, nu = Date.now()): boolean {
  if (!status.runningUntil) return false;
  const tot = new Date(status.runningUntil).getTime();
  return Number.isFinite(tot) && tot > nu;
}

export async function leesStatus(opslag: Opslag): Promise<FansStatus> {
  const bytes = await opslag.lees(paden.status);
  if (!bytes) return { ...LEGE_STATUS };
  try {
    return { ...LEGE_STATUS, ...(JSON.parse(bytes.toString("utf8")) as Partial<FansStatus>) };
  } catch {
    console.error(`[fans] ${paden.status} niet te lezen.`);
    return { ...LEGE_STATUS };
  }
}

export async function schrijfStatus(opslag: Opslag, status: FansStatus): Promise<void> {
  await opslag.schrijf(paden.status, JSON.stringify(status), "application/json");
}
