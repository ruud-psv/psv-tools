import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { buildNeighborList, ListError, parseListRequest } from "@/lib/aangrenzende-stoelen/build-list";
import { toCsv } from "@/lib/aangrenzende-stoelen/neighbors";
import { INCLUDE_SEAT_COLUMNS } from "@/lib/aangrenzende-stoelen/settings";

/**
 * Maakt de lijst: welke seizoenkaarthouders zitten naast een vrije stoel. De
 * berekening zelf staat in `buildNeighborList()`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  try {
    const request = parseListRequest(await req.json().catch(() => ({})));
    const { event, result, seatMaps, listMeta, dataAsOf, catchUp } = await buildNeighborList(request);

    return NextResponse.json(
      {
        event,
        count: result.rows.length,
        stats: result.stats,
        seatMaps,
        csv: toCsv(result.rows, INCLUDE_SEAT_COLUMNS),
        includeSeatColumns: INCLUDE_SEAT_COLUMNS,
        maxSeatsPerRelation: request.maxSeatsPerRelation,
        dataAsOf,
        catchUp,
        listUploadedAt: listMeta.uploadedAt,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    if (error instanceof ListError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[aangrenzende-stoelen] lijst maken mislukt:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
