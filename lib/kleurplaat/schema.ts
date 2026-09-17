/**
 * Leest het openapi-schema van een Replicate-model uit en bepaalt daaruit hoe
 * dit model aangeroepen moet worden.
 *
 * Reden: de tool moet met elk model kunnen werken dat iemand erin plakt, en
 * die modellen noemen dezelfde dingen anders — de een heet het `image_input`,
 * de ander `input_image` of `reference_images`. In plaats van per model een
 * stukje code te schrijven, zoeken we de velden op in het schema dat Replicate
 * zelf publiceert.
 */

import type { Verhouding } from "./index";

/* ------------------------------------------------------------------ */
/* Schema uitlezen                                                     */
/* ------------------------------------------------------------------ */

interface RuwVeld {
  type?: string;
  items?: { type?: string; format?: string };
  enum?: unknown[];
  format?: string;
  default?: unknown;
  title?: string;
  description?: string;
  $ref?: string;
  allOf?: { $ref?: string }[];
}

type Schemas = Record<string, RuwVeld & { properties?: Record<string, RuwVeld> }>;

/**
 * Replicate zet een keuzelijst niet in het veld zelf maar in een los schema,
 * waar het veld met `$ref` of `allOf` naar wijst. Dit haalt beide samen.
 */
function volgVerwijzing(veld: RuwVeld, schemas: Schemas): RuwVeld {
  const ref = veld.$ref ?? veld.allOf?.find((a) => a.$ref)?.$ref;
  if (!ref) return veld;
  const naam = ref.split("/").pop();
  const doel = naam ? schemas[naam] : undefined;
  if (!doel) return veld;
  return { ...doel, ...veld, enum: veld.enum ?? doel.enum, type: veld.type ?? doel.type };
}

/** Kandidaatnamen, van meest naar minst waarschijnlijk. */
const PROMPT_VELDEN = ["prompt", "text_prompt", "text", "description"];
const REFERENTIE_VELDEN = [
  "image_input",
  "input_images",
  "reference_images",
  "image_prompt",
  "input_image",
  "reference_image",
  "subject_image",
  "images",
  "image",
];
const VERHOUDING_VELDEN = ["aspect_ratio", "aspectratio", "ratio"];
const FORMAAT_VELDEN = ["output_format", "format"];
const AANTAL_VELDEN = ["max_images", "num_outputs", "number_of_images", "num_images"];

function eersteAanwezig(kandidaten: string[], velden: Record<string, RuwVeld>): string | undefined {
  return kandidaten.find((naam) => naam in velden);
}

function keuzes(veld: RuwVeld | undefined): string[] {
  if (!veld?.enum) return [];
  return veld.enum.filter((v): v is string => typeof v === "string");
}

export interface ModelProfiel {
  /** `owner/name`, zoals op replicate.com. */
  id: string;
  /** Optionele version hash, als het model gepind is. */
  versie?: string;
  promptVeld?: string;
  referentieVeld?: string;
  /** Neemt het referentieveld een lijst of één afbeelding? */
  referentieIsLijst: boolean;
  verhoudingVeld?: string;
  verhoudingOpties: string[];
  formaatVeld?: string;
  formaatOpties: string[];
  aantalVeld?: string;
  /** Levert het model een bestand (afbeelding) op, of alleen tekst? */
  levertBestand: boolean;
  /** Alle toegestane inputvelden — waar de input tegen gefilterd wordt. */
  velden: string[];
}

/** Hoeveel referenties we hoe dan ook meesturen, ook als het model er meer aankan. */
export const MAX_REFERENTIES = 6;

export function maxReferenties(profiel: ModelProfiel | null | undefined): number {
  if (!profiel?.referentieVeld) return 0;
  return profiel.referentieIsLijst ? MAX_REFERENTIES : 1;
}

/** Zoekt ergens in het output-schema naar een bestands-URL. */
function levertBestand(output: RuwVeld | undefined): boolean {
  if (!output) return false;
  if (output.format === "uri") return true;
  if (output.items?.format === "uri") return true;
  return false;
}

