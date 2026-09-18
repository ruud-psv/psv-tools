import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import {
  deleteCampaign,
  getCampaign,
  saveCampaign,
} from "@/lib/database/campaign-store";
import {
  DatabaseError,
  analyzeCampaignById,
  parseCampaignFields,
} from "@/lib/database/service";

export const dynamic = "force-dynamic";

/**
 * Titel of periode wijzigen. De periode bepaalt wat "nieuw" is, dus daarna
 * volgt meteen een nieuwe telling — anders zou de kaart een startdatum tonen
 * die niet bij de getallen eronder hoort.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const existing = await getCampaign(id);
  if (!existing) {
    return NextResponse.json({ error: "Campagne niet gevonden." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  let fields: { title: string; startDate: string; endDate: string };
  try {
    fields = parseCampaignFields({
      title: body.title ?? existing.title,
      startDate: body.startDate ?? existing.startDate,
      endDate: body.endDate ?? existing.endDate,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }

  const periodChanged =
    fields.startDate !== existing.startDate || fields.endDate !== existing.endDate;

  try {
    await saveCampaign({ ...existing, ...fields });
    if (!periodChanged) {
      return NextResponse.json({ campaign: { ...existing, ...fields } });
    }
    return NextResponse.json({ campaign: await analyzeCampaignById(id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof DatabaseError ? err.status : 500;
    if (status >= 500) console.error("[database/campaigns/:id] PATCH mislukt:", message);
    return NextResponse.json({ error: message }, { status });
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
    const ok = await deleteCampaign(id);
    if (!ok) return NextResponse.json({ error: "Ongeldig campagne-id." }, { status: 400 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("[database/campaigns/:id] DELETE mislukt:", err);
    return NextResponse.json({ error: "Verwijderen van de campagne mislukt." }, { status: 500 });
  }
}
