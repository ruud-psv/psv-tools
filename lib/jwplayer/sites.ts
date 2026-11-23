/**
 * De properties (sites) van PSV Play in JW Player. De API werkt per property,
 * met een site-id van acht tekens.
 *
 * - `JWPLAYER_SITE_IDS`: komma-gescheiden, met een label per property, zoals
 *   `abcd1234:PSV Play,efgh5678:PSV Play app`.
 * - `JWPLAYER_SITE_ID`: één property, zonder label (heet dan "PSV Play").
 *
 * `JWPLAYER_SECRET` is de API-sleutel (v2, bearer). Die verlaat de server nooit.
 */

export const JW_API = "https://api.jwplayer.com/v2";
const SITE_ID = /^[A-Za-z0-9]{8}$/;

export interface JwSite {
  id: string;
  label: string;
}

/** Ontbrekende of ongeldige instelling aan de kant van PSV Tools. */
export class JwConfigError extends Error {}

export function leesSites(env: Record<string, string | undefined> = process.env): JwSite[] {
  const lijst = env.JWPLAYER_SITE_IDS?.trim();
  const enkel = env.JWPLAYER_SITE_ID?.trim();
  const ruw = lijst ? lijst.split(",") : enkel ? [enkel] : [];
  const sites: JwSite[] = [];
  for (const deel of ruw) {
    const [id, ...rest] = deel.trim().split(":");
    if (!id) continue;
    if (!SITE_ID.test(id)) throw new JwConfigError(`Ongeldige site-id "${id}": verwacht acht letters of cijfers.`);
    if (sites.some((s) => s.id === id)) continue;
    sites.push({ id, label: rest.join(":").trim() || (ruw.length > 1 ? id : "PSV Play") });
  }
  if (!sites.length) throw new JwConfigError("JW Player-configuratie ontbreekt: JWPLAYER_SITE_ID of JWPLAYER_SITE_IDS.");
  return sites;
}

export function leesSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.JWPLAYER_SECRET?.trim();
  if (!secret) throw new JwConfigError("JW Player-configuratie ontbreekt: JWPLAYER_SECRET.");
  return secret;
}
