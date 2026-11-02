/**
 * Deellinks voor de wedstrijdpagina van Ticketing Stadion.
 *
 * Wie de link heeft, ziet de pagina zonder in te loggen. Het token zegt alleen
 * om welke wedstrijd het gaat en is ondertekend met `SESSION_SECRET` (met een
 * eigen afgeleide sleutel, zodat een deeltoken nooit als sessie kan gelden).
 * Zonder handtekening zou iedereen met een wedstrijd-id een link kunnen maken.
 *
 * Geen vervaldatum: een gespeelde wedstrijd verdwijnt vanzelf uit de
 * stoelstatus, en dan toont de link dat.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { EVENT_ID } from "./load";

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET is niet geconfigureerd of te kort.");
  return createHmac("sha256", Buffer.from(secret, "hex")).update("deellink:ticketing-stadion").digest();
}

function sign(payload: string): string {
  return createHmac("sha256", key()).update(payload).digest("base64url");
}

export function createShareToken(eventId: string): string {
  const payload = Buffer.from(JSON.stringify({ e: eventId })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Het wedstrijd-id uit een geldig token, anders `null`. */
export function readShareToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length) return null;
  try {
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const { e } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { e?: unknown };
    return typeof e === "string" && EVENT_ID.test(e) ? e : null;
  } catch {
    return null;
  }
}
