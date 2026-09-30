/**
 * Gedeelde opslag voor de Groepsfoto Creator: de basisfoto's met spelers en de
 * modellen die iemand heeft toegevoegd.
 *
 * Alles staat privé in Vercel Blob: het zijn foto's van spelers met
 * beeldrechten, die niet op een openbare URL horen. Per basisfoto staan er twee
 * blobs: het beeld zelf en een JSON met label, verhouding en de hints voor de
 * prompt. De selfies van gebruikers komen hier nooit: die gaan alleen door naar
 * het model.
 */

import { del, list, put } from "@vercel/blob";

import {
  alsDataUrl,
  extensieVoor,
  leesPriveBlob,
  meldOpslagfout,
  nieuwId,
} from "@/lib/blob/beelden";
import { modellenOpslag } from "@/lib/blob/modellen";
import { isGelegenheid, type Basisfoto, type BasisfotoWijziging } from "./index";

const BEELD_PREFIX = "groepsfoto/basisfotos/beelden/";
const META_PREFIX = "groepsfoto/basisfotos/meta/";

/** Zoveel basisfoto's mogen er in de bibliotheek staan. */
export const MAX_BASISFOTOS = 12;

export const groepsfotoModellen = modellenOpslag("groepsfoto/modellen/");

/** Een id zoals `nieuwId()` hem maakt; al het andere is geen basisfoto. */
function isGeldigId(id: string): boolean {
  return /^[a-z0-9]{4,20}-[a-z0-9]{3,10}$/.test(id);
}

function metaPad(id: string): string {
  return `${META_PREFIX}${id}.json`;
}

export function isBasisfotoPad(pad: string): boolean {
  return pad.startsWith(BEELD_PREFIX) && !pad.includes("..");
}

/** Houdt vrije tekst kort en op één regel, want hij gaat de prompt in. */
function schoneTekst(waarde: unknown, max: number): string | undefined {
  if (typeof waarde !== "string") return undefined;
  const schoon = waarde.replace(/\s+/g, " ").trim().slice(0, max);
  return schoon || undefined;
}

async function leesMeta(pad: string): Promise<Basisfoto | null> {
  const inhoud = await leesPriveBlob(pad);
  if (!inhoud) return null;
  try {
    const foto = JSON.parse(inhoud.toString("utf8")) as Basisfoto;
    return foto?.id && isBasisfotoPad(foto.pad) ? foto : null;
  } catch {
    return null;
  }
}

async function schrijfMeta(foto: Basisfoto): Promise<void> {
  try {
    await put(metaPad(foto.id), JSON.stringify(foto), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch (err) {
    meldOpslagfout(err);
  }
}

/** Alle basisfoto's, nieuwste eerst. */
export async function lijstBasisfotos(): Promise<Basisfoto[]> {
  let paden: string[];
  try {
    const { blobs } = await list({ prefix: META_PREFIX });
    paden = blobs.map((b) => b.pathname);
  } catch (err) {
    meldOpslagfout(err);
  }

  const fotos = await Promise.all(paden.map(leesMeta));
  return fotos
    .filter((f): f is Basisfoto => f !== null)
    .sort((a, b) => b.toegevoegdOp.localeCompare(a.toegevoegdOp));
}

export async function vindBasisfoto(id: string): Promise<Basisfoto | null> {
  if (!isGeldigId(id)) return null;
  return leesMeta(metaPad(id));
}

export interface NieuweBasisfoto {
  inhoud: ArrayBuffer;
  contentType: string;
  label: string;
  gelegenheid: unknown;
  breedte: number;
  hoogte: number;
  plaatsingshint?: unknown;
  kleding?: unknown;
  toegevoegdDoor: string;
}

export async function bewaarBasisfoto(nieuw: NieuweBasisfoto): Promise<Basisfoto> {
  const extensie = extensieVoor(nieuw.contentType);
  if (!extensie) throw new Error("Alleen jpg, png of webp kan als basisfoto.");

  const id = nieuwId();
  const foto: Basisfoto = {
    id,
    pad: `${BEELD_PREFIX}${id}.${extensie}`,
    label: schoneTekst(nieuw.label, 60) ?? "Groepsfoto",
    gelegenheid: isGelegenheid(nieuw.gelegenheid) ? nieuw.gelegenheid : "overig",
    breedte: Math.round(nieuw.breedte),
    hoogte: Math.round(nieuw.hoogte),
    plaatsingshint: schoneTekst(nieuw.plaatsingshint, 200),
    kleding: schoneTekst(nieuw.kleding, 200),
    toegevoegdDoor: nieuw.toegevoegdDoor,
    toegevoegdOp: new Date().toISOString(),
  };

  try {
    await put(foto.pad, nieuw.inhoud, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: nieuw.contentType,
    });
  } catch (err) {
    meldOpslagfout(err);
  }
  // Pas na het beeld de metadata: een foto zonder beeld komt zo nooit in de lijst.
  await schrijfMeta(foto);

  return foto;
}

export async function wijzigBasisfoto(id: string, wijziging: BasisfotoWijziging): Promise<Basisfoto> {
  const foto = await vindBasisfoto(id);
  if (!foto) throw new Error("Deze basisfoto bestaat niet (meer).");

  const bijgewerkt: Basisfoto = { ...foto };
  if (wijziging.label !== undefined) bijgewerkt.label = schoneTekst(wijziging.label, 60) ?? foto.label;
  if (isGelegenheid(wijziging.gelegenheid)) bijgewerkt.gelegenheid = wijziging.gelegenheid;
  if (wijziging.plaatsingshint !== undefined) {
    bijgewerkt.plaatsingshint = schoneTekst(wijziging.plaatsingshint, 200);
  }
  if (wijziging.kleding !== undefined) bijgewerkt.kleding = schoneTekst(wijziging.kleding, 200);

  await schrijfMeta(bijgewerkt);
  return bijgewerkt;
}

export async function verwijderBasisfoto(id: string): Promise<void> {
  const foto = await vindBasisfoto(id);
  if (!foto) throw new Error("Deze basisfoto bestaat niet (meer).");
  try {
    // Eerst de metadata, dan staat hij meteen niet meer in de lijst.
    await del(metaPad(id));
    await del(foto.pad);
  } catch (err) {
    meldOpslagfout(err);
  }
}

/** Het beeld van een basisfoto, voor de browser; `null` als het pad niet klopt. */
export async function leesBasisfotoBestand(pad: string): Promise<Buffer | null> {
  if (!isBasisfotoPad(pad)) return null;
  return leesPriveBlob(pad);
}

/** Het beeld als data-URL voor het model, dat een privé blob niet zelf kan ophalen. */
export async function basisfotoAlsDataUrl(foto: Basisfoto): Promise<string | null> {
  const inhoud = await leesBasisfotoBestand(foto.pad);
  return inhoud ? alsDataUrl(foto.pad, inhoud) : null;
}
