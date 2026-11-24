/**
 * Groepsfoto-campagne — de publieke versie van de Groepsfoto Creator op een
 * Playable-pagina (zie `docs/groepsfoto-campagne.md`).
 *
 * PSV Tools is alleen het beheer: hier stel je een campagne in, en bij
 * publiceren rekent PSV Tools alles uit wat het script op Bunny nodig heeft en
 * zet dat met de basisfoto in een privé opslag op Bunny. Het script hoeft zo
 * geen promptlogica of modelschema's te kennen, en praat tijdens de campagne
 * nooit met PSV Tools.
 *
 * Dit bestand is zonder opslag of netwerk, zodat het te testen is.
 */

import { bouwInput, type ModelProfiel } from "@/lib/replicate/schema";
import {
  bouwPrompt,
  KLEDING,
  POSITIES,
  type Basisfoto,
  type Kleding,
  type Positie,
} from "./index";

/* ------------------------------------------------------------------ */
/* De campagne zoals PSV Tools hem bewaart                             */
/* ------------------------------------------------------------------ */

export interface CampagneLimieten {
  /** Generaties per IP-adres per uur. */
  perIpPerUur: number;
  /** Generaties per dag voor de hele campagne. */
  perDag: number;
  /** Generaties per Mijn PSV-account; alleen bruikbaar met tokencontrole. */
  perAccount: number;
}

export interface Publicatie {
  op: string;
  door: string;
  /** Het pad van de config op Bunny, ter controle. */
  configPad: string;
  /** Het pad van de basisfoto op Bunny, om hem later weg te kunnen halen. */
  basisfotoPad: string;
}

export interface Campagne {
  /** Vaste sleutel, ook in de adressen op Bunny: `kerst-2026`. */
  slug: string;
  naam: string;
  basisfotoId: string;
  /** `owner/name` of `owner/name:versie`. */
  model: string;
  posities: Positie[];
  kleding: Kleding[];
  limieten: CampagneLimieten;
  /** Pagina's die het script mogen aanroepen. */
  origins: string[];
  /** Uit: het script weigert nieuwe generaties met een nette melding. */
  actief: boolean;
  aangemaaktDoor: string;
  aangemaaktOp: string;
  gewijzigdDoor: string;
  gewijzigdOp: string;
  gepubliceerd?: Publicatie;
}

/** Wat je in het formulier instelt; de rest vult PSV Tools zelf. */
export type CampagneInvoer = Pick<
  Campagne,
  "slug" | "naam" | "basisfotoId" | "model" | "posities" | "kleding" | "limieten" | "origins"
>;

export const STANDAARD_ORIGINS = ["https://club.psv.nl", "https://appv2.leadfamly.com"];

export const STANDAARD_LIMIETEN: CampagneLimieten = {
  perIpPerUur: 5,
  perDag: 1500,
  perAccount: 3,
};

/** Grenzen per limiet: een typfout mag niet de hele begroting openzetten. */
export const LIMIET_GRENZEN: Record<keyof CampagneLimieten, { min: number; max: number; label: string }> = {
  perIpPerUur: { min: 1, max: 100, label: "Per IP-adres per uur" },
  perDag: { min: 1, max: 50_000, label: "Per dag (hele campagne)" },
  perAccount: { min: 1, max: 50, label: "Per Mijn PSV-account" },
};

export const AI_LABEL = "Gemaakt met AI";

/** Een slug zoals hij in een pad op Bunny past. */
export function isGeldigeSlug(slug: unknown): slug is string {
  return typeof slug === "string" && /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/.test(slug);
}

