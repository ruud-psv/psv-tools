import { createHash, randomBytes } from "crypto";
import { del, get, list, put } from "@vercel/blob";

import type { Stuk, StukInhoud } from "./model";

/**
 * De opslag van stukken in Vercel Blob.
 *
 * - Een stuk staat bij zijn eigenaar: `stukken/<hash van e-mail>/<gesprek-id>.json`.
 *   Wie een ander e-mailadres heeft, vindt het dus niet.
 * - Een deellink staat apart, onder een willekeurig id dat niet te raden is:
 *   `stukken-delen/<id>.json`. Daarin staat een momentopname van het stuk, zodat
 *   de link niet verandert als je het stuk daarna nog aanpast, en niet bij de
 *   rest van PSV Tools kan.
 *
 * Lezen gooit een fout bij een storing en geeft alleen `null` als er echt niets
 * is; anders zou een storing als "nog geen stuk" gelden en een bestaand stuk
 * worden overschreven.
 */

const STUKKEN = "stukken/";
const DELEN = "stukken-delen/";
const ID = /^[a-f0-9]{32}$/;
const MAX_IN_LIJST = 30;

export interface DeelRecord {
  id: string;
  eigenaarHash: string;
  stukId: string;
  publiek: boolean;
  verlooptOp?: string;
  gedeeldOp: string;
  gedeeldDoor: string;
  /** De momentopname: zo ziet de link het stuk. */
  stuk: StukInhoud & { versie: number; peildatum: string };
}

export interface StukSamenvatting {
  id: string;
  titel: string;
  soort: Stuk["soort"];
  versie: number;
  updatedAt: string;
  gedeeld: boolean;
}

export function eigenaarHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
}

export function isStukId(id: unknown): id is string {
  return typeof id === "string" && ID.test(id);
}

export function nieuwDeelId(): string {
  return randomBytes(16).toString("hex");
}

function stukPad(email: string, id: string): string {
  return `${STUKKEN}${eigenaarHash(email)}/${id}.json`;
}

async function lees<T>(pathname: string): Promise<T | null> {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result?.stream) return null;
  return JSON.parse(await new Response(result.stream).text()) as T;
}

async function schrijf(pathname: string, data: unknown): Promise<void> {
  await put(pathname, JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function getStuk(email: string, id: string): Promise<Stuk | null> {
  if (!isStukId(id)) return null;
  return lees<Stuk>(stukPad(email, id));
}

export async function saveStuk(stuk: Stuk): Promise<void> {
  if (!isStukId(stuk.id)) throw new Error("Ongeldig stuk-id.");
  await schrijf(stukPad(stuk.eigenaar, stuk.id), stuk);
}

/** Verwijdert een stuk en zijn deellink (bijvoorbeeld als het gesprek weg is). */
export async function deleteStuk(email: string, id: string): Promise<void> {
  if (!isStukId(id)) return;
  const stuk = await lees<Stuk>(stukPad(email, id)).catch(() => null);
  if (stuk?.deellink) await del(`${DELEN}${stuk.deellink.id}.json`).catch(() => undefined);
  await del(stukPad(email, id)).catch(() => undefined);
}

export async function listStukken(email: string): Promise<StukSamenvatting[]> {
  const map = `${STUKKEN}${eigenaarHash(email)}/`;
  const { blobs } = await list({ prefix: map });
  const recent = blobs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()).slice(0, MAX_IN_LIJST);
  const stukken = await Promise.all(recent.map((b) => lees<Stuk>(b.pathname).catch(() => null)));
  return stukken
    .filter((s): s is Stuk => Boolean(s))
    .map((s) => ({ id: s.id, titel: s.titel, soort: s.soort, versie: s.versie, updatedAt: s.updatedAt, gedeeld: Boolean(s.deellink) }));
}

export async function getDeelRecord(id: string): Promise<DeelRecord | null> {
  if (!ID.test(id)) return null;
  return lees<DeelRecord>(`${DELEN}${id}.json`);
}

export async function saveDeelRecord(record: DeelRecord): Promise<void> {
  if (!ID.test(record.id)) throw new Error("Ongeldig deel-id.");
  await schrijf(`${DELEN}${record.id}.json`, record);
}

export async function deleteDeelRecord(id: string): Promise<void> {
  if (!ID.test(id)) return;
  await del(`${DELEN}${id}.json`);
}
