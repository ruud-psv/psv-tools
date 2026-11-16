/**
 * Groepsfoto Creator — gedeelde logica tussen de UI en de API-routes.
 *
 * De gebruiker uploadt een selfie, en een beeldmodel laat die persoon de plek
 * innemen van precies één speler op een vaste sfeerfoto met PSV-spelers: een
 * kerstkaart, een huldiging, een andere groepssetting. Het aantal mensen op de
 * foto blijft dus gelijk. De basisfoto's beheren we zelf; het
 * model krijgt altijd twee beelden, in een vaste volgorde: eerst de basisfoto,
 * dan de selfie. De prompt leunt op die volgorde.
 */

import type { Model } from "@/lib/replicate/model";
import type { ModelProfiel } from "@/lib/replicate/schema";

export {
  labelUitId,
  parseerModelId,
  type BewaardModel,
  type Model,
  type ModelProfielInfo,
  type StatusResponse,
} from "@/lib/replicate/model";

/* ------------------------------------------------------------------ */
/* Modellen                                                            */
/* ------------------------------------------------------------------ */

/**
 * Modellen die een instructie plus meerdere beelden aannemen. Een model met
 * één beeldveld valt af: dat mist de basisfoto of de selfie.
 */
export const AANBEVOLEN_MODELLEN: Model[] = [
  {
    id: "google/nano-banana",
    label: "Nano Banana (Gemini 2.5 Flash Image)",
    hint: "Snel en goed in gezichten vasthouden over twee beelden. Standaardkeuze.",
  },
  {
    id: "google/nano-banana-pro",
    label: "Nano Banana Pro (Gemini 3 Pro Image)",
    hint: "Trager en duurder, maar beter in licht, schaal en hogere resolutie.",
  },
  {
    id: "bytedance/seedream-4",
    label: "Seedream 4",
    hint: "Hoge resolutie; houdt de basisfoto vaak strak vast.",
  },
];

export const STANDAARD_MODEL = AANBEVOLEN_MODELLEN[0].id;

/**
 * Waarom dit model niet bruikbaar is, of `null` als het wel kan. De
 * generatieroute weigert zo'n model; de modelcontrole meldt het vooraf.
 */
