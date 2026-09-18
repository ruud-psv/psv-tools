/**
 * Lezen en schrijven op Vercel Blob voor de Database-tool.
 *
 * Bestaat apart omdat het onderscheid tussen "staat er nog niet" en "kon er niet
 * bij" hier zwaarder weegt dan elders in Tools. `get()` geeft `null` bij een 404
 * en werpt bij al het andere — ontbrekende credentials, netwerk, een storing.
 * Een try/catch om beide heen zou een storing tonen als "nog geen bronbestand",
 * en dan upload je een nieuwe export terwijl er niets mis is met de oude.
 */

import { put, get } from "@vercel/blob";

/** De tekst van een blob, of null als hij (nog) niet bestaat. */
export async function readBlobText(pathname: string): Promise<string | null> {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result?.stream) return null;
  return new Response(result.stream).text();
}

/** De bytes van een blob, of null als hij (nog) niet bestaat. */
export async function readBlobBytes(pathname: string): Promise<Uint8Array | null> {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result?.stream) return null;
  return new Uint8Array(await new Response(result.stream).arrayBuffer());
}

/**
 * Geparste JSON, of null als de blob niet bestaat. Onleesbare JSON levert ook
 * null op — daar valt niets aan te herstellen door het opnieuw te proberen — maar
 * wel met een logregel, want dat hoort niet te gebeuren.
 */
export async function readBlobJson<T>(pathname: string): Promise<T | null> {
  const text = await readBlobText(pathname);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    console.error(`[database] ${pathname} bevat geen geldige JSON.`);
    return null;
  }
}

export async function writeBlobJson(pathname: string, data: unknown): Promise<void> {
  await put(pathname, JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function writeBlobBytes(
  pathname: string,
  bytes: ArrayBuffer | Uint8Array
): Promise<void> {
  await put(pathname, Buffer.from(bytes as ArrayBuffer), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/octet-stream",
  });
}
