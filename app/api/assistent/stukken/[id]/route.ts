import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { getStuk } from "@/lib/stukken/store";

/** Het stuk bij een gesprek. Alleen van jezelf: het staat onder je eigen e-mailadres. */

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
