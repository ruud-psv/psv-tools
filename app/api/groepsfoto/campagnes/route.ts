import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { valideerCampagne } from "@/lib/groepsfoto/campagne";
import {
  bewaarCampagne,
  bunnyCampagneConfig,
  lijstCampagnes,
  verwijderCampagne,
  zetCampagneActief,
} from "@/lib/groepsfoto/campagne-opslag";

export const runtime = "nodejs";

function fout(err: unknown, standaard: string, status = 502) {
  return NextResponse.json({ error: err instanceof Error ? err.message : standaard }, { status });
}

/** Of publiceren kan; zo niet, de melding waarom. */
function bunnyMelding(): string | null {
  try {
    bunnyCampagneConfig();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Bunny is niet ingesteld.";
  }
}

export async function GET(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  try {
    return NextResponse.json({ campagnes: await lijstCampagnes(), bunnyMelding: bunnyMelding() });
  } catch (err) {
    return fout(err, "Campagnes ophalen mislukt.");
  }
}

/** Aanmaken (`nieuw: true`) of bijwerken. Publiceren is een aparte stap. */
export async function POST(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Kon de aanvraag niet lezen." }, { status: 400 });
  }

  const resultaat = valideerCampagne(body);
  if ("fout" in resultaat) return NextResponse.json({ error: resultaat.fout }, { status: 400 });

  try {
    const campagne = await bewaarCampagne(resultaat.campagne, sessie.email, body.nieuw === true);
    return NextResponse.json({ campagne });
  } catch (err) {
    return fout(err, "Campagne opslaan mislukt.", 400);
  }
}

/** Aan- of uitzetten: de noodknop. */
export async function PATCH(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  let body: { slug?: unknown; actief?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Kon de aanvraag niet lezen." }, { status: 400 });
  }
  if (typeof body.slug !== "string" || typeof body.actief !== "boolean") {
    return NextResponse.json({ error: "Geef een campagne en aan of uit op." }, { status: 400 });
  }

  try {
    return NextResponse.json({ campagne: await zetCampagneActief(body.slug, body.actief) });
  } catch (err) {
    return fout(err, "Aan- of uitzetten mislukt.");
  }
}

export async function DELETE(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "Geen campagne opgegeven." }, { status: 400 });

  try {
    await verwijderCampagne(slug);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fout(err, "Campagne verwijderen mislukt.");
  }
}
