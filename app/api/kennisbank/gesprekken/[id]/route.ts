import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { deleteGesprek, getGesprek } from "@/lib/kennisbank-gesprekken";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const gesprek = await getGesprek(auth.email, id);
    if (!gesprek) return NextResponse.json({ error: "Gesprek niet gevonden." }, { status: 404 });
    return NextResponse.json({ gesprek });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[kennisbank/gesprekken/:id] GET mislukt:", msg);
    return NextResponse.json({ error: "Ophalen van het gesprek mislukt." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const ok = await deleteGesprek(auth.email, id);
    if (!ok) return NextResponse.json({ error: "Ongeldig gesprek id." }, { status: 400 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[kennisbank/gesprekken/:id] DELETE mislukt:", msg);
    return NextResponse.json({ error: "Verwijderen van het gesprek mislukt." }, { status: 500 });
  }
}
