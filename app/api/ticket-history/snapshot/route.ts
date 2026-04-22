import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "data", "ticket-snapshots.json");
const FEED_URL = "https://ticketshop.psv.nl/feed/eventsavailability";
const MAX_SNAPSHOTS = 720; // 30 dagen × 24 uur

interface SnapshotStore {
  snapshots: Array<{
    ts: string;
    events: Record<string, { a: number; s: number }>;
  }>;
}

async function readStore(): Promise<SnapshotStore> {
  try {
    const content = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return { snapshots: [] };
  }
}

async function writeStore(store: SnapshotStore): Promise<void> {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(store), "utf-8");
}

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  // Vercel cron stuurt: Authorization: Bearer <secret>
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return true;
  // Handmatige POST via x-cron-secret header
  const manualHeader = request.headers.get("x-cron-secret");
  return manualHeader === cronSecret;
}

async function takeSnapshot(): Promise<NextResponse> {
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
  const events: Record<string, { a: number; s: number }> = {};

  const eventRegex = /<Event>([\s\S]*?)<\/Event>/g;
  let match;
  while ((match = eventRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag: string) => {
      const r = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`);
      const m = block.match(r);
      return m ? m[1].trim() : "";
    };
    const eventId = get("EventId");
    if (!eventId) continue;
    events[eventId] = {
      a: parseInt(get("AvailableCapacity"), 10) || 0,
      s: parseInt(get("SoldTickets"), 10) || 0,
    };
  }

  const store = await readStore();
  store.snapshots.push({ ts: new Date().toISOString(), events });
  if (store.snapshots.length > MAX_SNAPSHOTS) {
    store.snapshots = store.snapshots.slice(-MAX_SNAPSHOTS);
  }
  await writeStore(store);

  return NextResponse.json({
    saved: true,
    snapshotCount: store.snapshots.length,
    eventCount: Object.keys(events).length,
    timestamp: store.snapshots[store.snapshots.length - 1].ts,
  });
}

// Vercel Cron maakt een GET request
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return await takeSnapshot();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Snapshot mislukt" },
      { status: 500 }
    );
  }
}

// Handmatige trigger via POST (bijv. vanuit cURL of dashboard)
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return await takeSnapshot();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Snapshot mislukt" },
      { status: 500 }
    );
  }
}
