/**
 * Een ticket is het prediction-id van Replicate, met de campagne en een
 * vervaltijd, versleuteld met AES-GCM. Zo is er geen opslag nodig om een
 * ticket terug te vinden, ziet de browser het prediction-id niet, en is een
 * ticket niet na te maken of aan te passen.
 */

export interface TicketInhoud {
  /** Prediction-id bij Replicate. */
  p: string;
  /** Slug van de campagne. */
  c: string;
  /** Vervaltijd in ms sinds epoch. */
  v: number;
}

/** Zo lang bewaart Replicate de uitvoer ongeveer; daarna heeft een ticket geen zin. */
export const TICKET_GELDIG_MS = 60 * 60 * 1000;

function naarBase64Url(bytes: Uint8Array): string {
  let tekst = "";
  for (const b of bytes) tekst += String.fromCharCode(b);
  return btoa(tekst).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function vanBase64Url(tekst: string): Uint8Array {
  const b64 = tekst.replace(/-/g, "+").replace(/_/g, "/");
  const ruw = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(ruw, (c) => c.charCodeAt(0));
}

/** De sleutel komt als base64 van 32 bytes uit de omgeving (`openssl rand -base64 32`). */
export async function maakTicketSleutel(base64: string): Promise<CryptoKey> {
  const ruw = Uint8Array.from(atob(base64.trim()), (c) => c.charCodeAt(0));
  if (ruw.length !== 32) throw new Error("TICKET_SLEUTEL moet 32 bytes zijn, als base64.");
  return crypto.subtle.importKey("raw", ruw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function maakTicket(sleutel: CryptoKey, inhoud: TicketInhoud): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(inhoud));
  const versleuteld = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, sleutel, data));
  const samen = new Uint8Array(iv.length + versleuteld.length);
  samen.set(iv);
  samen.set(versleuteld, iv.length);
  return naarBase64Url(samen);
}

/** Geeft de inhoud terug, of `null` als het ticket niet klopt, verlopen is of bij een andere campagne hoort. */
export async function leesTicket(
  sleutel: CryptoKey,
  ticket: string,
  campagne: string,
  nu: number
): Promise<TicketInhoud | null> {
  if (!/^[A-Za-z0-9_-]{30,400}$/.test(ticket)) return null;
  try {
    const bytes = vanBase64Url(ticket);
    const iv = bytes.slice(0, 12);
    const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, sleutel, bytes.slice(12));
    const inhoud = JSON.parse(new TextDecoder().decode(data)) as TicketInhoud;
    if (typeof inhoud.p !== "string" || inhoud.c !== campagne || !(inhoud.v > nu)) return null;
    return inhoud;
  } catch {
    return null;
  }
}
