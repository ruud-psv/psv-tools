import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { deleteMail } from "@/lib/mail-builder/mails";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const ok = await deleteMail(id);
    if (!ok) return NextResponse.json({ error: "Ongeldig mail id." }, { status: 400 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[mail-builder/mails/:id] DELETE mislukt:", msg);
    return NextResponse.json({ error: "Verwijderen uit het mailoverzicht mislukt." }, { status: 500 });
  }
}
