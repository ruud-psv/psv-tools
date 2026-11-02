import { NextResponse } from "next/server";
import { readSnapshots, type SnapshotPoint } from "@/lib/blob-snapshots";
import { offsetsToDailyPoints } from "@/lib/ringside/daily-sales";
import { readEventSales } from "@/lib/ringside/store";
import { readStadionSummary } from "@/lib/ticketing-stadion/store";

/**
 * Het verloop van de verkoop van één event, als reeks metingen.
 *
 * Voor events uit de oude XML-feed zijn dat de metingen van de (inmiddels
 * gestopte) snapshot-cron; daar hangen bestaande deellinks aan. Voor
 * wedstrijden uit Ringside rekenen we de reeks uit de verkoop per dag: één
 * punt per dag met het totaal tot en met die dag.
 */

export const revalidate = 3600; // cache 1 uur — voorkomt een list() per page view

async function fromRingside(eventId: string): Promise<SnapshotPoint[]> {
  const [sales, summary] = await Promise.all([readEventSales(), readStadionSummary()]);
  const event = sales[eventId];
  if (!event?.eventDate) return [];
  const capacity = summary?.matches[eventId]?.total.capacity ?? 0;
  return offsetsToDailyPoints(event.perOffset, event.eventDate).map((point) => {
    const sold = point.cumulativeSold ?? 0;
    return { ts: `${point.date}T23:59:00`, sold, available: Math.max(capacity - sold, 0) };
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");

  if (!eventId) {
    return NextResponse.json({ error: "eventId is verplicht" }, { status: 400 });
  }

  try {
    const snapshots = await readSnapshots(eventId);
    const history = snapshots.length > 0 ? snapshots : await fromRingside(eventId.trim().toLowerCase());
    return NextResponse.json({ history, eventId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("BLOB_READ_WRITE_TOKEN") || msg.includes("token")) {
      return NextResponse.json({ history: [], eventId });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
