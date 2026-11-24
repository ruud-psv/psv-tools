import { createHash, randomBytes } from "crypto";
import { del, get, list, put } from "@vercel/blob";

import { normaliseer, type Stuk, type StukInhoud } from "./model";

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
/**
 * Per collega een verwijzing naar wat met hem gedeeld is:
 * `stukken-met-mij/<hash ontvanger>/<hash eigenaar>.<stuk-id>.json`. Alleen een
 * verwijzing; het stuk zelf blijft bij de eigenaar en wordt bij het lezen
 * opnieuw gecontroleerd (staat de collega er nog in?).
 */
const MET_MIJ = "stukken-met-mij/";
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
  /** Met hoeveel collega's het stuk op naam gedeeld is. */
  collegas: number;
}

export interface MetMijRecord {
  eigenaar: string;
  eigenaarNaam?: string;
  eigenaarHash: string;
  stukId: string;
  gedeeldOp: string;
}

export interface MetMijSamenvatting {
  id: string;
  eigenaarHash: string;
  eigenaar: string;
  eigenaarNaam?: string;
  titel: string;
  soort: Stuk["soort"];
  versie: number;
  updatedAt: string;
  gedeeldOp: string;
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
  const stuk = await lees<Stuk>(stukPad(email, id));
  return stuk && normaliseer(stuk);
}

export async function saveStuk(stuk: Stuk): Promise<void> {
  if (!isStukId(stuk.id)) throw new Error("Ongeldig stuk-id.");
  await schrijf(stukPad(stuk.eigenaar, stuk.id), stuk);
}

/**
 * Een stuk via de hash van de eigenaar: voor een collega met wie het gedeeld
 * is. Of hij het mag lezen, bepaalt de aanroeper (`magLezen`).
 */
export async function getStukVanEigenaar(hash: string, id: string): Promise<Stuk | null> {
  if (!ID.test(hash) || !isStukId(id)) return null;
  const stuk = await lees<Stuk>(`${STUKKEN}${hash}/${id}.json`);
  return stuk && normaliseer(stuk);
}

/** Verwijdert een stuk, zijn deellink en wat met collega's gedeeld is (bijvoorbeeld als het gesprek weg is). */
export async function deleteStuk(email: string, id: string): Promise<void> {
  if (!isStukId(id)) return;
  const stuk = await lees<Stuk>(stukPad(email, id)).catch(() => null);
  if (stuk?.deellink) await del(`${DELEN}${stuk.deellink.id}.json`).catch(() => undefined);
  await Promise.all((stuk?.gedeeldMet ?? []).map((c) => deleteMetMijRecord(c.email, eigenaarHash(email), id).catch(() => undefined)));
  await del(stukPad(email, id)).catch(() => undefined);
}

/** De stukken van een collega, nieuwste eerst; standaard de laatste 30 (de lijst naast de chat). */
export async function listStukken(email: string, max = MAX_IN_LIJST): Promise<StukSamenvatting[]> {
  const map = `${STUKKEN}${eigenaarHash(email)}/`;
  const blobs = await alleBlobs(map);
  const recent = blobs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()).slice(0, max);
  const stukken = await Promise.all(recent.map((b) => lees<Stuk>(b.pathname).catch(() => null)));
  return stukken
    .filter((s): s is Stuk => Boolean(s))
    .map(normaliseer)
    .map((s) => ({
      id: s.id,
      titel: s.titel,
      soort: s.soort,
      versie: s.versie,
      updatedAt: s.updatedAt,
      gedeeld: Boolean(s.deellink),
      collegas: s.gedeeldMet?.length ?? 0,
    }));
}

/** Alle blobs onder een map, ook als het er meer zijn dan op één pagina passen. */
async function alleBlobs(prefix: string) {
  const blobs: Awaited<ReturnType<typeof list>>["blobs"] = [];
  let cursor: string | undefined;
  do {
    const pagina = await list({ prefix, cursor });
    blobs.push(...pagina.blobs);
    cursor = pagina.hasMore ? pagina.cursor : undefined;
  } while (cursor);
  return blobs;
}

function metMijPad(ontvanger: string, hash: string, stukId: string): string {
  return `${MET_MIJ}${eigenaarHash(ontvanger)}/${hash}.${stukId}.json`;
}

export async function saveMetMijRecord(ontvanger: string, record: MetMijRecord): Promise<void> {
  if (!ID.test(record.eigenaarHash) || !isStukId(record.stukId)) throw new Error("Ongeldig stuk.");
  await schrijf(metMijPad(ontvanger, record.eigenaarHash, record.stukId), record);
}

export async function deleteMetMijRecord(ontvanger: string, hash: string, stukId: string): Promise<void> {
  if (!ID.test(hash) || !isStukId(stukId)) return;
  await del(metMijPad(ontvanger, hash, stukId));
}

/**
 * Wat met deze collega gedeeld is, nieuwste wijziging eerst. Elk stuk wordt bij
 * de eigenaar gelezen: is het weg of staat de collega er niet meer in, dan valt
 * het uit de lijst.
 */
export async function listMetMij(email: string): Promise<MetMijSamenvatting[]> {
  const ik = email.trim().toLowerCase();
  const blobs = await alleBlobs(`${MET_MIJ}${eigenaarHash(email)}/`);
  const items = await Promise.all(
    blobs.map(async (b) => {
      const record = await lees<MetMijRecord>(b.pathname).catch(() => null);
      if (!record) return null;
      const stuk = await getStukVanEigenaar(record.eigenaarHash, record.stukId).catch(() => null);
      if (!stuk || !stuk.gedeeldMet?.some((c) => c.email === ik)) return null;
      return {
        id: stuk.id,
        eigenaarHash: record.eigenaarHash,
        eigenaar: stuk.eigenaar,
        ...(record.eigenaarNaam && { eigenaarNaam: record.eigenaarNaam }),
        titel: stuk.titel,
        soort: stuk.soort,
        versie: stuk.versie,
        updatedAt: stuk.updatedAt,
        gedeeldOp: record.gedeeldOp,
      } satisfies MetMijSamenvatting;
    })
  );
  return items.filter((x): x is MetMijSamenvatting => x !== null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDeelRecord(id: string): Promise<DeelRecord | null> {
  if (!ID.test(id)) return null;
  const record = await lees<DeelRecord>(`${DELEN}${id}.json`);
  return record && { ...record, stuk: normaliseer(record.stuk) };
}

export async function saveDeelRecord(record: DeelRecord): Promise<void> {
  if (!ID.test(record.id)) throw new Error("Ongeldig deel-id.");
  await schrijf(`${DELEN}${record.id}.json`, record);
}

export async function deleteDeelRecord(id: string): Promise<void> {
  if (!ID.test(id)) return;
  await del(`${DELEN}${id}.json`);
}
