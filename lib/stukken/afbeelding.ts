import { randomBytes } from "crypto";
import { AFBEELDING_MAP } from "./model";

/**
 * Foto's in stukken: de collega uploadt ze, ze gaan naar Bunny in de map
 * stukken/ en het stuk bewaart alleen het CDN-adres. Strenger dan de upload
 * van de Mail Builder: alleen JPG, PNG en WebP, herkend aan de inhoud (niet
 * aan de naam of het type dat de browser opgeeft), en hooguit 4 MB.
 *
 * Let op: Bunny-adressen zijn openbaar. De bestandsnaam is willekeurig en
 * niet te raden, maar een foto in een stuk dat alleen voor collega's is
 * gedeeld, is via de directe link toch te openen.
 */

/** 4 MB: Vercel neemt geen verzoeken groter dan 4,5 MB aan. */
export const MAX_AFBEELDING_BYTES = 4 * 1024 * 1024;

export type BeeldSoort = "jpg" | "png" | "webp";

const CONTENT_TYPE: Record<BeeldSoort, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Het soort beeld aan de eerste bytes; null als het geen JPG, PNG of WebP is. */
export function beeldSoort(bytes: Uint8Array): BeeldSoort | null {
  const b = (i: number) => bytes[i];
  if (bytes.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "jpg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b(i) === v)) return "png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(b(0), b(1), b(2), b(3)) === "RIFF" &&
    String.fromCharCode(b(8), b(9), b(10), b(11)) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export class AfbeeldingFout extends Error {}

/** Een foto uit FileFlow haalt de server zelf op; daar geldt de grens van Vercel niet. */
export const MAX_KOPIE_BYTES = 20 * 1024 * 1024;

/** Controleert het bestand: grootte en soort. Gooit AfbeeldingFout met een melding voor de collega. */
export function controleerAfbeelding(bytes: Uint8Array, max = MAX_AFBEELDING_BYTES): BeeldSoort {
  if (bytes.length === 0) throw new AfbeeldingFout("Het bestand is leeg.");
  if (bytes.length > max) {
    const mb = (n: number) => (n / 1024 / 1024).toFixed(1).replace(".", ",").replace(/,0$/, "");
    throw new AfbeeldingFout(`De foto is te groot (${mb(bytes.length)} MB). Hooguit ${mb(max)} MB.`);
  }
  const soort = beeldSoort(bytes);
  if (!soort) throw new AfbeeldingFout("Alleen JPG, PNG of WebP.");
  return soort;
}

/** Zet de foto op Bunny onder een willekeurige naam en geeft het CDN-adres terug. */
export async function uploadAfbeelding(bytes: Uint8Array, soort: BeeldSoort): Promise<string> {
  const zone = process.env.BUNNY_STORAGE_ZONE;
  const key = process.env.BUNNY_STORAGE_API_KEY;
  const cdn = process.env.BUNNY_CDN_URL?.replace(/\/+$/, "");
  const host = process.env.BUNNY_STORAGE_HOST ?? "storage.bunnycdn.com";
  if (!zone || !key || !cdn) throw new Error("Bunny is niet ingesteld: BUNNY_STORAGE_ZONE, BUNNY_STORAGE_API_KEY of BUNNY_CDN_URL ontbreekt.");
  const pad = `${AFBEELDING_MAP}/${randomBytes(16).toString("hex")}.${soort}`;
  const res = await fetch(`https://${host}/${zone}/${pad}`, {
    method: "PUT",
    headers: { AccessKey: key, "Content-Type": CONTENT_TYPE[soort] },
    body: Buffer.from(bytes),
  });
  if (!res.ok) {
    const tekst = await res.text().catch(() => "");
    throw new Error(`Uploaden naar Bunny mislukt (${res.status}): ${tekst.slice(0, 200)}`);
  }
  return `${cdn}/${pad}`;
}
