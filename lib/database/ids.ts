/**
 * Id's voor bronversies en campagnes. Apart van de stores omdat de browser ze
 * ook nodig heeft — een bronversie krijgt zijn id vóór de eerste shard omhoog
 * gaat — en de stores `@vercel/blob` importeren, dat niet in de browserbundle
 * hoort.
 */

const VERSION_ID_RE = /^v[0-9a-z-]{8,64}$/;
const CAMPAIGN_ID_RE = /^c[0-9a-z-]{8,64}$/;

function stamped(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}${stamp}-${rand}`;
}

export function newVersionId(): string {
  return stamped("v");
}

export function newCampaignId(): string {
  return stamped("c");
}

export function isValidVersionId(id: string): boolean {
  return VERSION_ID_RE.test(id);
}

export function isValidCampaignId(id: string): boolean {
  return CAMPAIGN_ID_RE.test(id);
}
