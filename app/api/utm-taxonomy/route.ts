import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { addTaxonomyValue, getTaxonomy } from "@/lib/utm-links";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  try {
    const taxonomy = await getTaxonomy();
    return NextResponse.json({ taxonomy });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[utm-taxonomy] GET mislukt:", msg);
    return NextResponse.json({ error: "Ophalen van bronnen en media mislukt." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const kind = b.kind === "source" || b.kind === "medium" ? b.kind : null;
  const value = typeof b.value === "string" ? b.value : "";
  if (!kind || !value.trim()) {
    return NextResponse.json({ error: "Geef een geldige bron of medium op." }, { status: 400 });
  }

  try {
    const taxonomy = await addTaxonomyValue(kind, value);
    if (!taxonomy) {
      return NextResponse.json(
        { error: "Gebruik alleen letters, cijfers, _, - en . (max. 64 tekens)." },
        { status: 400 }
      );
    }
    return NextResponse.json({ taxonomy });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[utm-taxonomy] POST mislukt:", msg);
    return NextResponse.json({ error: "Opslaan mislukt." }, { status: 500 });
  }
}
