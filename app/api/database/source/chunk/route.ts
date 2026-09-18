import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { BYTES_PER_RECORD } from "@/lib/database/index-format";
import {
  MAX_PART_BYTES,
  isValidVersionId,
  putSourcePart,
} from "@/lib/database/source-store";

export const dynamic = "force-dynamic";

/**
 * Neemt één shard van de bronindex aan. De browser stuurt de gesorteerde index
 * in stukken van 3 MB omdat een serverless function maximaal ~4,5 MB request
 * body aanneemt; een index van een miljoen records is 8 MB.
 *
 * De shards zijn pas de bron nadat `POST /api/database/source` ze commit — tot
 * die tijd staat er alleen wat losse bytes, en een afgebroken upload verandert
 * dus niets aan wat er al ligt.
 */
export async function POST(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  const versionId = req.nextUrl.searchParams.get("version") ?? "";
  const part = Number(req.nextUrl.searchParams.get("part"));

  if (!isValidVersionId(versionId)) {
    return NextResponse.json({ error: "Ongeldig versie-id." }, { status: 400 });
  }
  if (!Number.isInteger(part) || part < 0 || part > 999) {
    return NextResponse.json({ error: "Ongeldig deelnummer." }, { status: 400 });
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await req.arrayBuffer();
  } catch {
    return NextResponse.json({ error: "Kon de data niet lezen." }, { status: 400 });
  }

  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "Leeg deel ontvangen." }, { status: 400 });
  }
  if (bytes.byteLength > MAX_PART_BYTES) {
    return NextResponse.json(
      { error: `Deel te groot (max ${MAX_PART_BYTES} bytes).` },
      { status: 413 }
    );
  }
  // Een shard die niet op een recordgrens eindigt zou bij het aan elkaar
  // plakken alle volgende records één voor één laten verschuiven.
  if (bytes.byteLength % BYTES_PER_RECORD !== 0) {
    return NextResponse.json(
      { error: "Deel eindigt niet op een recordgrens." },
      { status: 400 }
    );
  }

  try {
    await putSourcePart(versionId, part, bytes);
    return NextResponse.json({ part, bytes: bytes.byteLength });
  } catch (err) {
    console.error("[database/source/chunk] POST mislukt:", err);
    return NextResponse.json(
      { error: "Opslaan van een deel van het bronbestand mislukt." },
      { status: 500 }
    );
  }
}
