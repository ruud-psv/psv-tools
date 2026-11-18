import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { StukFout, vorigeVersie } from "@/lib/stukken/model";
import { getStuk, saveStuk } from "@/lib/stukken/store";

/** Terug naar de vorige versie van het stuk, zoals ongedaan maken. */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  try {
    const stuk = await getStuk(auth.email, id);
    if (!stuk) return NextResponse.json({ error: "Geen stuk bij dit gesprek." }, { status: 404 });
    const terug = vorigeVersie(stuk, new Date().toISOString());
    await saveStuk(terug);
    return NextResponse.json({ stuk: terug });
  } catch (err) {
    if (err instanceof StukFout) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[assistent/stukken/:id/terug] mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Terugzetten is mislukt." }, { status: 500 });
  }
}