/** Maakt een slug van een naam: "Kerst 2026!" → `kerst-2026`. */
export function slugVan(naam: string): string {
  return naam
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

function isOrigin(waarde: string): boolean {
  try {
    const url = new URL(waarde);
    return url.protocol === "https:" && url.origin === waarde;
  } catch {
    return false;
  }
}

function geheel(waarde: unknown): number | null {
  const getal = typeof waarde === "string" ? Number(waarde) : waarde;
  return typeof getal === "number" && Number.isInteger(getal) ? getal : null;
}

/**
 * Controleert de invoer uit het formulier en geeft hem schoon terug, of een
 * melding die in de UI kan. Alleen keuzes uit de vaste lijsten komen erdoor.
 */
export function valideerCampagne(ruw: unknown): { campagne: CampagneInvoer } | { fout: string } {
  const r = (ruw ?? {}) as Record<string, unknown>;

  if (!isGeldigeSlug(r.slug)) {
    return { fout: "De sleutel mag alleen kleine letters, cijfers en streepjes bevatten (3 tot 40 tekens)." };
  }
  const naam = typeof r.naam === "string" ? r.naam.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (!naam) return { fout: "Geef de campagne een naam." };

  if (typeof r.basisfotoId !== "string" || !r.basisfotoId) return { fout: "Kies een foto." };
  if (typeof r.model !== "string" || !r.model.trim()) return { fout: "Kies een model." };

  const posities = Array.isArray(r.posities)
    ? POSITIES.map((p) => p.waarde).filter((w) => (r.posities as unknown[]).includes(w))
    : [];
  if (posities.length === 0) return { fout: "Kies minstens één positie." };

  const kleding = Array.isArray(r.kleding)
    ? KLEDING.map((k) => k.waarde).filter((w) => (r.kleding as unknown[]).includes(w))
    : [];
  if (kleding.length === 0) return { fout: "Kies minstens één soort kleding." };

  const ruweLimieten = (r.limieten ?? {}) as Record<string, unknown>;
  const limieten = { ...STANDAARD_LIMIETEN };
  for (const sleutel of Object.keys(LIMIET_GRENZEN) as (keyof CampagneLimieten)[]) {
    const { min, max, label } = LIMIET_GRENZEN[sleutel];
    const waarde = geheel(ruweLimieten[sleutel]);
    if (waarde === null || waarde < min || waarde > max) {
      return { fout: `${label}: kies een heel getal van ${min} tot ${max}.` };
    }
    limieten[sleutel] = waarde;
  }

  const origins = Array.isArray(r.origins)
    ? [...new Set(r.origins.filter((o): o is string => typeof o === "string").map((o) => o.trim().replace(/\/+$/, "")))]
        .filter(Boolean)
    : [];
  if (origins.length === 0) return { fout: "Vul minstens één pagina-adres in." };
  const fouteOrigin = origins.find((o) => !isOrigin(o));
  if (fouteOrigin) {
    return { fout: `"${fouteOrigin}" is geen geldig adres. Gebruik de vorm https://club.psv.nl, zonder pad.` };
  }

  return {
    campagne: {
      slug: r.slug,
      naam,
      basisfotoId: r.basisfotoId,
      model: r.model.trim(),
      posities,
      kleding,
      limieten,
      origins: origins.slice(0, 10),
    },
  };
}

/** Heeft de campagne wijzigingen die nog niet op Bunny staan? */
export function heeftOngepubliceerdeWijzigingen(campagne: Campagne): boolean {
  return !campagne.gepubliceerd || campagne.gewijzigdOp > campagne.gepubliceerd.op;
}

/* ------------------------------------------------------------------ */
/* De config voor het script op Bunny                                  */
/* ------------------------------------------------------------------ */

/** Paden in de privé opslag op Bunny. */
export const bunnyPaden = {
  map: (slug: string) => `campagnes/${slug}/`,
  config: (slug: string) => `campagnes/${slug}/config.json`,
  basisfoto: (slug: string, extensie: string) => `campagnes/${slug}/basisfoto.${extensie}`,
};

/** De sleutel van een prompt: `<positie>|<kleding>`. */
export function promptSleutel(positie: Positie, kleding: Kleding): string {
  return `${positie}|${kleding}`;
}

/**
 * Wat het script op Bunny leest. Bewust zonder e-mailadressen en zonder iets
 * wat het script niet nodig heeft.
 */
export interface CampagneConfig {
  schema: 1;
  campagne: string;
  actief: boolean;
  gepubliceerdOp: string;
  replicate: {
    /** Pad onder `https://api.replicate.com/v1`. */
    pad: string;
    /** Bij een gepind model: de version hash, die mee moet in de body. */
    versie?: string;
    promptVeld: string;
    referentieVeld: string;
    referentieIsLijst: boolean;
    /** Velden die bij elke generatie gelijk zijn (verhouding, formaat, aantal). */
    vasteInvoer: Record<string, unknown>;
  };
  /** In deze volgorde naar het model: eerst de basisfoto, dan de selfie. */
  basisfoto: { pad: string; contentType: string; breedte: number; hoogte: number };
  keuzes: { posities: Positie[]; kleding: Kleding[] };
  /** Eén prompt per toegestane combinatie, sleutel `<positie>|<kleding>`. */
  prompts: Record<string, string>;
  limieten: CampagneLimieten;
  origins: string[];
  label: string;
}

export interface ConfigArgs {
  campagne: Campagne;
  basisfoto: Basisfoto;
  profiel: ModelProfiel;
  /** Pad van de basisfoto op Bunny. */
  basisfotoPad: string;
  contentType: string;
  nu: string;
}

/**
 * Bouwt de config met dezelfde onderdelen als `POST /api/groepsfoto`: de
 * prompt uit `bouwPrompt()`, de velden uit `bouwInput()`, en
 * `match_input_image` als het model dat kent. Zo maakt de campagne precies
 * dezelfde foto als de interne tool, zonder vrij tekstveld.
 */
export function bouwConfig({ campagne, basisfoto, profiel, basisfotoPad, contentType, nu }: ConfigArgs): CampagneConfig {
  if (!profiel.referentieVeld || !profiel.referentieIsLijst) {
    throw new Error("Dit model neemt geen twee beelden mee; kies een ander model.");
  }

  const promptVeld = profiel.promptVeld ?? "prompt";
  const vasteInvoer = bouwInput(profiel, {
    prompt: "",
    referenties: ["basisfoto", "selfie"],
    verhouding: `${basisfoto.breedte}:${basisfoto.hoogte}`,
  });
  delete vasteInvoer[promptVeld];
  delete vasteInvoer[profiel.referentieVeld];
  if (profiel.verhoudingVeld && profiel.verhoudingOpties.includes("match_input_image")) {
    vasteInvoer[profiel.verhoudingVeld] = "match_input_image";
  }

  const prompts: Record<string, string> = {};
  for (const positie of campagne.posities) {
    for (const kleding of campagne.kleding) {
      prompts[promptSleutel(positie, kleding)] = bouwPrompt({
        positie,
        kleding,
        plaatsingshint: basisfoto.plaatsingshint,
        groepskleding: basisfoto.kleding,
      });
    }
  }

  return {
    schema: 1,
    campagne: campagne.slug,
    actief: campagne.actief,
    gepubliceerdOp: nu,
    replicate: {
      pad: profiel.versie ? "/predictions" : `/models/${profiel.id}/predictions`,
      versie: profiel.versie,
      promptVeld,
      referentieVeld: profiel.referentieVeld,
      referentieIsLijst: true,
      vasteInvoer,
    },
    basisfoto: { pad: basisfotoPad, contentType, breedte: basisfoto.breedte, hoogte: basisfoto.hoogte },
    keuzes: { posities: [...campagne.posities], kleding: [...campagne.kleding] },
    prompts,
    limieten: { ...campagne.limieten },
    origins: [...campagne.origins],
    label: AI_LABEL,
  };
}
