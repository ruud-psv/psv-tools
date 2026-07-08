import { put, list } from "@vercel/blob";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type SnapshotPoint = { ts: string; available: number; sold: number };

function blobPath(eventId: string): string {
  return `ticket-snapshots/${eventId}.json`;
}

export async function readSnapshots(eventId: string): Promise<SnapshotPoint[]> {
  const { blobs } = await list({ prefix: blobPath(eventId) });
  if (blobs.length === 0) return [];
  const res = await fetch(blobs[0].url, { cache: "no-store" });
  if (!res.ok) return [];
  return (await res.json()) as SnapshotPoint[];
}

export async function appendSnapshot(
  eventId: string,
  point: SnapshotPoint
): Promise<void> {
  const existing = await readSnapshots(eventId);
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
  const updated = [...existing.filter((p) => p.ts >= cutoff), point];
  await put(blobPath(eventId), JSON.stringify(updated), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

// --- Share links ---

export async function createShareLink(token: string, params: unknown): Promise<void> {
  await put(`share-links/${token}.json`, JSON.stringify(params), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function getShareLink(token: string): Promise<unknown | null> {
  const { blobs } = await list({ prefix: `share-links/${token}.json` });
  if (blobs.length === 0) return null;
  const res = await fetch(blobs[0].url, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}
