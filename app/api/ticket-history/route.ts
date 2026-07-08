import { NextResponse } from "next/server";
import { readSnapshots } from "@/lib/blob-snapshots";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");

  if (!eventId) {
    return NextResponse.json({ error: "eventId is verplicht" }, { status: 400 });
  }

  try {
    const history = await readSnapshots(eventId);
    return NextResponse.json({ history, eventId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("BLOB_READ_WRITE_TOKEN") || msg.includes("token")) {
      return NextResponse.json({ history: [], eventId });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
