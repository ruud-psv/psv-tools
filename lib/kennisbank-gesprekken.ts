import { createHash, randomBytes } from "crypto";
import { put, del, get, list } from "@vercel/blob";

/**
 * Gesprekken met de kennisbank-assistent, per collega bewaard. Eén blob per
 * gesprek onder een map die is afgeleid van het e-mailadres
 * (`kennisbank-gesprekken/<hash>/<id>.json`), zodat je alleen je eigen
 * gesprekken ziet en twee mensen elkaar niet overschrijven. Zelfde patroon
 * als `lib/mail-builder/mails.ts`.
 */

const PREFIX = "kennisbank-gesprekken/";
const ID_RE = /^[a-f0-9]{32}$/;
/** Zoveel gesprekken toont de zijbalk; oudere blijven bewaard maar staan er niet in. */
const MAX_IN_LIJST = 30;
/** Zoveel berichten gaan maximaal mee naar het model en de opslag. */
export const MAX_BERICHTEN = 40;
const MAX_BERICHT = 8000;
const MAX_TITEL = 80;

export interface GesprekBericht {
  role: "user" | "assistant";
  content: string;
}

export interface Gesprek {
  id: string;
  titel: string;
  berichten: GesprekBericht[];
  createdAt: string;
  updatedAt: string;
}

export type GesprekSamenvatting = Pick<Gesprek, "id" | "titel" | "updatedAt">;

function mapVoor(email: string): string {
  const hash = createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
  return `${PREFIX}${hash}/`;
}

function pathFor(email: string, id: string): string {
  return `${mapVoor(email)}${id}.json`;
}

export function nieuwGesprekId(): string {
  return randomBytes(16).toString("hex");
}

export function isGesprekId(id: unknown): id is string {
  return typeof id === "string" && ID_RE.test(id);
}

export function titelVan(vraag: string): string {
  const schoon = vraag.replace(/\s+/g, " ").trim();
  return schoon.length > MAX_TITEL ? `${schoon.slice(0, MAX_TITEL - 1)}…` : schoon;
}

/**
 * Leest de berichten uit een request. Houdt de laatste MAX_BERICHTEN, begint
 * altijd met een vraag en eindigt met een vraag; geeft null bij iets onbruikbaars.
 */
export function parseBerichten(body: unknown): GesprekBericht[] | null {
  if (!Array.isArray(body)) return null;
  const berichten: GesprekBericht[] = [];
  for (const b of body) {
    if (!b || typeof b !== "object") return null;
    const { role, content } = b as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    const tekst = content.trim().slice(0, MAX_BERICHT);
    if (tekst) berichten.push({ role, content: tekst });
  }
  const recent = berichten.slice(-MAX_BERICHTEN);
  while (recent.length > 0 && recent[0].role !== "user") recent.shift();
  if (recent.length === 0 || recent[recent.length - 1].role !== "user") return null;
  return recent;
}

async function readJson<T>(pathname: string): Promise<T | null> {
  try {
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function saveGesprek(email: string, gesprek: Gesprek): Promise<void> {
  await put(pathFor(email, gesprek.id), JSON.stringify(gesprek), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function getGesprek(email: string, id: string): Promise<Gesprek | null> {
  if (!ID_RE.test(id)) return null;
  const parsed = await readJson<Gesprek>(pathFor(email, id));
  if (!parsed || typeof parsed !== "object" || parsed.id !== id) return null;
  return parsed;
}

export async function listGesprekken(email: string): Promise<GesprekSamenvatting[]> {
  const map = mapVoor(email);
  const { blobs } = await list({ prefix: map });
  const ids = blobs
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
    .map((b) => b.pathname.slice(map.length).replace(/\.json$/, ""))
    .filter((id) => ID_RE.test(id))
    .slice(0, MAX_IN_LIJST);

  const results = await Promise.all(ids.map((id) => getGesprek(email, id)));
  return results
    .filter((g): g is Gesprek => g !== null)
    .map(({ id, titel, updatedAt }) => ({ id, titel, updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteGesprek(email: string, id: string): Promise<boolean> {
  if (!ID_RE.test(id)) return false;
  await del(pathFor(email, id));
  return true;
}
