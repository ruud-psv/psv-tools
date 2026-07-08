import { put, get } from "@vercel/blob";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type SnapshotPoint = { ts: string; available: number; sold: number };

function blobPath(eventId: string): string {
  return `ticket-snapshots/${eventId}.json`;
}

async function readBlob<T>(pathname: string): Promise<T | null> {
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text) as T;
}

export async function readSnapshots(eventId: string): Promise<SnapshotPoint[]> {
  return (await readBlob<SnapshotPoint[]>(blobPath(eventId))) ?? [];
}

export async function appendSnapshot(
  eventId: string,
  point: SnapshotPoint
): Promise<void> {
  const existing = await readSnapshots(eventId);
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
  const updated = [...existing.filter((p) => p.ts >= cutoff), point];
  await put(blobPath(eventId), JSON.stringify(updated), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

// --- Share links ---

export async function createShareLink(token: string, params: unknown): Promise<void> {
  await put(`share-links/${token}.json`, JSON.stringify(params), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function getShareLink(token: string): Promise<unknown | null> {
  return readBlob(`share-links/${token}.json`);
}
