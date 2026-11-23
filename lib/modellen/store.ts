import { get, put } from "@vercel/blob";

import { actiefModel, plek, type ActiefModel, type ModelKeuze, type PlekId } from "./config";

/**
 * De keuzes uit de Model garden staan als één JSON-bestand in Vercel Blob, net
 * als de MCP-servers. Elke aanroep van Claude leest ze; daarom een korte cache
 * per serverinstantie. Een wijziging is binnen `CACHE_MS` overal actief.
 */
const PATH = "beheer/model-garden.json";
const CACHE_MS = 15_000;

export type ModelKeuzes = Record<string, ModelKeuze>;

let cache: { keuzes: ModelKeuzes; at: number } | null = null;

async function load(): Promise<ModelKeuzes> {
  const result = await get(PATH, { access: "private", useCache: false });
  if (!result?.stream) return {};
  const data = JSON.parse(await new Response(result.stream).text()) as { keuzes?: ModelKeuzes };
  return data.keuzes && typeof data.keuzes === "object" ? data.keuzes : {};
}

/**
 * Voor de plekken zelf: bij een storing de laatst bekende keuzes, of geen.
 * Zonder keuze draait het standaardmodel; een vraag werkt dus altijd.
 */
export async function readKeuzes(): Promise<ModelKeuzes> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.keuzes;
  // Zonder Blob-store (lokaal, in tests) zijn er geen keuzes.
  if (!process.env.BLOB_READ_WRITE_TOKEN) return {};
  try {
    const keuzes = await load();
    cache = { keuzes, at: Date.now() };
    return keuzes;
  } catch (err) {
    console.error("[model-garden] Keuzes lezen mislukt:", err instanceof Error ? err.message : err);
    return cache?.keuzes ?? {};
  }
}

/** Voor het beheer: altijd vers, en een storing gooit een fout, zodat er niets wordt overschreven. */
export async function readKeuzesStrict(): Promise<ModelKeuzes> {
  const keuzes = await load();
  cache = { keuzes, at: Date.now() };
  return keuzes;
}

export async function writeKeuzes(keuzes: ModelKeuzes): Promise<void> {
  await put(PATH, JSON.stringify({ keuzes }, null, 2), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  cache = { keuzes, at: Date.now() };
}

/** Het model dat nu op deze plek draait. */
export async function modelVoor(id: PlekId): Promise<ActiefModel> {
  return actiefModel(plek(id), (await readKeuzes())[id]);
}
