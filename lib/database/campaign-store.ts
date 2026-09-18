/**
 * Opslag van campagnes op Vercel Blob.
 *
 *   database/campaigns/<id>.json  titel, periode en de laatst berekende uitkomst
 *   database/campaigns/<id>.bin   de gesorteerde index van deelnemers
 *
 * Eén blob per campagne, net als `lib/utm-links.ts` en `lib/reports.ts`: twee
 * mensen die tegelijk een campagne toevoegen overschrijven elkaar dan niet.
 *
 * De deelnemers staan hier als 48-bits hash, niet als SSO-ID. Voor de overlap
 * tussen campagnes is dat genoeg — die vraagt om aantallen, niet om namen — en
 * wat er niet ligt kan ook niet uitlekken.
 */

import { del, list } from "@vercel/blob";
import {
  readBlobBytes,
  readBlobJson,
  writeBlobBytes,
  writeBlobJson,
} from "@/lib/database/blob";
import { fromBytes, toBytes, type PackedIndex } from "@/lib/database/index-format";
import { isValidCampaignId, newCampaignId } from "@/lib/database/ids";
import type { Campaign } from "@/lib/database/types";

const PREFIX = "database/campaigns/";

export { isValidCampaignId, newCampaignId };

function metaPath(id: string): string {
  return `${PREFIX}${id}.json`;
}

function indexPath(id: string): string {
  return `${PREFIX}${id}.bin`;
}

/* ---------- Metadata ---------- */

export async function getCampaign(id: string): Promise<Campaign | null> {
  if (!isValidCampaignId(id)) return null;
  const parsed = await readBlobJson<Campaign>(metaPath(id));
  return parsed?.id === id ? parsed : null;
}

export async function saveCampaign(campaign: Campaign): Promise<void> {
  await writeBlobJson(metaPath(campaign.id), campaign);
}

/** Alle campagnes, nieuwste eerst. */
export async function listCampaigns(): Promise<Campaign[]> {
  const { blobs } = await list({ prefix: PREFIX });
  const ids = blobs
    .filter((b) => b.pathname.endsWith(".json"))
    .map((b) => b.pathname.slice(PREFIX.length, -".json".length))
    .filter(isValidCampaignId);

  const results = await Promise.all(ids.map((id) => getCampaign(id)));
  return results
    .filter((c): c is Campaign => c !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteCampaign(id: string): Promise<boolean> {
  if (!isValidCampaignId(id)) return false;
  await del([metaPath(id), indexPath(id)]);
  return true;
}

/* ---------- Index ---------- */

export async function putCampaignIndex(
  id: string,
  index: PackedIndex
): Promise<void> {
  await writeBlobBytes(indexPath(id), toBytes(index));
}

export async function readCampaignIndex(
  id: string
): Promise<PackedIndex | null> {
  if (!isValidCampaignId(id)) return null;
  const bytes = await readBlobBytes(indexPath(id));
  return bytes ? fromBytes(bytes) : null;
}
