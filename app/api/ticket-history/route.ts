import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");

  if (!eventId) {
    return NextResponse.json({ error: "eventId is verplicht" }, { status: 400 });
  }

  try {
    await ensureSchema();

    const result = await sql`
      SELECT ts, available, sold
      FROM ticket_snapshots
      WHERE event_id = ${eventId}
      ORDER BY ts ASC
    `;

    const history = result.rows.map((row) => ({
      ts: new Date(row.ts).toISOString(),
      available: row.available,
      sold: row.sold,
    }));

    return NextResponse.json({ history, eventId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Query mislukt" },
      { status: 500 }
    );
  }
}
