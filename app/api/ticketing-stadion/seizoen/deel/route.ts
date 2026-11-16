import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { EVENT_ID } from "@/lib/ticketing-stadion/load";
import { createSeasonShareToken, isSeason } from "@/lib/ticketing-stadion/share";

/**
 * Maakt een deellink naar het seizoensoverzicht, te openen zonder login. De
 * link legt het seizoen vast en welke wedstrijden zijn uitgezet; die zijn voor
 * de ontvanger niet te zien.
 */
export async function POST(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const body = (await req.json().catch(() => null)) as { season?: unknown; exclude?: unknown } | null;
  if (!isSeason(body?.season)) return NextResponse.json({ error: "Onbekend seizoen." }, { status: 400 });
  const exclude = Array.isArray(body?.exclude)
    ? [...new Set(body.exclude.filter((id): id is string => typeof id === "string" && EVENT_ID.test(id)))]
    : [];

  try {
    const token = createSeasonShareToken({ season: body.season, exclude });
    return NextResponse.json({ url: `${req.nextUrl.origin}/share/stadion/seizoen?token=${token}` });
  } catch (error) {
    console.error("[ticketing-stadion] deellink seizoen mislukt:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "De deellink kon niet worden gemaakt." }, { status: 500 });
  }
}
