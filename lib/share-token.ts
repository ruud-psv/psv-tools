/**
 * Deeltokens voor de openbare deelpagina's (`/share/rapportage`, `/share/dm`,
 * `/share/ticket`). Wie zo'n pagina bekijkt is niet ingelogd; de
 * data-endpoints (analytics, fanstore-analytics, share/insights,
 * reports/[id]/analysis) accepteren daarom een deeltoken in plaats van een
 * sessiecookie.
 *
 * Een token is `<payload>.<handtekening>`: de payload is base64url-JSON, de
 * handtekening een HMAC-SHA256 over die payload. Alleen de server kan tokens
 * maken. De sleutel is afgeleid van `SESSION_SECRET` met een eigen label, zodat
 * een deeltoken nooit als sessie geldt, en tokens van Ticketing Stadion
 * (`lib/ticketing-stadion/share.ts`) hier niet gelden en andersom.
 *
 * De payload legt vast wat het token mag (`ShareScope`):
 * - `report`: één opgeslagen rapport. Welke bronnen, sites, pagina's,
 *   producten en periodes gedeeld zijn, staat in dat rapport zelf; de
 *   endpoints toetsen elk verzoek daaraan (`lib/share-scope.ts`).
 * - `dm` en `ticket-event`: alleen de filterinstellingen van die deelpagina.
 *   Ze geven geen toegang tot de beschermde endpoints.
 * Optioneel staat er een verloopmoment in (`exp`, seconden sinds 1970).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type ShareScope =
  | { kind: "report"; id: string }
  | { kind: "dm"; q: string; preset: string; customFrom: string; customTo: string }
  | { kind: "ticket-event"; params: Record<string, unknown> };

/** Wat een geldig token oplevert: de scope en, als die er is, het verloopmoment. */
export type SharePayload = ShareScope & { exp?: number };

/** Versie van het tokenformaat; een ander formaat wordt niet gelezen. */
const VERSION = 1;

/** Zelfde vorm als de rapport-id's in `lib/reports.ts`. */
const REPORT_ID = /^[a-zA-Z0-9-]{8,64}$/;

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET is niet geconfigureerd of te kort.");
  return createHmac("sha256", Buffer.from(secret, "hex")).update("deellink:psv-tools").digest();
}

function sign(payload: string): string {
  return createHmac("sha256", key()).update(payload).digest("base64url");
}

/**
 * Maak een ondertekend deeltoken. Alleen aanroepen vanuit de server, na een
 * eigen controle dat de aanvrager dit mag delen.
 */
export function createShareToken(
  scope: ShareScope,
  options: { expiresInSeconds?: number; now?: number } = {}
): string {
  const now = options.now ?? Date.now();
  const body: Record<string, unknown> = { v: VERSION, ...scope };
  if (options.expiresInSeconds !== undefined) {
    body.exp = Math.floor(now / 1000) + options.expiresInSeconds;
  }
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** De scope uit een (al ondertekende) payload, of `null` als de vorm niet klopt. */
function parseScope(body: Record<string, unknown>): ShareScope | null {
  switch (body.kind) {
    case "report":
      return isString(body.id) && REPORT_ID.test(body.id) ? { kind: "report", id: body.id } : null;
    case "dm": {
      const { q, preset, customFrom, customTo } = body;
      if (![q, preset, customFrom, customTo].every(isString)) return null;
      return {
        kind: "dm",
        q: q as string,
        preset: preset as string,
        customFrom: customFrom as string,
        customTo: customTo as string,
      };
    }
    case "ticket-event":
      return body.params && typeof body.params === "object" && !Array.isArray(body.params)
        ? { kind: "ticket-event", params: body.params as Record<string, unknown> }
        : null;
    default:
      return null;
  }
}

/**
 * Controleer de handtekening en het verloopmoment, en geef terug wat het token
 * mag. `null` bij een vervalst, gewijzigd, verlopen of onleesbaar token.
 */
export function verifyShareToken(token: string | null | undefined, now: number = Date.now()): SharePayload | null {
  if (!token) return null;
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length) return null;
  try {
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

    const body = JSON.parse(Buffer.from(payload, "base64url").toString()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const b = body as Record<string, unknown>;
    if (b.v !== VERSION) return null;

    if (b.exp !== undefined) {
      if (typeof b.exp !== "number" || !Number.isFinite(b.exp)) return null;
      if (Math.floor(now / 1000) > b.exp) return null;
    }

    const scope = parseScope(b);
    if (!scope) return null;
    return b.exp !== undefined ? { ...scope, exp: b.exp as number } : scope;
  } catch {
    return null;
  }
}
