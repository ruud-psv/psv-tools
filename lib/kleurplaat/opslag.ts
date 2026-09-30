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

import { del, list, put } from "@vercel/blob";

import {
  alsDataUrl,
  extensieVoor,
  leesPriveBlob,
  meldOpslagfout,
  nieuwId,
  veiligeNaam as veiligeBlobNaam,
} from "@/lib/blob/beelden";
import { modellenOpslag } from "@/lib/blob/modellen";
import type { Logo, Referentie } from "./index";

export { extensieVoor, mimeVanPad } from "@/lib/blob/beelden";

const REFERENTIE_PREFIX = "kleurplaat/referenties/";
const LOGO_PREFIX = "kleurplaat/logo/";

/** Zoveel referenties mogen er in de gedeelde bibliotheek staan. */
export const MAX_BIBLIOTHEEK = 24;

function veiligeNaam(ruw: string): string {
  return veiligeBlobNaam(ruw, "referentie");
}

/* ------------------------------------------------------------------ */
/* Referenties                                                         */
/* ------------------------------------------------------------------ */

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

  const id = nieuwId();
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

/** Wat de bestandsroute mag uitleveren: referenties én het logo. */
export function isOpslagPad(pad: string): boolean {
  return isReferentiePad(pad) || isLogoPad(pad);
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
  if (!isOpslagPad(pad)) return null;
  return leesPriveBlob(pad);
}

/**
 * Zet referenties om in data-URL's voor het beeldmodel. Replicate kan een
 * privé blob niet zelf ophalen, dus de server stuurt de inhoud mee.
 */
export async function referentiesAlsDataUrls(paden: string[]): Promise<string[]> {
  const bestanden = await Promise.all(
    paden.map(async (pad) => {
      const inhoud = await leesReferentieBestand(pad);
      return inhoud ? alsDataUrl(pad, inhoud) : null;
    })
  );
  return bestanden.filter((b): b is string => b !== null);
}

/* ------------------------------------------------------------------ */
/* Logo                                                                */
/* ------------------------------------------------------------------ */

export function isLogoPad(pad: string): boolean {
  return pad.startsWith(LOGO_PREFIX) && !pad.includes("..");
}

/**
 * Er is er hoogstens één. Blijven er door een half mislukte upload toch meer
 * staan, dan wint de nieuwste — en de volgende upload ruimt de rest op.
 */
export async function huidigLogo(): Promise<Logo | null> {
  let blobs: { pathname: string; uploadedAt: Date | string }[];
  try {
    ({ blobs } = await list({ prefix: LOGO_PREFIX }));
  } catch (err) {
    meldOpslagfout(err);
  }
  if (blobs.length === 0) return null;

  const nieuwste = blobs
    .map((b) => ({
      pad: b.pathname,
      naam: b.pathname.slice(LOGO_PREFIX.length).replace(/^[^_]*__/, "").replace(/\.png$/i, ""),
      toegevoegdOp:
        b.uploadedAt instanceof Date ? b.uploadedAt.toISOString() : String(b.uploadedAt),
    }))
    .sort((a, b) => b.toegevoegdOp.localeCompare(a.toegevoegdOp))[0];

  return nieuwste;
}

/**
 * Vervangt het logo. Png dus: een logo hoort een doorzichtige achtergrond te
 * hebben, en dat overleeft een jpeg niet.
 */
export async function bewaarLogo(naam: string, inhoud: ArrayBuffer): Promise<Logo> {
  const id = nieuwId();
  const pad = `${LOGO_PREFIX}${id}__${veiligeNaam(naam)}.png`;

  try {
    await put(pad, inhoud, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "image/png",
    });
    // Oude logo's weg, zodat er altijd precies één geldt.
    const { blobs } = await list({ prefix: LOGO_PREFIX });
    await Promise.all(blobs.filter((b) => b.pathname !== pad).map((b) => del(b.pathname)));
  } catch (err) {
    meldOpslagfout(err);
  }

  return { pad, naam: veiligeNaam(naam), toegevoegdOp: new Date().toISOString() };
}

/** Haalt het eigen logo weg; de tool valt dan terug op het logo uit de repo. */
export async function verwijderLogo(): Promise<void> {
  try {
    const { blobs } = await list({ prefix: LOGO_PREFIX });
    await Promise.all(blobs.map((b) => del(b.pathname)));
  } catch (err) {
    meldOpslagfout(err);
  }
}

/* ------------------------------------------------------------------ */
/* Modellen                                                            */
/* ------------------------------------------------------------------ */

const modellen = modellenOpslag("kleurplaat/modellen/");

export const lijstModellen = modellen.lijst;
export const bewaarModel = modellen.bewaar;
export const verwijderModel = modellen.verwijder;
