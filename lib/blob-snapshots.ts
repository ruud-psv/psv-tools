import { put, list } from "@vercel/blob";

/**
 * Hoe lang terug we metingen meenemen. Puur een leesfilter: er wordt niets
 * verwijderd, dus een ruimere termijn maakt eerder opgeslagen historie gewoon
 * weer zichtbaar. Twaalf maanden is veilig omdat de groei per event begrensd
 * is — `shouldSnapshot` stopt met meten één dag na de eventdatum.
 */
const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

export type SnapshotPoint = { ts: string; available: number; sold: number };

export async function readSnapshots(eventId: string): Promise<SnapshotPoint[]> {
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
  const prefix = `ticket-snapshots/${eventId}/`;

  // `list()` levert max 1000 blobs per call, lexicografisch oplopend — en het
  // pathname begint met de timestamp, dus zonder doorlussen krijg je de
  // *oudste* 1000 terug. Een event dat maanden in de verkoop staat komt daar
  // ruim boven (twee crons, samen ~13 metingen per dag) en zou dan een reeks
  // opleveren die volledig buiten `cutoff` valt: een lege grafiek.
  const blobs: { pathname: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

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
