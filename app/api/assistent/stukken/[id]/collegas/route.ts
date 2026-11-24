import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { readRegister } from "@/lib/gebruikers-register";
import { haalCollegaWeg, leesCollegaInvoer, voegCollegaToe } from "@/lib/stukken/collegas";
import { deleteMetMijRecord, eigenaarHash, getStuk, saveMetMijRecord, saveStuk } from "@/lib/stukken/store";

/**
 * Een stuk delen met een collega op naam (POST), of dat weer stoppen (DELETE).
 * De collega ziet het stuk daarna in Mijn documenten onder "Gedeeld met mij",
 * altijd in de nieuwste versie, en kan het alleen lezen. Alleen de maker kan
 * dit: het stuk wordt onder zijn eigen e-mailadres gezocht.
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const invoer = leesCollegaInvoer(await req.json().catch(() => null), auth.email);
  if ("fout" in invoer) return NextResponse.json({ error: invoer.fout }, { status: 400 });

  try {
    const stuk = await getStuk(auth.email, id);
    if (!stuk) return NextResponse.json({ error: "Geen stuk bij dit gesprek." }, { status: 404 });
    // De naam zoals PSV Tools hem kent, liever dan wat de browser meestuurt.
    const naam = (await readRegister()).find((c) => c.email === invoer.email)?.naam ?? invoer.naam;
    const nu = new Date().toISOString();
    let gedeeldMet;
    try {
      gedeeldMet = voegCollegaToe(stuk.gedeeldMet, { email: invoer.email, ...(naam && { naam }), gedeeldOp: nu });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
    // Eerst de verwijzing bij de collega, dan het stuk: zo staat er nooit iemand in het stuk die het niet kan vinden.
    await saveMetMijRecord(invoer.email, {
      eigenaar: stuk.eigenaar,
      ...(auth.name && { eigenaarNaam: auth.name }),
      eigenaarHash: eigenaarHash(auth.email),
      stukId: stuk.id,
      gedeeldOp: nu,
    });
    await saveStuk({ ...stuk, gedeeldMet });
    return NextResponse.json({ gedeeldMet });
  } catch (err) {
    console.error("[assistent/stukken/:id/collegas] delen mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Delen is mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  if (typeof body?.email !== "string") return NextResponse.json({ error: "Kies een collega." }, { status: 400 });

  try {
    const stuk = await getStuk(auth.email, id);
    if (!stuk) return NextResponse.json({ error: "Geen stuk bij dit gesprek." }, { status: 404 });
    const gedeeldMet = haalCollegaWeg(stuk.gedeeldMet, body.email);
    const { gedeeldMet: _oud, ...zonder } = stuk;
    void _oud;
    await saveStuk(gedeeldMet.length ? { ...zonder, gedeeldMet } : zonder);
    await deleteMetMijRecord(body.email.trim().toLowerCase(), eigenaarHash(auth.email), stuk.id).catch(() => undefined);
    return NextResponse.json({ gedeeldMet });
  } catch (err) {
    console.error("[assistent/stukken/:id/collegas] stoppen mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Stoppen met delen is mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
