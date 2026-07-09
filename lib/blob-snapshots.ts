import { put, list } from "@vercel/blob";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type SnapshotPoint = { ts: string; available: number; sold: number };

export async function readSnapshots(eventId: string): Promise<SnapshotPoint[]> {
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
  const prefix = `ticket-snapshots/${eventId}/`;
  const { blobs } = await list({ prefix });
  return blobs
    .map((b) => {
      const name = b.pathname.slice(prefix.length).replace(/\.json$/, "");
      const parts = name.split("_");
      if (parts.length < 3) return null;
      const [rawTs, available, sold] = parts;
      const av = Number(available);
      const so = Number(sold);
      if (!rawTs || isNaN(av) || isNaN(so)) return null;
      // restore colons in time portion (stored with dashes to be filename-safe)
      const ts = rawTs.replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3");
      return { ts, available: av, sold: so };
    })
    .filter((p): p is SnapshotPoint => p !== null && p.ts >= cutoff)
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

export async function appendSnapshot(
  eventId: string,
  point: SnapshotPoint
): Promise<void> {
  const ts = point.ts.replace(/[^0-9TZ\-:.]/g, "").replace(/:/g, "-");
  const pathname = `ticket-snapshots/${eventId}/${ts}_${point.available}_${point.sold}.json`;
  await put(pathname, ".", {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}
