import { gunzipSync, gzipSync } from "node:zlib";
import { list, put } from "@vercel/blob";
import { readPrivateBlob } from "../blob/read";

/**
 * Opslag van PSV Play in Vercel Blob, onder `psv-play/`:
 *
 * - `capabilities.json`: de uitkomst van de capability probe.
 * - `<site>/media.json.gz`: titels, tags, publicatiedatum en duur per video.
 * - `<site>/dagen/<eastern_date>.json.gz`: de dagelijkse snapshot.
 * - `<site>/cache/<hash>.json.gz`: query-resultaten over afgesloten dagen.
 *
 * Alles privé. Er staan geen persoonsgegevens in: alleen aggregaten per dag,
 * video, platform, device en land.
 */

export const PREFIX = "psv-play";

export interface Opslag {
  lees(pad: string): Promise<Buffer | null>;
  schrijf(pad: string, data: Buffer | string, contentType: string): Promise<void>;
  /** De paden onder een prefix. */
  lijst(prefix: string): Promise<string[]>;
}

export const blobOpslag: Opslag = {
  lees: (pad) => readPrivateBlob(pad),
  async schrijf(pad, data, contentType) {
    await put(pad, data, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType });
  },
  async lijst(prefix) {
    const paden: string[] = [];
    let cursor: string | undefined;
    do {
      const pagina = await list({ prefix, cursor });
      paden.push(...pagina.blobs.map((b) => b.pathname));
      cursor = pagina.hasMore ? pagina.cursor : undefined;
    } while (cursor);
    return paden;
  },
};

/** Opslag in het geheugen, voor tests en lokaal draaien zonder Blob. */
export function geheugenOpslag(): Opslag & { inhoud: Map<string, Buffer> } {
  const inhoud = new Map<string, Buffer>();
  return {
    inhoud,
    lees: async (pad) => inhoud.get(pad) ?? null,
    schrijf: async (pad, data) => {
      inhoud.set(pad, Buffer.isBuffer(data) ? data : Buffer.from(data));
    },
    lijst: async (prefix) => [...inhoud.keys()].filter((k) => k.startsWith(prefix)).sort(),
  };
}

export async function leesJsonGz<T>(opslag: Opslag, pad: string): Promise<T | null> {
  const bytes = await opslag.lees(pad);
  if (!bytes) return null;
  return JSON.parse(gunzipSync(bytes).toString("utf8")) as T;
}

export async function schrijfJsonGz(opslag: Opslag, pad: string, data: unknown): Promise<void> {
  await opslag.schrijf(pad, gzipSync(JSON.stringify(data)), "application/gzip");
}

export const paden = {
  capabilities: `${PREFIX}/capabilities.json`,
  media: (site: string) => `${PREFIX}/${site}/media.json.gz`,
  dagPrefix: (site: string) => `${PREFIX}/${site}/dagen/`,
  dag: (site: string, datum: string) => `${PREFIX}/${site}/dagen/${datum}.json.gz`,
  cache: (sleutel: string) => `${PREFIX}/cache/${sleutel}.json.gz`,
};
