import { get, put } from "@vercel/blob";

import type { Vaardigheid } from "./vaardigheden";

/**
 * De vaardigheden van de assistent staan als één JSON-bestand in Vercel Blob,
 * net als de MCP-servers en de Model garden. De assistent leest ze bij elke
 * vraag; daarom een korte cache per serverinstantie.
 */
const PATH = "beheer/assistent-vaardigheden.json";
const CACHE_MS = 15_000;

let cache: { vaardigheden: Vaardigheid[]; at: number } | null = null;

async function load(): Promise<Vaardigheid[]> {
  const result = await get(PATH, { access: "private", useCache: false });
  if (!result?.stream) return [];
  const data = JSON.parse(await new Response(result.stream).text()) as { vaardigheden?: Vaardigheid[] };
  return Array.isArray(data.vaardigheden) ? data.vaardigheden : [];
}

/** Voor de assistent: bij een storing de laatst bekende lijst, of geen. */
export async function readVaardigheden(): Promise<Vaardigheid[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.vaardigheden;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return [];
  try {
    const vaardigheden = await load();
    cache = { vaardigheden, at: Date.now() };
    return vaardigheden;
  } catch (err) {
    console.error("[assistent] vaardigheden lezen mislukt:", err instanceof Error ? err.message : err);
    return cache?.vaardigheden ?? [];
  }
}

/** Voor het beheer: altijd vers, en een storing gooit een fout, zodat er niets wordt overschreven. */
export async function readVaardighedenStrict(): Promise<Vaardigheid[]> {
  const vaardigheden = await load();
  cache = { vaardigheden, at: Date.now() };
  return vaardigheden;
}

export async function writeVaardigheden(vaardigheden: Vaardigheid[]): Promise<void> {
  const sorted = [...vaardigheden].sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
  await put(PATH, JSON.stringify({ vaardigheden: sorted }, null, 2), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  cache = { vaardigheden: sorted, at: Date.now() };
}
