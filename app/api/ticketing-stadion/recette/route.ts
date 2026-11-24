import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { EVENT_ID } from "@/lib/ticketing-stadion/load";
import { euroToCents, readRecetteSettings, writeRecetteSettings } from "@/lib/ticketing-stadion/recette-store";

/**
 * De instellingen van de recette aanpassen (Ticketing Stadion, wedstrijdpagina).
 *
 * Body, alles optioneel:
 * - `eventId` + `target` (euro's): het target van die wedstrijd; `target: null`
 *   zet hem terug op de standaard.
 * - `defaultTarget` (euro's): het standaardtarget voor alle wedstrijden.
 * - `uptake` (0 tot 1): het afnamepercentage van de vrije verkoop.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;
  return NextResponse.json(await readRecetteSettings(), { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function PUT(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Geen geldige invoer." }, { status: 400 });

  const settings = await readRecetteSettings();

  if ("eventId" in body) {
    const eventId = typeof body.eventId === "string" ? body.eventId.trim().toLowerCase() : "";
    if (!EVENT_ID.test(eventId)) return NextResponse.json({ error: "Onbekende wedstrijd." }, { status: 400 });
    if (body.target === null) delete settings.targets[eventId];
    else {
      const cents = euroToCents(body.target);
      if (cents === null) return NextResponse.json({ error: "Geef het target als bedrag in euro's." }, { status: 400 });
      settings.targets[eventId] = cents;
    }
  }
  if ("defaultTarget" in body) {
    const cents = euroToCents(body.defaultTarget);
    if (cents === null) return NextResponse.json({ error: "Geef het standaardtarget als bedrag in euro's." }, { status: 400 });
    settings.defaultTargetCents = cents;
  }
  if ("uptake" in body) {
    const uptake = Number(body.uptake);
    if (!Number.isFinite(uptake) || uptake <= 0 || uptake > 1) {
      return NextResponse.json({ error: "Het afnamepercentage ligt tussen 0 en 100%." }, { status: 400 });
    }
    settings.uptake = uptake;
  }

  settings.updatedAt = new Date().toISOString();
  settings.updatedBy = session.email;
  try {
    await writeRecetteSettings(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ticketing-stadion] recette-instellingen niet op te slaan:", message);
    return NextResponse.json({ error: `Opslaan mislukt: ${message}` }, { status: 500 });
  }
  return NextResponse.json(settings);
}
