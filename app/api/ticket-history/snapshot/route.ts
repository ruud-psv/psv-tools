import { NextResponse } from "next/server";
import { appendSnapshot } from "@/lib/blob-snapshots";

const FEED_URL = "https://ticketshop.psv.nl/feed/eventsavailability";

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
  const events: Array<{ eventId: string; available: number; sold: number }> = [];

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
    events.push({
      eventId,
      available: parseInt(get("AvailableCapacity"), 10) || 0,
      sold: parseInt(get("SoldTickets"), 10) || 0,
    });
  }

  const now = new Date().toISOString();
  await Promise.all(
    events.map((e) => appendSnapshot(e.eventId, { ts: now, available: e.available, sold: e.sold }))
  );

  return NextResponse.json({
    saved: true,
    eventCount: events.length,
    timestamp: now,
  });
}

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
