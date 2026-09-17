/**
 * Dunne Replicate-client voor de Kleurplaat Creator.
 *
 * We praten rechtstreeks met de REST API in plaats van het npm-pakket: het gaat
 * om drie calls (schema opvragen, voorspelling starten, status opvragen) en zo
 * blijft de dependency-lijst van het project ongemoeid.
 */

import { leesProfiel, type ModelProfiel } from "./schema";

/** Overschrijfbaar zodat de flow lokaal tegen een mock te testen is. */
const API = process.env.REPLICATE_API_BASE ?? "https://api.replicate.com/v1";

function token(): string {
  const t = process.env.REPLICATE_API_TOKEN;
  if (!t) {
    throw new Error(
      "REPLICATE_API_TOKEN ontbreekt. Zet hem in .env.local en in Vercel onder Settings → Environment Variables."
    );
  }
  return t;
}

async function replicateFetch(pad: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API}${pad}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

/** Leest de foutmelding van Replicate zo leesbaar mogelijk uit. */
async function foutTekst(res: Response): Promise<string> {
  const ruw = await res.text().catch(() => "");
  try {
    const json = JSON.parse(ruw) as { detail?: string; title?: string; error?: string };
    return json.detail || json.title || json.error || ruw || `HTTP ${res.status}`;
  } catch {
    return ruw || `HTTP ${res.status}`;
  }
}

/* ------------------------------------------------------------------ */
/* Modelprofiel                                                        */
/* ------------------------------------------------------------------ */

const profielCache = new Map<string, ModelProfiel>();

interface ModelBody {
  description?: string;
  latest_version?: { id?: string; openapi_schema?: unknown };
  openapi_schema?: unknown;
}

/**
 * Haalt op hoe dit model aangeroepen wil worden. Het resultaat wordt per proces
 * gecachet; een model verandert zelden en het scheelt een call per generatie.
 */
export async function haalProfiel(
  id: string,
  versie?: string
): Promise<{ profiel: ModelProfiel; omschrijving?: string }> {
  const sleutel = versie ? `${id}:${versie}` : id;
  const gecacht = profielCache.get(sleutel);

  const pad = versie
    ? `/models/${id}/versions/${encodeURIComponent(versie)}`
    : `/models/${id}`;
  const res = await replicateFetch(pad);

  if (res.status === 404) {
    throw new Error(
      `Model "${sleutel}" bestaat niet op Replicate, of je token heeft er geen toegang toe.`
    );
  }
  if (!res.ok) throw new Error(await foutTekst(res));

  const body = (await res.json().catch(() => null)) as ModelBody | null;
  const schema = versie ? body?.openapi_schema : body?.latest_version?.openapi_schema;

  const profiel = leesProfiel(id, schema, versie);
  if (!profiel) {
    if (gecacht) return { profiel: gecacht };
    throw new Error(
      `Het schema van "${sleutel}" is niet te lezen. Draait dit model wel op Replicate?`
    );
  }

  profielCache.set(sleutel, profiel);
  return { profiel, omschrijving: body?.description };
}

/* ------------------------------------------------------------------ */
/* Voorspellingen                                                      */
/* ------------------------------------------------------------------ */

export interface Voorspelling {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: unknown;
  error?: string | null;
  metrics?: { predict_time?: number };
}

export async function startVoorspelling(
  profiel: ModelProfiel,
  input: Record<string, unknown>
): Promise<Voorspelling> {
  // Een gepind model draait via /predictions met een version; de nieuwste
  // versie van een officieel model via de model-endpoint.
  const res = profiel.versie
    ? await replicateFetch("/predictions", {
        method: "POST",
        body: JSON.stringify({ version: profiel.versie, input }),
      })
    : await replicateFetch(`/models/${profiel.id}/predictions`, {
        method: "POST",
        body: JSON.stringify({ input }),
      });

  if (!res.ok) throw new Error(await foutTekst(res));
  return (await res.json()) as Voorspelling;
}

export async function haalVoorspelling(id: string): Promise<Voorspelling> {
  const res = await replicateFetch(`/predictions/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(await foutTekst(res));
  return (await res.json()) as Voorspelling;
}

/**
 * De modellen leveren hun resultaat als string, als array van strings of als
 * object met een `url`. Dit haalt daar één bruikbare afbeeldings-URL uit.
 */
export function eersteAfbeelding(output: unknown): string | undefined {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const url = eersteAfbeelding(item);
      if (url) return url;
    }
    return undefined;
  }
  if (output && typeof output === "object") {
    const url = (output as { url?: unknown }).url;
    if (typeof url === "string") return url;
  }
  return undefined;
}
