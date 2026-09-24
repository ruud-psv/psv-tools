import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import {
  getMail,
  listMails,
  mailId,
  parseMailInput,
  saveMail,
  type MailRecord,
} from "@/lib/mail-builder/mails";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  try {
    const mails = await listMails();
    return NextResponse.json({ mails });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[mail-builder/mails] GET mislukt:", msg);
    return NextResponse.json({ error: "Ophalen van het mailoverzicht mislukt." }, { status: 500 });
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

  const input = parseMailInput(body);
  if (!input) {
    return NextResponse.json({ error: "Mailnaam en template zijn verplicht." }, { status: 400 });
  }

  try {
    // Sleutel is de DMID, en anders de mailnaam: dezelfde mail opnieuw
    // downloaden werkt de bestaande rij bij.
    const id = mailId(input.dmid || input.naam);
    const bestaand = await getMail(id);
    const mail: MailRecord = bestaand
      ? { ...bestaand, ...input, id, updatedAt: new Date().toISOString() }
      : {
          id,
          ...input,
          createdBy: auth.email,
          ...(auth.name && { createdByName: auth.name }),
          createdAt: new Date().toISOString(),
        };
    await saveMail(mail);
    return NextResponse.json({ mail }, { status: bestaand ? 200 : 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[mail-builder/mails] POST mislukt:", msg);
    return NextResponse.json({ error: "Opslaan in het mailoverzicht mislukt." }, { status: 500 });
  }
}
