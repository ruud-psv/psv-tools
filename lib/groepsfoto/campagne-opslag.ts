/**
 * Opslag van de groepsfoto-campagnes.
 *
 * - De campagne zelf (de bron) staat privé in Vercel Blob, net als de
 *   basisfoto's.
 * - Bij publiceren gaan de config en een kopie van de basisfoto naar een
 *   **privé** storage zone op Bunny, waar alleen het script van de campagne
 *   ze leest. Die zone hangt aan geen enkele pull zone: anders staan de
 *   spelersfoto en de prompts op een openbaar adres. Daarom is het een andere
 *   zone dan die van de Playable loader (`BUNNY_STORAGE_ZONE`), met een eigen
 *   sleutel.
 */

import { del, list, put } from "@vercel/blob";

import { extensieVoor, leesPriveBlob, meldOpslagfout, mimeVanPad } from "@/lib/blob/beelden";
import { haalProfiel } from "@/lib/replicate/client";
import { modelBezwaar, parseerModelId } from "./index";
import {
  bouwConfig,
  bunnyPaden,
  isGeldigeSlug,
  type Campagne,
  type CampagneConfig,
  type CampagneInvoer,
} from "./campagne";
import { leesBasisfotoBestand, vindBasisfoto } from "./opslag";

const PREFIX = "groepsfoto/campagnes/";

/** Zoveel campagnes mogen er tegelijk zijn. */
export const MAX_CAMPAGNES = 20;

const blobPad = (slug: string) => `${PREFIX}${slug}.json`;

/* ------------------------------------------------------------------ */
/* Bunny (privé storage zone)                                          */
/* ------------------------------------------------------------------ */

export class BunnyCampagneConfigFout extends Error {}

export function bunnyCampagneConfig() {
  const zone = process.env.GROEPSFOTO_BUNNY_STORAGE_ZONE?.trim();
  const sleutel = process.env.GROEPSFOTO_BUNNY_STORAGE_KEY?.trim();
  const host = process.env.GROEPSFOTO_BUNNY_STORAGE_HOST?.trim() || "storage.bunnycdn.com";
  if (!zone || !sleutel) {
    throw new BunnyCampagneConfigFout(
      "Publiceren kan nog niet: GROEPSFOTO_BUNNY_STORAGE_ZONE of GROEPSFOTO_BUNNY_STORAGE_KEY ontbreekt in Vercel. " +
        "Gebruik een aparte storage zone op Bunny zonder pull zone."
    );
  }
  // De zone van de Playable loader is openbaar via psveindhoven.b-cdn.net.
  if (zone === process.env.BUNNY_STORAGE_ZONE?.trim()) {
    throw new BunnyCampagneConfigFout(
      "GROEPSFOTO_BUNNY_STORAGE_ZONE is dezelfde zone als die van de Playable loader, en die is openbaar. " +
        "Maak op Bunny een aparte storage zone zonder pull zone."
    );
  }
  return { zone, sleutel, host };
}

async function bunny(pad: string, init: RequestInit = {}): Promise<Response> {
  const { zone, sleutel, host } = bunnyCampagneConfig();
  return fetch(`https://${host}/${zone}/${pad}`, {
    ...init,
    headers: { AccessKey: sleutel, ...(init.headers ?? {}) },
    cache: "no-store",
  });
}

async function bunnyFout(res: Response, wat: string): Promise<Error> {
  const tekst = await res.text().catch(() => "");
  return new Error(`${wat} op Bunny mislukt (HTTP ${res.status})${tekst ? `: ${tekst.slice(0, 200)}` : ""}`);
}

export async function zetOpBunny(pad: string, inhoud: BodyInit, contentType: string): Promise<void> {
  const res = await bunny(pad, { method: "PUT", body: inhoud, headers: { "Content-Type": contentType } });
  if (!res.ok) throw await bunnyFout(res, "Opslaan");
}

export async function leesVanBunny(pad: string): Promise<string | null> {
  const res = await bunny(pad);
  if (res.status === 404) return null;
  if (!res.ok) throw await bunnyFout(res, "Lezen");
  return res.text();
}

