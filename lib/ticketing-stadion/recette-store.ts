/**
 * De instellingen van de recette in Vercel Blob: het standaardtarget, het
 * afnamepercentage van de vrije verkoop en een afwijkend target per wedstrijd.
 * Eén klein bestand, aan te passen vanaf de wedstrijdpagina.
 */

import { put } from "@vercel/blob";
import { readPrivateBlob } from "../blob/read";
import { DEFAULT_TARGET_CENTS, DEFAULT_UPTAKE, type RecetteSettings } from "./recette";

const PATH = "ticketing-stadion/recette.json";

export interface StoredRecetteSettings {
  defaultTargetCents: number;
  uptake: number;
  /** `eventId` → target in centen. */
  targets: Record<string, number>;
  updatedAt: string | null;
  updatedBy: string | null;
}

export function emptyRecetteSettings(): StoredRecetteSettings {
  return { defaultTargetCents: DEFAULT_TARGET_CENTS, uptake: DEFAULT_UPTAKE, targets: {}, updatedAt: null, updatedBy: null };
}

/** Gooit nooit: zonder bestand (of bij een fout) gelden de standaarden. */
export async function readRecetteSettings(): Promise<StoredRecetteSettings> {
  try {
    const bytes = await readPrivateBlob(PATH);
    if (!bytes) return emptyRecetteSettings();
    return { ...emptyRecetteSettings(), ...(JSON.parse(bytes.toString("utf8")) as Partial<StoredRecetteSettings>) };
  } catch (error) {
    console.error("[ticketing-stadion] recette-instellingen niet te lezen:", error instanceof Error ? error.message : error);
    return emptyRecetteSettings();
  }
}

export async function writeRecetteSettings(settings: StoredRecetteSettings): Promise<void> {
  await put(PATH, JSON.stringify(settings), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/** De instellingen voor één wedstrijd. */
export function settingsFor(stored: StoredRecetteSettings, eventId: string): RecetteSettings {
  const custom = stored.targets[eventId];
  return {
    targetCents: custom ?? stored.defaultTargetCents,
    uptake: stored.uptake,
    customTarget: custom !== undefined,
  };
}

/** Een bedrag in euro's als invoer → centen, of `null` als het geen geldig bedrag is. */
export function euroToCents(value: unknown): number | null {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(amount) && amount >= 0 && amount < 100_000_000 ? Math.round(amount * 100) : null;
}
