/**
 * Deeltokens voor de openbare deelpagina's (`/share/dm`, `/share/rapportage`,
 * `/share/ticket`). Die pagina's zijn zonder login te bekijken. De
 * data-endpoints (maileon, analytics, fanstore-analytics, share/insights,
 * reports/:id/analysis) accepteren daarom een deeltoken in plaats van een
 * sessiecookie.
 *
 * Het token is `<payload>.<handtekening>`: de payload is base64url-gecodeerde
 * JSON (bijvoorbeeld `{ kind: "dm", preset: "30d", q: "" }` of
 * `{ kind: "report", id }`), de handtekening een HMAC-SHA256 met een sleutel
 * die is afgeleid van `SESSION_SECRET`. Alleen de server kan tokens maken; een
 * aangepaste of zelfgemaakte payload valt op de handtekening af. Door de eigen
 * afgeleide sleutel geldt een deeltoken nooit als sessie, en ook niet als
 * deeltoken van Ticketing Stadion (`lib/ticketing-stadion/share.ts`), of
 * andersom.
 *
 * Tokens hebben geen vervaldatum: een deellink blijft werken zolang
 * `SESSION_SECRET` niet verandert. Wat een token mag zien, staat in de payload.
 * De endpoints bepalen zelf welke `kind`s ze accepteren en wat die mogen; zie
 * bijvoorbeeld `lib/maileon/access.ts`.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Wat er in een deeltoken staat. `kind` zegt wat voor link het is. */
export type SharePayload = Record<string, unknown> & { kind?: unknown };

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET is niet geconfigureerd of te kort.");
  return createHmac("sha256", Buffer.from(secret, "hex")).update("deellink:algemeen").digest();
}

function sign(payload: string): string {
  return createHmac("sha256", key()).update(payload).digest("base64url");
}

/** Maakt een ondertekend deeltoken. Alleen aanroepen voor iemand die het mag delen. */
export function createShareToken(payload: SharePayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

/** De payload van een geldig token, anders `null` (ook bij een ontbrekende of verkeerde handtekening). */
export function readShareToken(token: string | null | undefined): SharePayload | null {
  if (!token) return null;
  const [encoded, signature, ...rest] = token.split(".");
  if (!encoded || !signature || rest.length) return null;
  try {
    const expected = Buffer.from(sign(encoded));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const parsed: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as SharePayload;
  } catch {
    return null;
  }
}

export function isValidShareToken(token: string | null | undefined): boolean {
  return readShareToken(token) !== null;
}
