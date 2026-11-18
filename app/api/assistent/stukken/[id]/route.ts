import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { StukConflict, StukFout, handmatigBewerken } from "@/lib/stukken/model";
import { getStuk, saveStuk } from "@/lib/stukken/store";

/**
 * Het stuk bij een gesprek. Alleen van jezelf: het staat onder je eigen
 * e-mailadres. Met PATCH bewerk je het in het voorbeeld; dezelfde regels als
 * de assistent, op de versie die je voor je had (`basisVersie`).
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  try {
    const stuk = await getStuk(auth.email, id);
    if (!stuk) return NextResponse.json({ error: "Geen stuk bij dit gesprek." }, { status: 404 });
    return NextResponse.json({ stuk });
  } catch (err) {
    console.error("[assistent/stukken/:id] lezen mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Het stuk kon niet worden geladen." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  try {
    const stuk = await getStuk(auth.email, id);
    if (!stuk) return NextResponse.json({ error: "Geen stuk bij dit gesprek." }, { status: 404 });
    const nieuw = handmatigBewerken(stuk, body, new Date().toISOString());
    await saveStuk(nieuw);
    return NextResponse.json({ stuk: nieuw });
  } catch (err) {
    if (err instanceof StukConflict) return NextResponse.json({ error: err.message, stuk: err.stuk }, { status: 409 });
    if (err instanceof StukFout) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[assistent/stukken/:id] bewerken mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Opslaan is mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
