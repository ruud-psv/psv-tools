import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { parseCampaignId } from "@/lib/playable-loader/bundle";
import { EDITOR_MAP, MAX_UPLOAD_BYTES, UploadFout, editorPad } from "@/lib/playable-loader/bunny";
import { BunnyConfigError, uploadEditorBestand } from "@/lib/playable-loader/store";

export const dynamic = "force-dynamic";

/**
 * Een bestand voor een campagnepagina op Bunny zetten, in `playable/editor/`:
 * een andere foto uit de bewerkstand, of een bestand voor de vraag aan Claude.
 * Geeft het CDN-adres terug. Toegang via de middleware (`API_PAGES`).
 */
export async function POST(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Het bestand kwam niet goed binnen. Is het kleiner dan 4 MB?" }, { status: 400 });
  }
  const campaignId = parseCampaignId(form.get("campaignId"));
  if (!campaignId) return NextResponse.json({ error: "Geen geldig campagne-ID." }, { status: 400 });
  const bestand = form.get("file");
  if (!bestand || typeof bestand === "string") {
    return NextResponse.json({ error: "Geen bestand ontvangen." }, { status: 400 });
  }
  if (bestand.size === 0) return NextResponse.json({ error: "Het bestand is leeg." }, { status: 400 });
  if (bestand.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Het bestand is groter dan 4 MB. Maak het kleiner en probeer het opnieuw." }, { status: 413 });
  }

  try {
    const { pad, type } = editorPad(campaignId, bestand.name, new Date(), randomBytes(4).toString("hex"));
    const url = await uploadEditorBestand(pad, type, await bestand.arrayBuffer());
    console.info(`[playable-loader/upload] ${session.email}, campagne ${campaignId}: ${pad} (${bestand.size} bytes).`);
    return NextResponse.json({ url, naam: pad.slice(EDITOR_MAP.length + 1) });
  } catch (err) {
    if (err instanceof UploadFout) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof BunnyConfigError) return NextResponse.json({ error: err.message }, { status: 500 });
    console.error("[playable-loader/upload] Mislukt:", err);
    return NextResponse.json(
      { error: `Uploaden mislukt: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
