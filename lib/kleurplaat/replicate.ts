/**
 * Dunne Replicate-client voor de Kleurplaat Creator.
 *
 * We praten rechtstreeks met de REST API in plaats van het npm-pakket: het gaat
 * om twee calls (voorspelling starten, status opvragen) en zo blijft de
 * dependency-lijst van het project ongemoeid.
 */

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
  const res = await fetch(`${API}${pad}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  return res;
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
/* Input filteren op het schema van het model                          */
/* ------------------------------------------------------------------ */

const schemaCache = new Map<string, Set<string>>();

/**
 * Haalt de toegestane inputvelden van een model op. Replicate weigert een
 * voorspelling met een onbekend veld, en de schema's van deze modellen
 * veranderen af en toe — daarom filteren we onze input erop in plaats van te
 * gokken. Het schema wordt per proces gecachet.
 */
async function toegestaneVelden(model: string): Promise<Set<string> | null> {
  const gecacht = schemaCache.get(model);
  if (gecacht) return gecacht;

  const res = await replicateFetch(`/models/${model}`);
  if (!res.ok) return null;

  const body = (await res.json().catch(() => null)) as {
    latest_version?: { openapi_schema?: { components?: { schemas?: { Input?: { properties?: Record<string, unknown> } } } } };
  } | null;

  const properties = body?.latest_version?.openapi_schema?.components?.schemas?.Input?.properties;
  if (!properties) return null;

  const velden = new Set(Object.keys(properties));
  schemaCache.set(model, velden);
  return velden;
}

async function filterInput(
  model: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const velden = await toegestaneVelden(model);
  if (!velden) return input; // schema onbekend: laat de API zelf oordelen

  const uit: Record<string, unknown> = {};
  for (const [sleutel, waarde] of Object.entries(input)) {
    if (waarde === undefined || waarde === null) continue;
    // Een lege lijst referenties laten we weg; sommige modellen weigeren hem.
    if (Array.isArray(waarde) && waarde.length === 0) continue;
    if (velden.has(sleutel)) uit[sleutel] = waarde;
  }
  // prompt is voor elk van deze modellen verplicht; nooit wegfilteren
  if (!("prompt" in uit) && "prompt" in input) uit.prompt = input.prompt;
  return uit;
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
  model: string,
  input: Record<string, unknown>
): Promise<Voorspelling> {
  const schone = await filterInput(model, input);

  const res = await replicateFetch(`/models/${model}/predictions`, {
    method: "POST",
    body: JSON.stringify({ input: schone }),
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
