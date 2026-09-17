import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import {
  getUtmLink,
  listUtmLinks,
  parseUtmLinkInput,
  saveUtmLink,
  utmLinkId,
  type UtmLinkRecord,
} from "@/lib/utm-links";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  try {
    const links = await listUtmLinks();
    return NextResponse.json({ links });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[utm-links] GET mislukt:", msg);
    return NextResponse.json({ error: "Ophalen van UTM-links mislukt." }, { status: 500 });
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

  const input = parseUtmLinkInput(body);
  if (!input) {
    return NextResponse.json({ error: "Ongeldige UTM-payload." }, { status: 400 });
  }

  try {
    // Dezelfde link twee keer opslaan levert alleen ruis op in het overzicht;
    // het id is een hash van de URL, dus één get volstaat om dat te zien.
    const id = utmLinkId(input.generatedUrl);
    const existing = await getUtmLink(id);
    if (existing) {
      return NextResponse.json({ link: existing, duplicate: true });
    }

    const link: UtmLinkRecord = {
      id,
      ...input,
      createdBy: auth.email,
      createdAt: new Date().toISOString(),
    };
    await saveUtmLink(link);
    return NextResponse.json({ link }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[utm-links] POST mislukt:", msg);
    return NextResponse.json({ error: "Opslaan van UTM-link mislukt." }, { status: 500 });
  }
}
