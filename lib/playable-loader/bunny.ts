/**
 * Het stramien op Bunny, en wat er via de Playable loader op Bunny mag komen.
 *
 * - `playable/pages/<campagne-ID>/page.js`: de pagina van een campagne. Alleen
 *   campagnes met zo'n map zijn te openen in de Playable loader. Een nieuwe
 *   campagne erbij: maak in Bunny de map `playable/pages/<campagne-ID>` aan.
 * - `playable/editor/`: bestanden die collega's uploaden voor hun pagina,
 *   zoals een andere foto.
 *
 * Alleen pure functies; het ophalen en uploaden staat in `store.ts`.
 */

export const PAGES_MAP = "playable/pages";
export const EDITOR_MAP = "playable/editor";

/** Vercel neemt verzoeken tot 4,5 MB aan; met wat ruimte voor de rest van het formulier. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Wat er geüpload mag worden, met het type waarmee Bunny het uitlevert. */
export const UPLOAD_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
};

/** Voor het `accept`-attribuut van het bestandsveld. */
export const UPLOAD_ACCEPT = Object.keys(UPLOAD_TYPES)
  .map((e) => `.${e}`)
  .join(",");

export function isAfbeelding(naam: string): boolean {
  return /\.(jpe?g|png|webp|avif|gif|svg)$/i.test(naam);
}

/**
 * De campagnes in de lijst van `playable/pages/` zoals de opslag-API van Bunny
 * hem geeft: alleen mappen met een campagne-ID als naam, oplopend.
 */
export function leesCampagneMappen(lijst: unknown): number[] {
  if (!Array.isArray(lijst)) return [];
  const ids = new Set<number>();
  for (const item of lijst) {
    if (!item || typeof item !== "object") continue;
    const { IsDirectory, ObjectName } = item as Record<string, unknown>;
    if (IsDirectory !== true || typeof ObjectName !== "string" || !/^\d{1,12}$/.test(ObjectName)) continue;
    const id = Number(ObjectName);
    if (id > 0) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

/** Een campagne die je in de eerste stap kunt kiezen (`/api/playable-loader/campagnes`). */
export interface BunnyCampagne {
  campaignId: number;
  campaignName?: string;
  /** De laatste publicatie vanuit PSV Tools, als die er is. */
  publishedAt?: string;
  publishedByName?: string;
  /** Jij deed de laatste publicatie. */
  doorJou: boolean;
}

export class UploadFout extends Error {}

/**
 * Het pad op Bunny voor een upload: in `playable/editor/`, met het
 * campagne-ID en de tijd ervoor, zodat je in Bunny ziet waar een bestand bij
 * hoort en er nooit een bestaand bestand wordt overschreven.
 */
export function editorPad(campaignId: number, bestandsnaam: string, nu: Date, toeval: string): { pad: string; type: string } {
  const punt = bestandsnaam.lastIndexOf(".");
  const ext = punt === -1 ? "" : bestandsnaam.slice(punt + 1).toLowerCase();
  const type = UPLOAD_TYPES[ext];
  if (!type) {
    throw new UploadFout(
      `Dit soort bestand kan niet op Bunny. Kies een ${Object.keys(UPLOAD_TYPES)
        .filter((e) => e !== "jpeg")
        .join(", ")}.`
    );
  }
  const basis =
    (punt === -1 ? bestandsnaam : bestandsnaam.slice(0, punt))
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "bestand";
  const stempel = nu.toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  const schoon = toeval.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6);
  return { pad: `${EDITOR_MAP}/${campaignId}-${stempel}-${schoon}-${basis}.${ext === "jpeg" ? "jpg" : ext}`, type };
}
