import { createHash } from "crypto";
import { get, list, put } from "@vercel/blob";
import { bundlePath, type PageSource } from "./bundle";

/**
 * Opslag van de Playable loader. De bundel gaat naar Bunny (daar laadt
 * Playable hem vandaan); de bron (de HTML, CSS en JS zoals de collega ze
 * invulde) gaat naar Vercel Blob, zodat PSV Tools de bron is en niet een
 * kopie op iemands laptop. Elke publicatie bewaren we ook los, om later terug
 * te kunnen.
 */

export interface PublishedPage {
  campaignId: number;
  /** De naam in Playable op het moment van publiceren. */
  campaignName?: string;
  source: PageSource;
  bundleUrl: string;
  kitVersie: string;
  publishedAt: string;
  publishedBy: string;
  publishedByName?: string;
  warnings: string[];
}

const PREFIX = "playable-loader/";

const currentPath = (campaignId: number) => `${PREFIX}${campaignId}/huidig.json`;
const versionPath = (campaignId: number, publishedAt: string) =>
  `${PREFIX}${campaignId}/versies/${publishedAt.replace(/[:.]/g, "-")}.json`;

export class BunnyConfigError extends Error {}

function bunnyConfig() {
  const zone = process.env.BUNNY_STORAGE_ZONE;
  const key = process.env.BUNNY_STORAGE_API_KEY;
  const cdn = process.env.BUNNY_CDN_URL?.replace(/\/+$/, "");
  const host = process.env.BUNNY_STORAGE_HOST ?? "storage.bunnycdn.com";
  if (!zone || !key || !cdn) {
    throw new BunnyConfigError("Bunny is niet ingesteld: BUNNY_STORAGE_ZONE, BUNNY_STORAGE_API_KEY of BUNNY_CDN_URL ontbreekt.");
  }
  return { zone, key, cdn, host };
}

/** Het adres waar Playable de bundel van deze campagne laadt. */
export function bundleUrl(campaignId: number): string {
  return `${bunnyConfig().cdn}/${bundlePath(campaignId)}`;
}

/** Zet de bundel op Bunny en geeft het CDN-adres terug. */
export async function uploadBundle(campaignId: number, bundle: string): Promise<string> {
  const { zone, key, cdn, host } = bunnyConfig();
  const path = bundlePath(campaignId);
  const res = await fetch(`https://${host}/${zone}/${path}`, {
    method: "PUT",
    headers: { AccessKey: key, "Content-Type": "application/javascript; charset=utf-8" },
    body: bundle,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Uploaden naar Bunny mislukt (${res.status}): ${text.slice(0, 200)}`);
  }
  return `${cdn}/${path}`;
}

/**
 * Leegt de cache van Bunny voor de bundel van deze campagne. Bunny negeert de
 * `?v=` van de loader en gaf na een nieuwe publicatie de oude versie. Hiervoor
 * is de API-sleutel van het Bunny-account nodig (`BUNNY_API_KEY`), niet de
 * sleutel van de opslag. Zonder die sleutel geeft dit `false` terug: de bundel
 * staat dan wel op Bunny, maar wordt pas zichtbaar als de cache verloopt.
 */
export async function purgeBundle(url: string): Promise<boolean> {
  const key = process.env.BUNNY_API_KEY;
  if (!key) return false;
  const res = await fetch(`https://api.bunny.net/purge?url=${encodeURIComponent(url)}&async=false`, {
    method: "POST",
    headers: { AccessKey: key },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Cache van Bunny legen mislukt (${res.status}): ${text.slice(0, 200)}`);
  }
  return true;
}

export async function readPublished(campaignId: number): Promise<PublishedPage | null> {
  try {
    const result = await get(currentPath(campaignId), { access: "private", useCache: false });
    if (!result?.stream) return null;
    const record = JSON.parse(await new Response(result.stream).text()) as PublishedPage;
    return record.campaignId === campaignId ? record : null;
  } catch {
    return null;
  }
}

export async function savePublished(record: PublishedPage): Promise<void> {
  const body = JSON.stringify(record);
  const options = {
    access: "private" as const,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  };
  await put(versionPath(record.campaignId, record.publishedAt), body, options);
  await put(currentPath(record.campaignId), body, options);
}

/**
 * Jouw recente campagnes: die waar jij zelf op hebt gepubliceerd, laatst
 * eerst. Per collega een eigen lijstje in Blob, onder een hash van het
 * e-mailadres. Bestaat dat lijstje nog niet, dan wordt het één keer gevuld met
 * de campagnes waarvan jij de laatste publicatie deed.
 */
export interface RecentCampaign {
  campaignId: number;
  campaignName?: string;
  /** Jouw laatste publicatie van deze campagne. */
  publishedAt: string;
}

const MAX_RECENT = 20;

function userPath(email: string): string {
  const hash = createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
  return `${PREFIX}gebruikers/${hash}.json`;
}

/** Zet een campagne bovenaan, zonder dubbele, en houdt er hooguit `max`. */
export function upsertRecent(items: RecentCampaign[], item: RecentCampaign, max = MAX_RECENT): RecentCampaign[] {
  const vorige = items.find((i) => i.campaignId === item.campaignId);
  const nieuw: RecentCampaign = { ...item, campaignName: item.campaignName ?? vorige?.campaignName };
  if (!nieuw.campaignName) delete nieuw.campaignName;
  return [nieuw, ...items.filter((i) => i.campaignId !== item.campaignId)]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, max);
}

async function readUserRecent(email: string): Promise<RecentCampaign[] | null> {
  try {
    const result = await get(userPath(email), { access: "private", useCache: false });
    if (!result?.stream) return null;
    const data = JSON.parse(await new Response(result.stream).text()) as { items?: RecentCampaign[] };
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return null;
  }
}

async function writeUserRecent(email: string, items: RecentCampaign[]): Promise<void> {
  await put(userPath(email), JSON.stringify({ items }), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/** Eenmalig: de campagnes waarvan deze collega de laatste publicatie deed. */
async function vulUitPublicaties(email: string): Promise<RecentCampaign[]> {
  const ids: number[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
    for (const blob of page.blobs) {
      const m = /^playable-loader\/(\d+)\/huidig\.json$/.exec(blob.pathname);
      if (m) ids.push(Number(m[1]));
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const records = await Promise.all(ids.map((id) => readPublished(id)));
  const eigen = email.trim().toLowerCase();
  return records
    .filter((r): r is PublishedPage => r !== null && r.publishedBy.trim().toLowerCase() === eigen)
    .reduce<RecentCampaign[]>(
      (lijst, r) =>
        upsertRecent(lijst, { campaignId: r.campaignId, campaignName: r.campaignName, publishedAt: r.publishedAt }),
      []
    );
}

export async function listRecent(email: string, limit = 10): Promise<RecentCampaign[]> {
  let items = await readUserRecent(email);
  if (items === null) {
    items = await vulUitPublicaties(email);
    await writeUserRecent(email, items);
  }
  return items.slice(0, limit);
}

/** Na een publicatie: de campagne bovenaan het lijstje van deze collega. */
export async function rememberPublished(email: string, item: RecentCampaign): Promise<void> {
  const items = (await readUserRecent(email)) ?? (await vulUitPublicaties(email));
  await writeUserRecent(email, upsertRecent(items, item));
}