/** Een bestand dat er al niet meer is, telt als verwijderd. */
export async function haalVanBunny(pad: string): Promise<void> {
  const res = await bunny(pad, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw await bunnyFout(res, "Verwijderen");
}

/* ------------------------------------------------------------------ */
/* Campagnes in Blob                                                   */
/* ------------------------------------------------------------------ */

async function leesCampagne(pad: string): Promise<Campagne | null> {
  const inhoud = await leesPriveBlob(pad);
  if (!inhoud) return null;
  try {
    const campagne = JSON.parse(inhoud.toString("utf8")) as Campagne;
    return isGeldigeSlug(campagne?.slug) && pad === blobPad(campagne.slug) ? campagne : null;
  } catch {
    return null;
  }
}

async function schrijfCampagne(campagne: Campagne): Promise<void> {
  try {
    await put(blobPad(campagne.slug), JSON.stringify(campagne), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch (err) {
    meldOpslagfout(err);
  }
}

/** Alle campagnes, laatst gewijzigd eerst. */
export async function lijstCampagnes(): Promise<Campagne[]> {
  let paden: string[];
  try {
    const { blobs } = await list({ prefix: PREFIX });
    paden = blobs.map((b) => b.pathname).filter((p) => p.endsWith(".json"));
  } catch (err) {
    meldOpslagfout(err);
  }
  const campagnes = await Promise.all(paden.map(leesCampagne));
  return campagnes
    .filter((c): c is Campagne => c !== null)
    .sort((a, b) => b.gewijzigdOp.localeCompare(a.gewijzigdOp));
}

export async function vindCampagne(slug: string): Promise<Campagne | null> {
  if (!isGeldigeSlug(slug)) return null;
  return leesCampagne(blobPad(slug));
}

/**
 * Maakt een campagne aan of werkt hem bij. Een nieuwe campagne staat uit:
 * aanzetten is een bewuste stap, net als publiceren.
 */
export async function bewaarCampagne(
  invoer: CampagneInvoer,
  email: string,
  nieuw: boolean
): Promise<Campagne> {
  const bestaand = await vindCampagne(invoer.slug);
  if (nieuw && bestaand) throw new Error(`Er is al een campagne met de sleutel "${invoer.slug}".`);
  if (!nieuw && !bestaand) throw new Error("Deze campagne bestaat niet (meer).");
  if (nieuw && (await lijstCampagnes()).length >= MAX_CAMPAGNES) {
    throw new Error(`Er zijn al ${MAX_CAMPAGNES} campagnes. Verwijder er eerst een.`);
  }
  if (!(await vindBasisfoto(invoer.basisfotoId))) {
    throw new Error("Deze foto staat niet (meer) in de bibliotheek.");
  }
  if (!parseerModelId(invoer.model)) throw new Error("Ongeldig model.");

  const nu = new Date().toISOString();
  const campagne: Campagne = {
    ...invoer,
    actief: bestaand?.actief ?? false,
    aangemaaktDoor: bestaand?.aangemaaktDoor ?? email,
    aangemaaktOp: bestaand?.aangemaaktOp ?? nu,
    gewijzigdDoor: email,
    gewijzigdOp: nu,
    gepubliceerd: bestaand?.gepubliceerd,
  };
  await schrijfCampagne(campagne);
  return campagne;
}

/**
 * Zet de campagne op Bunny: eerst de basisfoto, dan de config die ernaar
 * verwijst. Het script ziet zo nooit een config zonder foto.
 */
export async function publiceerCampagne(slug: string, email: string): Promise<Campagne> {
  const campagne = await vindCampagne(slug);
  if (!campagne) throw new Error("Deze campagne bestaat niet (meer).");

  const basisfoto = await vindBasisfoto(campagne.basisfotoId);
  if (!basisfoto) throw new Error("De foto van deze campagne staat niet meer in de bibliotheek. Kies een andere.");
  const beeld = await leesBasisfotoBestand(basisfoto.pad);
  if (!beeld) throw new Error("De foto van deze campagne kon niet worden gelezen.");

  const model = parseerModelId(campagne.model);
  if (!model) throw new Error("Ongeldig model.");
  const { profiel } = await haalProfiel(model.id, model.versie);
  const bezwaar = modelBezwaar(profiel);
  if (bezwaar) throw new Error(bezwaar);

  const contentType = mimeVanPad(basisfoto.pad);
  const extensie = extensieVoor(contentType);
  if (!extensie) throw new Error("De foto heeft een onbekend beeldtype.");

  const nu = new Date().toISOString();
  const basisfotoPad = bunnyPaden.basisfoto(slug, extensie);
  const config = bouwConfig({ campagne, basisfoto, profiel, basisfotoPad, contentType, nu });

  // Een eerdere foto met een andere extensie moet weg, anders blijft hij staan.
  const vorige = campagne.gepubliceerd?.basisfotoPad;

  await zetOpBunny(basisfotoPad, new Uint8Array(beeld), contentType);
  await zetOpBunny(bunnyPaden.config(slug), JSON.stringify(config), "application/json");
  if (vorige && vorige !== basisfotoPad) await haalVanBunny(vorige);

  const bijgewerkt: Campagne = {
    ...campagne,
    gepubliceerd: { op: nu, door: email, configPad: bunnyPaden.config(slug), basisfotoPad },
  };
  await schrijfCampagne(bijgewerkt);
  return bijgewerkt;
}

/**
 * De noodknop. Staat de campagne op Bunny, dan past dit alleen `actief` aan in
 * de config die daar staat, zonder opnieuw te publiceren: uitzetten moet ook
 * werken als de foto of het model intussen niet meer bruikbaar is.
 */
export async function zetCampagneActief(slug: string, actief: boolean): Promise<Campagne> {
  const campagne = await vindCampagne(slug);
  if (!campagne) throw new Error("Deze campagne bestaat niet (meer).");

  if (campagne.gepubliceerd) {
    const pad = bunnyPaden.config(slug);
    const ruw = await leesVanBunny(pad);
    if (!ruw) {
      throw new Error("De config staat niet (meer) op Bunny. Publiceer de campagne opnieuw.");
    }
    const config = JSON.parse(ruw) as CampagneConfig;
    config.actief = actief;
    await zetOpBunny(pad, JSON.stringify(config), "application/json");
  }

  const bijgewerkt: Campagne = { ...campagne, actief };
  await schrijfCampagne(bijgewerkt);
  return bijgewerkt;
}

/** Haalt de campagne van Bunny (eerst de config, dan stopt het script meteen) en uit Blob. */
export async function verwijderCampagne(slug: string): Promise<void> {
  const campagne = await vindCampagne(slug);
  if (!campagne) throw new Error("Deze campagne bestaat niet (meer).");

  if (campagne.gepubliceerd) {
    await haalVanBunny(bunnyPaden.config(slug));
    await haalVanBunny(campagne.gepubliceerd.basisfotoPad);
  }
  try {
    await del(blobPad(slug));
  } catch (err) {
    meldOpslagfout(err);
  }
}
