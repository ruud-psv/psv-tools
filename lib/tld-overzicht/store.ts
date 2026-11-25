import { put } from "@vercel/blob";
import { readPrivateBlob } from "@/lib/blob/read";
import type { TldScan } from "@/lib/tld-overzicht/types";

/**
 * TLD overzicht: wat draait er op psv.<tld>, voor elk topleveldomein.
 *
 * De scan zelf (DNS + een browser die screenshots maakt) draait niet op Vercel:
 * daar is geen browser en duurt het te lang. Hij draait in GitHub Actions
 * (`.github/workflows/tld-overzicht.yml`) met `scripts/psv-domeinscan.mjs`,
 * dat het resultaat aflevert bij `app/api/tld-overzicht/upload`; deze module
 * schrijft het naar Vercel Blob onder `tld-overzicht/` en leest het terug.
 */
const LAATSTE = "tld-overzicht/laatste.json";

/** De laatste scan, of `null` als er nog geen is. */
export async function leesLaatsteScan(): Promise<TldScan | null> {
  const inhoud = await readPrivateBlob(LAATSTE);
  return inhoud ? (JSON.parse(inhoud.toString("utf8")) as TldScan) : null;
}

const OPTIES = { access: "private", addRandomSuffix: false, allowOverwrite: true } as const;

/** Zet een screenshot van de scan in Blob. */
export async function schrijfScreenshot(pad: string, inhoud: Buffer): Promise<void> {
  await put(pad, inhoud, { ...OPTIES, contentType: "image/jpeg" });
}

/** Zet de scan in zijn eigen map en als de laatste scan. */
export async function schrijfScan(scan: TldScan): Promise<void> {
  const json = JSON.stringify(scan);
  await put(`tld-overzicht/${scan.datum}/resultaten.json`, json, { ...OPTIES, contentType: "application/json" });
  await put(LAATSTE, json, { ...OPTIES, contentType: "application/json" });
}
