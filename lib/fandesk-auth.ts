import { timingSafeEqual } from "crypto";

/**
 * Gedeelde secret-check voor de FANdesk-endpoints die n8n aanroept: de ingest en
 * de taxonomie-woordenlijst. `middleware.ts` laat alle /api/* routes
 * ongeauthenticeerd door, dus elke route doet zijn eigen controle.
 */

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Accepteert `Authorization: Bearer <secret>` of `x-fandesk-secret`. Faalt dicht
 * wanneer de env var ontbreekt: liever alles weigeren dan een open endpoint.
 */
export function isFandeskRequestAuthorized(request: Request, logTag: string): boolean {
  const secret = process.env.FANDESK_INGEST_SECRET;
  if (!secret) {
    console.error(`[${logTag}] FANDESK_INGEST_SECRET niet geconfigureerd — endpoint geweigerd.`);
    return false;
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ") && secretsMatch(authHeader.slice(7), secret)) {
    return true;
  }
  const custom = request.headers.get("x-fandesk-secret");
  return custom ? secretsMatch(custom, secret) : false;
}
