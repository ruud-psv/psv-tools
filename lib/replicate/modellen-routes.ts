/**
 * De handlers achter `/api/<tool>/modellen`: de gedeelde lijst van modellen
 * die iemand via "Model toevoegen" in de dropdown heeft gezet. Elke beeldtool
 * heeft zijn eigen lijst; de routes zelf zijn gelijk.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import type { ModellenOpslag } from "@/lib/blob/modellen";
import { haalProfiel } from "./client";
import { labelUitId, parseerModelId } from "./model";

function fout(err: unknown, standaard: string) {
  return NextResponse.json(
    { error: err instanceof Error ? err.message : standaard },
    { status: 502 }
  );
}

export function modellenRoutes(opslag: ModellenOpslag) {
  async function GET(req: NextRequest) {
    const sessie = requireEmail(req);
    if ("error" in sessie) return sessie.error;

    try {
      return NextResponse.json({ modellen: await opslag.lijst() });
    } catch (err) {
      return fout(err, "Modellen ophalen mislukt.");
    }
  }

  async function POST(req: NextRequest) {
    const sessie = requireEmail(req);
    if ("error" in sessie) return sessie.error;

    let body: { id?: string; versie?: string; label?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Kon de aanvraag niet lezen." }, { status: 400 });
    }

    const gekozen = parseerModelId(body.versie ? `${body.id ?? ""}:${body.versie}` : String(body.id ?? ""));
    if (!gekozen) {
      return NextResponse.json(
        { error: "Ongeldige model-identifier. Gebruik eigenaar/modelnaam." },
        { status: 400 }
      );
    }

    try {
      // Nooit een model in de gedeelde lijst zetten dat niet bestaat.
      await haalProfiel(gekozen.id, gekozen.versie);

      const model = {
        id: gekozen.id,
        versie: gekozen.versie,
        label: typeof body.label === "string" && body.label.trim()
          ? body.label.trim().slice(0, 60)
          : labelUitId(gekozen.id),
        toegevoegdDoor: sessie.email,
        toegevoegdOp: new Date().toISOString(),
      };
      await opslag.bewaar(model);
      return NextResponse.json({ model });
    } catch (err) {
      return fout(err, "Model opslaan mislukt.");
    }
  }

  async function DELETE(req: NextRequest) {
    const sessie = requireEmail(req);
    if ("error" in sessie) return sessie.error;

    const gekozen = parseerModelId(req.nextUrl.searchParams.get("id") ?? "");
    if (!gekozen) {
      return NextResponse.json({ error: "Geen geldig model opgegeven." }, { status: 400 });
    }

    try {
      await opslag.verwijder(gekozen.id, gekozen.versie);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return fout(err, "Model verwijderen mislukt.");
    }
  }

  return { GET, POST, DELETE };
}
