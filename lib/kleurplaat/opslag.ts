/**
 * Gedeelde opslag voor de Kleurplaat Creator: de referentiebeelden van Phoxy
 * en de modellen die iemand heeft toegevoegd.
 *
 * Alles staat in Vercel Blob, net als de ticket-snapshots en de rapportages, en
 * bewust als **privé** blob: de referenties zijn clubillustraties die niet op
 * een openbare URL horen te staan. De browser krijgt ze via een eigen route
 * achter de login, en het beeldmodel krijgt ze als data-URL die de server zelf
 * samenstelt.
 */

import { del, get, list, put } from "@vercel/blob";

import type { BewaardModel, Referentie } from "./index";

const REFERENTIE_PREFIX = "kleurplaat/referenties/";
const MODEL_PREFIX = "kleurplaat/modellen/";

/** Zoveel referenties mogen er in de gedeelde bibliotheek staan. */
export const MAX_BIBLIOTHEEK = 24;

/**
 * Zonder blob-token valt er niets te delen. De melding komt in de UI terecht,
 * dus hij vertelt meteen wat eraan te doen is.
 */
function meldOpslagfout(err: unknown): never {
  const tekst = err instanceof Error ? err.message : String(err);
  if (/token/i.test(tekst)) {
    throw new Error(
      "De gedeelde opslag is niet geconfigureerd (BLOB_READ_WRITE_TOKEN ontbreekt). Koppel een Blob-store in Vercel."
    );
  }
  throw err instanceof Error ? err : new Error(tekst);
}

/* ------------------------------------------------------------------ */
/* Referenties                                                         */
/* ------------------------------------------------------------------ */

/** Maakt een bestandsnaam die veilig in een blob-pad past. */
function veiligeNaam(ruw: string): string {
  return (
    ruw
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-zA-Z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 40) || "referentie"
  );
}

/** De beeldtypes die we opslaan; de browser stuurt zelf altijd jpeg. */
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MIMES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function extensieVoor(contentType: string): string | undefined {
  return TYPES[contentType.toLowerCase().split(";")[0].trim()];
}

/** Het beeldtype hoort bij de extensie in het pad, niet bij een aanname. */
export function mimeVanPad(pad: string): string {
  const ext = pad.split(".").pop()?.toLowerCase() ?? "";
  return MIMES[ext] ?? "application/octet-stream";
}

function leesReferentie(pathname: string, grootte: number, toegevoegdOp: Date | string): Referentie {
  const rest = pathname.slice(REFERENTIE_PREFIX.length).replace(/\.(jpg|png|webp)$/i, "");
  const scheiding = rest.indexOf("__");
  return {
    pad: pathname,
    naam: scheiding === -1 ? rest : rest.slice(scheiding + 2),
    grootte,
    toegevoegdOp:
      toegevoegdOp instanceof Date ? toegevoegdOp.toISOString() : String(toegevoegdOp),
  };
}

export async function lijstReferenties(): Promise<Referentie[]> {
  try {
    const { blobs } = await list({ prefix: REFERENTIE_PREFIX });
    return blobs
      .map((b) => leesReferentie(b.pathname, b.size, b.uploadedAt))
      .sort((a, b) => a.toegevoegdOp.localeCompare(b.toegevoegdOp));
  } catch (err) {
    meldOpslagfout(err);
  }
}

export async function bewaarReferentie(
  naam: string,
  inhoud: ArrayBuffer,
  contentType: string
): Promise<Referentie> {
  const extensie = extensieVoor(contentType);
  if (!extensie) throw new Error("Alleen jpg, png of webp kan als referentie.");

  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const pad = `${REFERENTIE_PREFIX}${id}__${veiligeNaam(naam)}.${extensie}`;

  try {
    await put(pad, inhoud, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
    });
  } catch (err) {
    meldOpslagfout(err);
  }

  return leesReferentie(pad, inhoud.byteLength, new Date());
}

export function isReferentiePad(pad: string): boolean {
  return pad.startsWith(REFERENTIE_PREFIX) && !pad.includes("..");
}

export async function verwijderReferentie(pad: string): Promise<void> {
  if (!isReferentiePad(pad)) throw new Error("Dat is geen referentie van deze tool.");
  try {
    await del(pad);
  } catch (err) {
    meldOpslagfout(err);
  }
}

/** Haalt de inhoud op — voor de preview in de browser en voor het beeldmodel. */
export async function leesReferentieBestand(pad: string): Promise<Buffer | null> {
  if (!isReferentiePad(pad)) return null;
  try {
    const resultaat = await get(pad, { access: "private", useCache: false });
    if (!resultaat?.stream) return null;
    return Buffer.from(await new Response(resultaat.stream).arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Zet referenties om in data-URL's voor het beeldmodel. Replicate kan een
 * privé blob niet zelf ophalen, dus de server stuurt de inhoud mee.
 */
export async function referentiesAlsDataUrls(paden: string[]): Promise<string[]> {
  const bestanden = await Promise.all(
    paden.map(async (pad) => {
      const inhoud = await leesReferentieBestand(pad);
      return inhoud ? `data:${mimeVanPad(pad)};base64,${inhoud.toString("base64")}` : null;
    })
  );
  return bestanden.filter((b): b is string => b !== null);
}

/* ------------------------------------------------------------------ */
/* Modellen                                                            */
/* ------------------------------------------------------------------ */

/**
 * `openai/gpt-image-1.5` wordt `openai~gpt-image-1.5.json`. De tilde en de apenstaart
 * komen niet voor in een Replicate-modelnaam, dus het pad blijft eenduidig.
 */
function modelPad(id: string, versie?: string): string {
  return `${MODEL_PREFIX}${id.replace(/\//g, "~")}${versie ? `@${versie}` : ""}.json`;
}

export async function lijstModellen(): Promise<BewaardModel[]> {
  let paden: string[];
  try {
    const { blobs } = await list({ prefix: MODEL_PREFIX });
    paden = blobs.map((b) => b.pathname);
  } catch (err) {
    meldOpslagfout(err);
  }

  const modellen = await Promise.all(
    paden.map(async (pad) => {
      try {
        const resultaat = await get(pad, { access: "private", useCache: false });
        if (!resultaat?.stream) return null;
        const tekst = await new Response(resultaat.stream).text();
        const model = JSON.parse(tekst) as BewaardModel;
        return model?.id ? model : null;
      } catch {
        return null;
      }
    })
  );

  return modellen
    .filter((m): m is BewaardModel => m !== null)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function bewaarModel(model: BewaardModel): Promise<void> {
  try {
    await put(modelPad(model.id, model.versie), JSON.stringify(model), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch (err) {
    meldOpslagfout(err);
  }
}

export async function verwijderModel(id: string, versie?: string): Promise<void> {
  try {
    await del(modelPad(id, versie));
  } catch (err) {
    meldOpslagfout(err);
  }
}