export function leesProfiel(
  id: string,
  openapiSchema: unknown,
  versie?: string
): ModelProfiel | null {
  const schemas = (
    openapiSchema as { components?: { schemas?: Schemas } } | null
  )?.components?.schemas;
  const ruweVelden = schemas?.Input?.properties;
  if (!schemas || !ruweVelden) return null;

  const velden: Record<string, RuwVeld> = {};
  for (const [naam, veld] of Object.entries(ruweVelden)) {
    velden[naam] = volgVerwijzing(veld, schemas);
  }

  const referentieVeld = eersteAanwezig(REFERENTIE_VELDEN, velden);
  const verhoudingVeld = eersteAanwezig(VERHOUDING_VELDEN, velden);
  const formaatVeld = eersteAanwezig(FORMAAT_VELDEN, velden);

  return {
    id,
    versie,
    promptVeld: eersteAanwezig(PROMPT_VELDEN, velden),
    referentieVeld,
    referentieIsLijst: referentieVeld ? velden[referentieVeld].type === "array" : false,
    verhoudingVeld,
    verhoudingOpties: keuzes(verhoudingVeld ? velden[verhoudingVeld] : undefined),
    formaatVeld,
    formaatOpties: keuzes(formaatVeld ? velden[formaatVeld] : undefined),
    aantalVeld: eersteAanwezig(AANTAL_VELDEN, velden),
    levertBestand: levertBestand(volgVerwijzing(schemas.Output ?? {}, schemas)),
    velden: Object.keys(velden),
  };
}

/* ------------------------------------------------------------------ */
/* Verhouding kiezen                                                   */
/* ------------------------------------------------------------------ */

const DOEL_RATIO: Record<Verhouding, number> = { "2:3": 2 / 3, "3:2": 3 / 2, "1:1": 1 };

/** Leest "2:3", "1024x1536" of "1024*1536" als een getal. */
function alsRatio(optie: string): number | null {
  const m = optie.match(/^(\d+(?:\.\d+)?)\s*[:x*×/]\s*(\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  const b = Number(m[1]);
  const h = Number(m[2]);
  if (!b || !h) return null;
  return b / h;
}

const WOORDEN: Record<string, number> = {
  square: 1,
  vierkant: 1,
  portrait: 2 / 3,
  vertical: 2 / 3,
  staand: 2 / 3,
  landscape: 3 / 2,
  horizontal: 3 / 2,
  liggend: 3 / 2,
};

/**
 * Kiest uit de opties van het model de verhouding die het dichtst bij de
 * gevraagde ligt. Modellen schrijven het op drie manieren op: "2:3",
 * "1024x1536" of "portrait". Past niets, dan sturen we het veld niet mee en
 * houdt het model zijn eigen standaard aan.
 */
export function kiesVerhouding(opties: string[], gewenst: Verhouding): string | undefined {
  if (opties.length === 0) return undefined;
  if (opties.includes(gewenst)) return gewenst;

  const doel = DOEL_RATIO[gewenst];
  let beste: { optie: string; afstand: number } | null = null;

  for (const optie of opties) {
    const ratio = alsRatio(optie) ?? WOORDEN[optie.toLowerCase()];
    if (!ratio) continue;
    const afstand = Math.abs(Math.log(ratio / doel));
    if (!beste || afstand < beste.afstand) beste = { optie, afstand };
  }

  return beste?.optie;
}

/* ------------------------------------------------------------------ */
/* Input bouwen                                                        */
/* ------------------------------------------------------------------ */

export interface InputArgs {
  prompt: string;
  referenties: string[];
  verhouding: Verhouding;
}

/**
 * Zet onze instellingen om in de velden die dit model kent. Velden die het
 * model niet heeft, laten we weg — die zou Replicate weigeren.
 */
export function bouwInput(profiel: ModelProfiel, args: InputArgs): Record<string, unknown> {
  const input: Record<string, unknown> = {};

  input[profiel.promptVeld ?? "prompt"] = args.prompt;

  if (profiel.referentieVeld && args.referenties.length > 0) {
    input[profiel.referentieVeld] = profiel.referentieIsLijst
      ? args.referenties.slice(0, MAX_REFERENTIES)
      : args.referenties[0];
  }

  if (profiel.verhoudingVeld) {
    const gekozen = profiel.verhoudingOpties.length
      ? kiesVerhouding(profiel.verhoudingOpties, args.verhouding)
      : args.verhouding;
    if (gekozen) input[profiel.verhoudingVeld] = gekozen;
  }

  if (profiel.formaatVeld) {
    const opties = profiel.formaatOpties;
    // png is het prettigst om te printen; anders laten we de standaard staan.
    if (opties.length === 0) input[profiel.formaatVeld] = "png";
    else if (opties.includes("png")) input[profiel.formaatVeld] = "png";
  }

  if (profiel.aantalVeld) input[profiel.aantalVeld] = 1;

  return input;
}
