import { readPrivateBlob } from "@/lib/blob/read";
import type { TldScan } from "@/lib/tld-overzicht/types";

/**
 * TLD overzicht: wat draait er op psv.<tld>, voor elk topleveldomein.
 *
 * De scan zelf (DNS + een browser die screenshots maakt) draait niet op Vercel:
 * daar is geen browser en duurt het te lang. Hij draait met
 * `scripts/psv-domeinscan.mjs --upload`, dat het resultaat in Vercel Blob zet
 * onder `tld-overzicht/`; deze module leest het terug.
 */
const LAATSTE = "tld-overzicht/laatste.json";

/** De laatste scan, of `null` als er nog geen is. */
export async function leesLaatsteScan(): Promise<TldScan | null> {
  const inhoud = await readPrivateBlob(LAATSTE);
  return inhoud ? (JSON.parse(inhoud.toString("utf8")) as TldScan) : null;
}
