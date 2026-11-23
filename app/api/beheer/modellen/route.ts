import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, requireAdmin } from "@/lib/api-admin";
import {
  MODEL_PLEKKEN,
  MODEL_PRIJZEN,
  kenmerkenUitCapabilities,
  modelNaam,
  standaardKenmerken,
  type BeschikbaarModel,
  type ModelKenmerken,
} from "@/lib/modellen/config";
import { readKeuzesStrict, writeKeuzes, type ModelKeuzes } from "@/lib/modellen/store";

/**
 * Beheer > Model garden: per plek het model lezen en wisselen. De modellen om
 * uit te kiezen komen live uit de Models API, zodat je alleen kiest wat de
 * API-sleutel van PSV Tools echt kan aanroepen.
 */

export const dynamic = "force-dynamic";

const LEES_FOUT = "De Model garden kon niet worden geladen. Probeer het opnieuw.";

async function beschikbareModellen(): Promise<{ modellen: BeschikbaarModel[]; fout: string | null }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { modellen: [], fout: "ANTHROPIC_API_KEY ontbreekt; de beschikbare modellen zijn niet op te halen." };
  }
  try {
    const client = new Anthropic();
    const modellen: BeschikbaarModel[] = [];
    for await (const m of client.models.list({ limit: 100 })) {
      modellen.push({
        id: m.id,
        naam: m.display_name || modelNaam(m.id),
        context: m.max_input_tokens ?? null,
        maxUitvoer: m.max_tokens ?? null,
        prijs: MODEL_PRIJZEN[m.id] ?? null,
        kenmerken: kenmerkenUitCapabilities(m.id, m.capabilities),
      });
    }
    return { modellen, fout: null };
  } catch (err) {
    console.error("[beheer/modellen] Models API mislukt:", err instanceof Error ? err.message : err);
    return { modellen: [], fout: "De Models API gaf een fout; de beschikbare modellen zijn niet op te halen." };
  }
}

function antwoord(keuzes: ModelKeuzes, modellen: BeschikbaarModel[], fout: string | null) {
  return NextResponse.json({
    plekken: MODEL_PLEKKEN,
    keuzes,
    modellen,
    modellenFout: fout,
    standaardPrijzen: MODEL_PRIJZEN,
  });
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  try {
    const [keuzes, { modellen, fout }] = await Promise.all([readKeuzesStrict(), beschikbareModellen()]);
    return antwoord(keuzes, modellen, fout);
  } catch (err) {
    console.error("[beheer/modellen] Lezen mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: LEES_FOUT }, { status: 500 });
  }
}

/**
 * Zet het model van een plek: `{ plek, model }`. `model: null` zet de plek
 * terug op het standaardmodel.
 */
export async function PUT(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;

  const body = await readJsonBody(req);
  const plekId = typeof body?.plek === "string" ? body.plek : "";
  const plek = MODEL_PLEKKEN.find((p) => p.id === plekId);
  if (!plek) return NextResponse.json({ error: "Deze plek bestaat niet." }, { status: 400 });
  const model = body?.model === null ? null : typeof body?.model === "string" ? body.model.trim() : undefined;
  if (model === undefined) return NextResponse.json({ error: "Kies een model." }, { status: 400 });

  const { modellen, fout } = await beschikbareModellen();
  let kenmerken: ModelKenmerken | null = null;
  if (model !== null && model !== plek.standaard) {
    // Alleen modellen die de API nu aanbiedt, zodat een plek niet op een tikfout of
    // een uitgefaseerd model komt te staan.
    const gevonden = modellen.find((m) => m.id === model);
    if (!gevonden) {
      return NextResponse.json(
        { error: fout ?? `${model} is niet beschikbaar via de API van PSV Tools.` },
        { status: 400 }
      );
    }
    kenmerken = gevonden.kenmerken;
  }

  try {
    const keuzes = { ...(await readKeuzesStrict()) };
    if (model === null || model === plek.standaard) {
      delete keuzes[plek.id];
    } else {
      keuzes[plek.id] = {
        model,
        kenmerken: kenmerken ?? standaardKenmerken(model),
        gewijzigdOp: new Date().toISOString(),
        gewijzigdDoor: admin.email,
      };
    }
    await writeKeuzes(keuzes);
    console.log(`[beheer/modellen] ${admin.email}: ${plek.id} → ${model ?? `standaard (${plek.standaard})`}`);
    return antwoord(keuzes, modellen, fout);
  } catch (err) {
    console.error("[beheer/modellen] Opslaan mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Opslaan is mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