export function modelBezwaar(profiel: ModelProfiel): string | null {
  if (!profiel.levertBestand) {
    return "Dit model levert geen afbeelding op.";
  }
  if (!profiel.referentieVeld) {
    return "Dit model neemt geen beelden mee, dus het kan de selfie niet in de foto zetten.";
  }
  if (!profiel.referentieIsLijst) {
    return "Dit model neemt maar één beeld mee. Voor een groepsfoto zijn er twee nodig: de basisfoto en de selfie.";
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Basisfoto's                                                         */
/* ------------------------------------------------------------------ */

export type Gelegenheid = "kerst" | "huldiging" | "overig";

export const GELEGENHEDEN: { waarde: Gelegenheid; label: string; kaarttekst: string }[] = [
  { waarde: "kerst", label: "Kerst", kaarttekst: "Fijne feestdagen en een sportief nieuwjaar!" },
  { waarde: "huldiging", label: "Huldiging", kaarttekst: "Kampioen!" },
  { waarde: "overig", label: "Overig", kaarttekst: "Groeten uit Eindhoven!" },
];

export function isGelegenheid(waarde: unknown): waarde is Gelegenheid {
  return GELEGENHEDEN.some((g) => g.waarde === waarde);
}

/** Een sfeerfoto met spelers waar de selfie in komt. */
export interface Basisfoto {
  id: string;
  /** Het pad van het beeld in de opslag. */
  pad: string;
  label: string;
  gelegenheid: Gelegenheid;
  breedte: number;
  hoogte: number;
  /** Engels of Nederlands: welke speler het best vervangen kan worden. */
  plaatsingshint?: string;
  /** Engels of Nederlands: wat de groep draagt, voor kleding "passend bij de foto". */
  kleding?: string;
  /** Wie bij het uploaden bevestigde dat de spelers toestemming gaven. */
  toegevoegdDoor: string;
  toegevoegdOp: string;
}

/** Wat je achteraf aan een basisfoto mag bijstellen. */
export type BasisfotoWijziging = Partial<
  Pick<Basisfoto, "label" | "gelegenheid" | "plaatsingshint" | "kleding">
>;

/* ------------------------------------------------------------------ */
/* Keuzes                                                              */
/* ------------------------------------------------------------------ */

export interface Keuze<T extends string> {
  waarde: T;
  label: string;
  /** Wat het model krijgt — Engels, want daar reageren de modellen beter op. */
  prompt: string;
}

export type Positie = "automatisch" | "links" | "midden" | "rechts" | "vooraan";

export const POSITIES: Keuze<Positie>[] = [
  {
    waarde: "automatisch",
    label: "Wie het mooist past",
    prompt:
      "the one player whose position, pose and visibility make the swap look most natural",
  },
  {
    waarde: "links",
    label: "De speler helemaal links",
    prompt: "the leftmost player in the group",
  },
  {
    waarde: "midden",
    label: "De speler in het midden",
    prompt: "the player closest to the centre of the group",
  },
  {
    waarde: "rechts",
    label: "De speler helemaal rechts",
    prompt: "the rightmost player in the group",
  },
  {
    waarde: "vooraan",
    label: "De speler vooraan",
    prompt: "the player who is most in the foreground, closest to the camera",
  },
];

export type Kleding = "passend" | "eigen" | "shirt";

export const KLEDING: Keuze<Kleding>[] = [
  {
    waarde: "passend",
    label: "Kleding van de vervangen speler",
    prompt: "wearing exactly the outfit the replaced player wears in the first image",
  },
  {
    waarde: "eigen",
    label: "Eigen kleding van de selfie",
    prompt: "wearing their own clothes from the second image",
  },
  {
    waarde: "shirt",
    label: "PSV-thuisshirt",
    prompt: "wearing the red and white PSV Eindhoven home shirt",
  },
];

function vind<T extends string>(lijst: Keuze<T>[], waarde: unknown): Keuze<T> | undefined {
  return lijst.find((k) => k.waarde === waarde);
}

export const vindPositie = (waarde: unknown) => vind(POSITIES, waarde);
export const vindKleding = (waarde: unknown) => vind(KLEDING, waarde);

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

export interface PromptInput {
  positie: Positie;
  kleding: Kleding;
  plaatsingshint?: string;
  /** Wat de groep op de basisfoto draagt. */
  groepskleding?: string;
  extra?: string;
}

function zin(tekst: string): string {
  const schoon = tekst.trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
  return schoon ? `${schoon}.` : "";
}

/**
 * Zet de instellingen om in één prompt. De opbouw ligt vast, van breed naar
 * specifiek: de opdracht (één speler vervangen), wie er vervangen wordt, de
 * identiteit van de nieuwe persoon, wat hij draagt, het samensmelten met de
 * foto, en als laatste de harde eisen (die wegen achteraan het zwaarst).
 *
 * De prompt zegt nergens "add": zodra het model iemand mag toevoegen, zet het
 * de selfie ernaast in plaats van op de plek van een speler. Daarom staat het
 * gelijkblijvende aantal mensen er twee keer in.
 *
 * De spelers worden bewust niet bij naam genoemd: het model hoeft niet te
 * weten wie het zijn, alleen dat het de anderen niet mag veranderen.
 */
export function bouwPrompt(input: PromptInput): string {
  const delen: string[] = [];

  delen.push(
    "Edit the first image, a festive group photo of football players. Replace exactly one of the players with the person from the second image, so that this person takes that player's place in the group. Do not add anyone: the photo must show the same number of people as before."
  );

  const positie = vindPositie(input.positie) ?? POSITIES[0];
  delen.push(`The player to replace is ${positie.prompt}.`);
  if (input.plaatsingshint?.trim()) {
    delen.push(zin(`Note about which player to replace: ${input.plaatsingshint}`));
  }
  delen.push(
    "The new person stands in exactly the same spot, with the same pose, body position and size in the frame as the replaced player. The replaced player must be completely gone, with no trace or duplicate of them left anywhere in the image."
  );

  delen.push(
    "Keep the new person's identity exactly as in the second image: the same face, facial features, skin tone, hair, facial hair, glasses if any, and apparent age. They must be clearly recognisable as the same person, not a blend with the replaced player. Show them with a natural, friendly expression that fits the photo."
  );

  const kleding = vindKleding(input.kleding) ?? KLEDING[0];
  if (kleding.waarde === "passend" && input.groepskleding?.trim()) {
    delen.push(zin(`They are dressed like the players: ${input.groepskleding}`));
  } else {
    delen.push(`They are ${kleding.prompt}.`);
  }

  delen.push(
    "Blend them in seamlessly: match the lighting direction, colour temperature, colour grading, sharpness, depth of field, grain and camera perspective of the first image. Their head and body must be in realistic scale relative to the players around them, with correct shadows and overlaps."
  );

  if (input.extra?.trim()) delen.push(zin(`Additional wishes: ${input.extra}`));

  delen.push(
    "Hard requirements: replace exactly one player and no more. Do not change any of the other players in any way — keep their faces, expressions, poses, clothing and positions exactly as in the first image. The total number of people stays exactly the same as in the first image: nobody is added and nobody is removed. Do not change the background, the setting or the decorations. Keep the original framing and aspect ratio of the first image. Photorealistic result, no illustration style. No text, no logos, no watermarks."
  );

  return delen.join(" ");
}

/* ------------------------------------------------------------------ */
/* API-types (gedeeld tussen client en route)                          */
/* ------------------------------------------------------------------ */

export interface GenereerRequest {
  /** Replicate-identifier `owner/name`. */
  model: string;
  versie?: string;
  /** Id van de basisfoto in de gedeelde bibliotheek. */
  basisfoto: string;
  /** De selfie als data-URL (jpeg, png of webp), in de browser verkleind. */
  selfie: string;
  /** De gebruiker bevestigde dat de selfie van hem is, of met toestemming. */
  toestemming: boolean;
  positie: Positie;
  kleding: Kleding;
  extra?: string;
}

export interface GenereerResponse {
  id: string;
  prompt: string;
  model: string;
}
