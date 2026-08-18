import { NextResponse } from "next/server";
import { appendSnapshot } from "@/lib/blob-snapshots";
import { selectSnapshotRows, type SnapshotRow } from "@/lib/ticket-snapshot-feed";

const FEED_URL = "https://ticketshop.psv.nl/feed/eventsavailability";

/** Aantal blob-writes dat we tegelijk laten lopen. */
const WRITE_CONCURRENCY = 12;

/** Writes in blokjes, zodat we de blob-API niet met honderden calls tegelijk raken. */
async function writeSnapshots(rows: SnapshotRow[], ts: string): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += WRITE_CONCURRENCY) {
    const batch = rows.slice(i, i + WRITE_CONCURRENCY);
    await Promise.all(
      batch.map((row) =>
        appendSnapshot(row.eventId, { ts, available: row.available, sold: row.sold })
      )
    );
    written += batch.length;
  }
  return written;
}

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[ticket-history/snapshot] CRON_SECRET niet geconfigureerd — endpoint geweigerd.");
    return false;
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return true;
  return request.headers.get("x-cron-secret") === cronSecret;
}

async function takeSnapshot(request: Request): Promise<NextResponse> {
  const res = await fetch(FEED_URL, {
    headers: { "User-Agent": "PSV-Tools/1.0" },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: `Feed error: ${res.status}` },
      { status: 502 }
    );
  }

  const xml = await res.text();
  const now = new Date();
  const { rows, skipped } = selectSnapshotRows(xml, now.getTime());
  const ts = now.toISOString();

  // `?dryRun=1` laat zien wát er gemeten zou worden zonder te schrijven —
  // handig om te controleren of een specifiek event meeloopt.
  if (new URL(request.url).searchParams.get("dryRun") === "1") {
    return NextResponse.json({
      saved: false,
      dryRun: true,
      eventCount: rows.length,
      skipped,
      eventIds: rows.map((r) => r.eventId),
      timestamp: ts,
    });
  }

  const written = await writeSnapshots(rows, ts);

  return NextResponse.json({
    saved: true,
    eventCount: written,
    skipped,
    timestamp: ts,
  });
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return await takeSnapshot(request);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Snapshot mislukt" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return await takeSnapshot(request);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Snapshot mislukt" },
      { status: 500 }
    );
  }
}
