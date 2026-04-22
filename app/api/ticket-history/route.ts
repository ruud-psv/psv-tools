import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "data", "ticket-snapshots.json");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");

  if (!eventId) {
    return NextResponse.json({ error: "eventId is verplicht" }, { status: 400 });
  }

  try {
    const content = await fs.readFile(DATA_FILE, "utf-8");
    const store = JSON.parse(content) as {
      snapshots: Array<{
        ts: string;
        events: Record<string, { a: number; s: number }>;
      }>;
    };

    const history = store.snapshots
      .filter((s) => s.events[eventId] !== undefined)
      .map((s) => ({
        ts: s.ts,
        available: s.events[eventId].a,
        sold: s.events[eventId].s,
      }));

    return NextResponse.json({ history, eventId });
  } catch {
    return NextResponse.json({ history: [], eventId });
  }
}
