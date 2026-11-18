import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { normalizeEmail } from "@/lib/access";
import { todayInAmsterdam } from "@/lib/ringside/seat-state";
import { leesDeelInvoer } from "@/lib/stukken/delen";
import { deleteDeelRecord, eigenaarHash, getStuk, nieuwDeelId, saveDeelRecord, saveStuk } from "@/lib/stukken/store";

/**
 * Een stuk delen via een link, of de link intrekken.
 *
 * De link toont een momentopname: de versie van nu. Delen terwijl er al een
 * link is, houdt dezelfde link en zet de nieuwste versie erin.
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const invoer = leesDeelInvoer(await req.json().catch(() => null), todayInAmsterdam());
  if ("fout" in invoer) return NextResponse.json({ error: invoer.fout }, { status: 400 });

  try {
    const stuk = await getStuk(auth.email, id);
    if (!stuk) return NextResponse.json({ error: "Geen stuk bij dit gesprek." }, { status: 404 });

    const nu = new Date().toISOString();
    const deelId = stuk.deellink?.id ?? nieuwDeelId();
    await saveDeelRecord({
      id: deelId,
      eigenaarHash: eigenaarHash(auth.email),
      stukId: stuk.id,
      publiek: invoer.publiek,
      ...(invoer.verlooptOp && { verlooptOp: invoer.verlooptOp }),
      gedeeldOp: nu,
      gedeeldDoor: normalizeEmail(auth.email),
      stuk: { soort: stuk.soort, titel: stuk.titel, ondertitel: stuk.ondertitel, blokken: stuk.blokken, versie: stuk.versie, peildatum: stuk.peildatum },
    });
    const bijgewerkt = {
      ...stuk,
      deellink: { id: deelId, publiek: invoer.publiek, verlooptOp: invoer.verlooptOp, gedeeldOp: nu, versie: stuk.versie },
    };
    await saveStuk(bijgewerkt);
    return NextResponse.json({ stuk: bijgewerkt });
  } catch (err) {
    console.error("[assistent/stukken/:id/delen] mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Delen is mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  try {
    const stuk = await getStuk(auth.email, id);
    if (!stuk) return NextResponse.json({ error: "Geen stuk bij dit gesprek." }, { status: 404 });
    if (stuk.deellink) await deleteDeelRecord(stuk.deellink.id);
    const { deellink: _weg, ...zonder } = stuk;
    void _weg;
    await saveStuk(zonder);
    return NextResponse.json({ stuk: zonder });
  } catch (err) {
    console.error("[assistent/stukken/:id/delen] intrekken mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Intrekken is mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
