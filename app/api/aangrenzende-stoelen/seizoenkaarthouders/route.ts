import { NextRequest, NextResponse } from "next/server";
import { readSheet } from "read-excel-file/node";
import { requireEmail } from "@/lib/api-session";
import { HolderListError, parseCsvTable, parseHolderTable } from "@/lib/aangrenzende-stoelen/holders";
import { canUploadHolders, writeHolderList } from "@/lib/aangrenzende-stoelen/store";

/**
 * Vervangt de lijst seizoenkaarthouders.
 *
 * Staat `SEIZOENKAART_UPLOAD_EMAILS` ingevuld, dan alleen voor die adressen; leeg
 * betekent iedereen met een login (de testfase). Dat wordt hier gecontroleerd en
 * niet alleen in de interface: de knop verbergen houdt niemand tegen die de route
 * zelf aanroept.
 */

export const dynamic = "force-dynamic";

/** Ruim boven de ~550 kB van de huidige lijst, en onder de limiet van Vercel. */
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  if (!canUploadHolders(session.email)) {
    return NextResponse.json(
      { error: "Je hebt geen toestemming om de lijst seizoenkaarthouders te vervangen." },
      { status: 403 }
    );
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const value = form.get("file");
    file = value instanceof File ? value : null;
  } catch {
    // Valt hieronder als "geen bestand".
  }
  if (!file) return NextResponse.json({ error: "Geen bestand ontvangen." }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Het bestand is groter dan 4 MB." }, { status: 413 });
  }

  const name = file.name || "seizoenkaarthouders";
  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    // Excel herkennen aan de inhoud (een zip begint met "PK"), niet alleen aan
    // de naam: een export kan best `.XLSX` of zonder extensie heten.
    const isXlsx = bytes.subarray(0, 2).toString("latin1") === "PK";
    const table = isXlsx ? await readSheet(bytes) : parseCsvTable(bytes.toString("utf8"));
    const summary = parseHolderTable(table);
    const meta = await writeHolderList(summary, session.email, name);
    return NextResponse.json({ list: meta });
  } catch (error) {
    if (error instanceof HolderListError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[aangrenzende-stoelen] upload mislukt:", message);
    return NextResponse.json(
      { error: "Het bestand kon niet worden gelezen. Is het een Excel- of CSV-bestand?" },
      { status: 422 }
    );
  }
}
