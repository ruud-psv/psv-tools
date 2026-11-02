import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { EVENT_ID } from "@/lib/ticketing-stadion/load";
import { createShareToken } from "@/lib/ticketing-stadion/share";

/** Maakt een deellink naar de wedstrijdpagina, te openen zonder login. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const eventId = (await params).eventId.trim().toLowerCase();
  if (!EVENT_ID.test(eventId)) return NextResponse.json({ error: "Onbekende wedstrijd." }, { status: 400 });

  try {
    const token = createShareToken(eventId);
    return NextResponse.json({ url: `${req.nextUrl.origin}/share/stadion?token=${token}` });
  } catch (error) {
    console.error("[ticketing-stadion] deellink mislukt:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "De deellink kon niet worden gemaakt." }, { status: 500 });
  }
}
