import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { canUploadHolders, readHolderListMeta } from "@/lib/aangrenzende-stoelen/store";
import { isSeatIngestLocked, readSeatIndex, readSeatState } from "@/lib/ringside/seat-store";
import { todayInAmsterdam } from "@/lib/ringside/seat-state";

/**
 * Overzicht voor de pagina Aangrenzende stoelen: welke wedstrijden er zijn, hoe
 * ver de stoelstatus is, en welke lijst seizoenkaarthouders er staat. Geen
 * relatienummers — die komen alleen uit "Maak lijst".
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  try {
    const [state, index, list] = await Promise.all([readSeatState(), readSeatIndex(), readHolderListMeta()]);
    const today = todayInAmsterdam();

    const events = Object.values(index)
      .filter((event) => event.eventDate && event.eventDate.slice(0, 10) >= today && event.seats > 0)
      .sort((a, b) => (a.eventDate ?? "").localeCompare(b.eventDate ?? ""));

    return NextResponse.json(
      {
        ingest: {
          manifestsComplete: state.manifestsComplete,
          salesComplete: state.salesComplete,
          manifestsRead: state.manifestsRead,
          salesRead: state.salesRead,
          caughtUpAt: state.caughtUpAt,
          running: isSeatIngestLocked(state),
          runs: state.runs,
          updatedAt: state.updatedAt || null,
          lastError: state.lastError,
        },
        events,
        list,
        canUpload: canUploadHolders(session.email),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
