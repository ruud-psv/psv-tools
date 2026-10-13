import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import {
  listMeldingen,
  nieuwMeldingId,
  parseMeldingInput,
  saveMelding,
  type Melding,
} from "@/lib/kennisbank-meldingen";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  try {
    const meldingen = await listMeldingen();
    return NextResponse.json({ meldingen });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[kennisbank/meldingen] GET mislukt:", msg);
    return NextResponse.json({ error: "Ophalen van de meldingen mislukt." }, { status: 500 });
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

  const input = parseMeldingInput(body);
  if (!input) return NextResponse.json({ error: "Geen vraag opgegeven." }, { status: 400 });

  try {
    const melding: Melding = {
      id: nieuwMeldingId(),
      ...input,
      createdBy: auth.email,
      ...(auth.name && { createdByName: auth.name }),
      createdAt: new Date().toISOString(),
    };
    await saveMelding(melding);
    return NextResponse.json({ melding }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[kennisbank/meldingen] POST mislukt:", msg);
    return NextResponse.json({ error: "Melden mislukt." }, { status: 500 });
  }
}
