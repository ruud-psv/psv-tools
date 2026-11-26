/**
 * Sets van SSO-id's als hash, in het formaat van de Database-tool
 * (`lib/database/index-format.ts`): 8 bytes per fan, gesorteerd, zonder het
 * SSO-id zelf. Daarmee kan Tools van dag tot dag bijhouden wie er in een maand
 * of in het seizoen actief was, en Maileon tegen MijnPSV ontdubbelen, zonder
 * een lijst met SSO-id's te bewaren.
 *
 * Het dagnummer in elk record is de eerste dag waarop de fan gezien werd.
 */

import {
  IndexBuilder,
  dedupe,
  fromBytes,
  intersectionSize,
  isoToDay,
  toBytes,
  type PackedIndex,
} from "../database/index-format";

export type FanSet = PackedIndex;

export const LEGE_SET: FanSet = { words: new Uint32Array(0), count: 0 };

/** Kleine letters, zonder spaties eromheen; leeg wordt `null`. */
export function normaliseerSso(waarde: string | null | undefined): string | null {
  const v = waarde?.trim().toLowerCase();
  return v ? v : null;
}

/** Een set uit genormaliseerde SSO-id's, allemaal met `dag` als eerste dag. */
export function maakSet(ids: Iterable<string>, dag: string): FanSet {
  const dagnummer = isoToDay(dag);
  if (dagnummer < 0) throw new Error(`Ongeldige dag: ${dag}`);
  const builder = new IndexBuilder();
  for (const id of ids) builder.add(id, dagnummer);
  return dedupe(builder.finish()).index;
}

/** Alles uit beide sets, ontdubbeld; bij een dubbele fan blijft de vroegste dag. */
export function voegSamen(a: FanSet, b: FanSet): FanSet {
  if (b.count === 0) return a;
  if (a.count === 0) return b;
  const words = new Uint32Array((a.count + b.count) * 2);
  words.set(a.words.subarray(0, a.count * 2), 0);
  words.set(b.words.subarray(0, b.count * 2), a.count * 2);
  new BigUint64Array(words.buffer).sort();
  return dedupe({ words, count: a.count + b.count }).index;
}

export function overlap(a: FanSet, b: FanSet): number {
  return intersectionSize(a, b);
}

export function naarBytes(set: FanSet): Buffer {
  return Buffer.from(toBytes(set));
}

export function uitBytes(bytes: Uint8Array): FanSet {
  return fromBytes(bytes);
}
