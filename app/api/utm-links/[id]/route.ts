import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { deleteUtmLink } from "@/lib/utm-links";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const ok = await deleteUtmLink(id);
    if (!ok) return NextResponse.json({ error: "Ongeldig link id." }, { status: 400 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[utm-links/:id] DELETE mislukt:", msg);
    return NextResponse.json({ error: "Verwijderen van UTM-link mislukt." }, { status: 500 });
  }
}
