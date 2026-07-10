import { NextResponse } from "next/server";
import { appendSnapshot } from "@/lib/blob-snapshots";

const FEED_URL = "https://ticketshop.psv.nl/feed/eventsavailability";

const SNAPSHOT_CATEGORIES = new Set(["Wedstrijden", "Abonnementen", "Overig"]);

function categorizeEvent(name: string): string {
  const n = name.toLowerCase();
  if (
    n.includes("psv") && (
      n.includes(" - ") || n.includes(" vs ") || n.includes("eredivisie") ||
      n.includes("champions league") || n.includes("europa league") ||
      n.includes("conference league") || n.includes("knvb") || n.includes("supercup")
    )
  ) return "Wedstrijden";
  if (n.includes("stadiontour") || n.includes("kampioenstour") || n.includes("legend tour") || n.includes("matchday tour")) return "Tours";
  if (n.includes("museum")) return "Museum";
  if (n.includes("minivoetbal") || n.includes("vakantie clinic") || n.includes("starclinic") || n.includes("trainingsmodule") || n.includes("individuele training") || n.includes("talent day") || n.includes("voetbalgames") || n.includes("phoxy") || n.includes("voetbaltraining")) return "Jeugd";
  if (n.includes("kinderfeestje") || n.includes("open training") || n.includes("funpark") || n.includes("awayday") || n.includes("scholenchallenge") || n.includes("welkom bij de club") || n.includes("wedstrijdbezoek") || n.includes("fanclub")) return "Evenementen";
  if (n.includes("mijn psv") || n.includes("seizoen club card") || n.includes("interesse seizoen")) return "Abonnementen";
  return "Overig";
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
    const category = categorizeEvent(get("NameAndDate"));
    if (!SNAPSHOT_CATEGORIES.has(category)) continue;
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
    categories: [...SNAPSHOT_CATEGORIES],
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
