import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { deleteMelding } from "@/lib/kennisbank-meldingen";

export const dynamic = "force-dynamic";

/** Een melding afhandelen: de inhoud staat inmiddels in de kennisbank. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const ok = await deleteMelding(id);
    if (!ok) return NextResponse.json({ error: "Ongeldig melding id." }, { status: 400 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[kennisbank/meldingen/:id] DELETE mislukt:", msg);
    return NextResponse.json({ error: "Afhandelen van de melding mislukt." }, { status: 500 });
  }
}
