/**
 * Hulpjes voor beelden in privé Vercel Blob, gedeeld door de beeldtools.
 *
 * De blobs staan privé: de browser krijgt ze via een route achter de login, en
 * een beeldmodel krijgt ze als data-URL die de server zelf samenstelt, want
 * Replicate kan een privé blob niet ophalen.
 */

import { get } from "@vercel/blob";

/**
 * Zonder blob-token valt er niets te delen. De melding komt in de UI terecht,
 * dus hij vertelt meteen wat eraan te doen is.
 */
export function meldOpslagfout(err: unknown): never {
  const tekst = err instanceof Error ? err.message : String(err);
  if (/token/i.test(tekst)) {
    throw new Error(
      "De gedeelde opslag is niet geconfigureerd (BLOB_READ_WRITE_TOKEN ontbreekt). Koppel een Blob-store in Vercel."
    );
  }
  throw err instanceof Error ? err : new Error(tekst);
}

/** Maakt een bestandsnaam die veilig in een blob-pad past. */
export function veiligeNaam(ruw: string, standaard = "bestand"): string {
  return (
    ruw
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-zA-Z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 40) || standaard
  );
}

/** Een korte, unieke sleutel voor in een blob-pad. */
export function nieuwId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** De beeldtypes die we opslaan. */
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MIMES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function extensieVoor(contentType: string): string | undefined {
  return TYPES[contentType.toLowerCase().split(";")[0].trim()];
}

/** Het beeldtype hoort bij de extensie in het pad, niet bij een aanname. */
export function mimeVanPad(pad: string): string {
  const ext = pad.split(".").pop()?.toLowerCase() ?? "";
  return MIMES[ext] ?? "application/octet-stream";
}

/** Leest een privé blob in zijn geheel; `null` als hij er niet (meer) is. */
export async function leesPriveBlob(pad: string): Promise<Buffer | null> {
  try {
    const resultaat = await get(pad, { access: "private", useCache: false });
    if (!resultaat?.stream) return null;
    return Buffer.from(await new Response(resultaat.stream).arrayBuffer());
  } catch {
    return null;
  }
}

/** Zet de inhoud van een beeld om in een data-URL voor het beeldmodel. */
export function alsDataUrl(pad: string, inhoud: Buffer): string {
  return `data:${mimeVanPad(pad)};base64,${inhoud.toString("base64")}`;
}
