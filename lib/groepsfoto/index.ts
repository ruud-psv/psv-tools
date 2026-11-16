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
    prompt: "Their clothing stays exactly as it is in the first image",
  },
  {
    waarde: "eigen",
    label: "Eigen kleding van de selfie",
    prompt:
      "Change this one player's clothing to the clothes the person wears in the second image; nobody else's clothing changes",
  },
  {
    waarde: "shirt",
    label: "PSV-thuisshirt",
    prompt:
      "Change this one player's top to the red and white PSV Eindhoven home shirt; nobody else's clothing changes",
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
 * Zet de instellingen om in één prompt. Het uitgangspunt is een zo klein
 * mogelijke bewerking: van precies één speler verandert alleen het hoofd (en
 * de huidskleur), al het andere op de foto blijft zoals het is. Hoe minder het
 * model opnieuw mag tekenen, hoe minder er verschuift aan de andere spelers,
 * de kleding en de achtergrond.
 *
 * De opbouw ligt vast: de opdracht, wie er vervangen wordt, wat er aan die ene
 * speler verandert en wat niet, het samensmelten, en als laatste de harde
 * eisen (die wegen achteraan het zwaarst).
 *
 * Twee dingen staan er bewust niet in. "Add": zodra het model iemand mag
 * toevoegen, zet het de selfie ernaast in plaats van op de plek van een
 * speler. En "no text, no logos": dan poetst het model ook de sponsors en het
 * clublogo van de shirts.
 *
 * De spelers worden niet bij naam genoemd: het model hoeft niet te weten wie
 * het zijn, alleen dat het de anderen niet mag veranderen.
 */
export function bouwPrompt(input: PromptInput): string {
  const delen: string[] = [];

  delen.push(
    "Make one small, local edit to the first image, a group photo of football players, and leave everything else exactly as it is. Swap exactly one player for the person in the second image: that player's head becomes the head of the person in the second image. The photo keeps the same number of people."
  );

  const positie = vindPositie(input.positie) ?? POSITIES[0];
  delen.push(`The player to swap is ${positie.prompt}.`);
  if (input.plaatsingshint?.trim()) {
    delen.push(zin(`Note about which player to swap: ${input.plaatsingshint}`));
  }

  delen.push(
    "Give this player the face, facial features, hair, facial hair, glasses if any, skin tone and apparent age of the person in the second image, so that they are clearly recognisable as that person and not a blend with the original player. Match the skin tone of the visible neck, arms and hands to the new face. Use a natural, friendly expression that fits the photo. Nothing of the original player's face or hair remains."
  );

  delen.push(
    "Keep this player's body, pose, position and size in the frame exactly as they are in the first image."
  );

  const kleding = vindKleding(input.kleding) ?? KLEDING[0];
  if (kleding.waarde === "passend" && input.groepskleding?.trim()) {
    delen.push(zin(`${kleding.prompt} (${zin(input.groepskleding).slice(0, -1)})`));
  } else {
    delen.push(`${kleding.prompt}.`);
  }

  delen.push(
    "Blend the new head in seamlessly: match the lighting direction, colour temperature, colour grading, sharpness, depth of field and grain of the first image, at a head size that is in realistic proportion to the body and to the players around them."
  );

  if (input.extra?.trim()) delen.push(zin(`Additional wishes: ${input.extra}`));

  delen.push(
    "Hard requirements: only this one player changes. Every other person stays identical to the first image: the same faces, expressions, hair, poses, clothing and positions. Nobody is added and nobody is removed. The background, setting, decorations, lighting, colours, framing and aspect ratio stay identical to the first image. Take nothing from the second image except the person's own appearance: not its background or its lighting. Keep all existing logos, sponsors and text on clothing and in the scene as they are, and do not add any new text, logos or watermarks. Photorealistic result, no illustration style."
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
