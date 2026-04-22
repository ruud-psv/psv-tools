import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

const FEED_URL = "https://ticketshop.psv.nl/feed/eventsavailability";
const RETENTION_DAYS = 30;

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  // Vercel Cron stuurt: Authorization: Bearer <secret>
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return true;
  // Handmatige aanroep via x-cron-secret header
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

  await ensureSchema();

  // Sla alle events van dit moment op in één transactie
  const now = new Date().toISOString();
  for (const e of events) {
    await sql`
      INSERT INTO ticket_snapshots (ts, event_id, available, sold)
      VALUES (${now}, ${e.eventId}, ${e.available}, ${e.sold})
    `;
  }

  // Verwijder metingen ouder dan RETENTION_DAYS
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await sql`
    DELETE FROM ticket_snapshots WHERE ts < ${cutoff}
  `;

  return NextResponse.json({
    saved: true,
    eventCount: events.length,
    timestamp: now,
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

// Handmatige trigger
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
