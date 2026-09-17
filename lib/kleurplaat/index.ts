/**
 * Kleurplaat Creator — gedeelde logica tussen de UI en de API-routes.
 *
 * De tool genereert een zwart-wit lijntekening (kleurplaat) met Phoxy in de
 * hoofdrol. De gebruiker uploadt een paar referentie-illustraties van Phoxy;
 * die gaan als image-input mee naar het beeldmodel zodat het karakter klopt.
 */

export type DetailNiveau = "eenvoudig" | "gemiddeld" | "gedetailleerd";
export type Verhouding = "2:3" | "3:2" | "1:1";

/* ------------------------------------------------------------------ */
/* Modellen                                                            */
/* ------------------------------------------------------------------ */

export interface KleurplaatModel {
  /** Replicate model slug, `owner/name`. Officiële modellen — geen version hash nodig. */
  id: string;
  label: string;
  /** Korte uitleg in de UI. */
  hint: string;
  /** Hoeveel referentiebeelden het model meeneemt. */
  maxReferenties: number;
  /** Bouwt de model-specifieke input. Onbekende velden worden later tegen het
   *  schema van Replicate gefilterd, dus een extra veld is niet erg. */
  buildInput(args: { prompt: string; referenties: string[]; verhouding: Verhouding }): Record<string, unknown>;
}

export const MODELLEN: KleurplaatModel[] = [
  {
    id: "google/nano-banana",
    label: "Nano Banana (Gemini 2.5 Flash Image)",
    hint: "Beste karakterconsistentie over meerdere referenties. Standaardkeuze.",
    maxReferenties: 4,
    buildInput: ({ prompt, referenties, verhouding }) => ({
      prompt,
      image_input: referenties,
      aspect_ratio: verhouding,
      output_format: "png",
    }),
  },
  {
    id: "bytedance/seedream-4",
    label: "Seedream 4",
    hint: "Strak, hoog opgelost lijnwerk (2K). Neemt veel referenties mee.",
    maxReferenties: 6,
    buildInput: ({ prompt, referenties, verhouding }) => ({
      prompt,
      image_input: referenties,
      aspect_ratio: verhouding,
      size: "2K",
      max_images: 1,
      sequential_image_generation: "disabled",
    }),
  },
  {
    id: "black-forest-labs/flux-kontext-max",
    label: "FLUX.1 Kontext max",
    hint: "Bewerkt één referentie en houdt de stijl strak vast.",
    maxReferenties: 1,
    buildInput: ({ prompt, referenties, verhouding }) => ({
      prompt,
      input_image: referenties[0],
      aspect_ratio: verhouding,
      output_format: "png",
      safety_tolerance: 2,
    }),
  },
];

export const STANDAARD_MODEL = MODELLEN[0].id;

export function vindModel(id: string): KleurplaatModel | undefined {
  return MODELLEN.find((m) => m.id === id);
}

/* ------------------------------------------------------------------ */
/* Scènes                                                              */
/* ------------------------------------------------------------------ */

export interface Scene {
  id: string;
  /** Wat de gebruiker in de dropdown ziet. */
  label: string;
  /** Wat het model krijgt — Engels, want daar reageren de modellen beter op. */
  prompt: string;
}

export const SCENES: Scene[] = [
  {
    id: "juichen",
    label: "Juichen na een doelpunt",
    prompt:
      "Phoxy has just scored and is cheering with both arms in the air, one knee slightly bent, a football rolling at his feet, confetti and a packed stadium crowd suggested with simple outlines in the background",
  },
  {
    id: "schieten",
    label: "Uithaal op doel",
    prompt:
      "Phoxy kicking a football hard towards the goal, leg extended mid-shot, the ball flying off with simple motion lines, grass and pitch lines under his feet",
  },
  {
    id: "keeper",
    label: "Als keeper een bal pakken",
    prompt:
      "Phoxy as a goalkeeper diving sideways through the air with big gloves, catching the football in front of the goal net",
  },
  {
    id: "beker",
    label: "Met de kampioensschaal",
    prompt:
      "Phoxy holding a large championship trophy above his head with both hands, standing proudly, streamers and confetti falling around him",
  },
  {
    id: "stadion",
    label: "Voor het Philips Stadion",
    prompt:
      "Phoxy standing in front of a big football stadium, waving at the viewer, holding a flag in his other hand, a few simple clouds in the sky",
  },
  {
    id: "fans",
    label: "Samen met jonge fans",
    prompt:
      "Phoxy with his arms around two cheerful children wearing football scarves, all three smiling at the viewer, simple stadium seats behind them",
  },
  {
    id: "bus",
    label: "Op de huldigingsbus",
    prompt:
      "Phoxy standing on the open top deck of a celebration bus, waving a big flag, balloons and confetti around him, simple city buildings behind",
  },
  {
    id: "training",
    label: "Trainen met pionnen",
    prompt:
      "Phoxy dribbling a football through a row of training cones on the pitch, tongue out in concentration, a water bottle and a bag of balls beside the cones",
  },
  {
    id: "verjaardag",
    label: "Verjaardagsfeest",
    prompt:
      "Phoxy behind a big birthday cake with candles and a party hat on his head, balloons and a garland of flags above him",
  },
  {
    id: "winter",
    label: "Winter / kerstsfeer",
    prompt:
      "Phoxy in a knitted scarf and bobble hat standing in the snow next to a snowman that wears a football scarf, simple snowflakes falling",
  },
  {
    id: "strand",
    label: "Op het strand",
    prompt:
      "Phoxy on a sunny beach playing football, a beach ball, a bucket and spade in the sand, a simple sun and two seagulls in the sky",
  },
  {
    id: "held",
    label: "Als superheld",
    prompt:
      "Phoxy as a superhero with a flowing cape, standing in a heroic pose on a rooftop with a football under one arm, simple skyline behind him",
  },
];

export function vindScene(id: string): Scene | undefined {
  return SCENES.find((s) => s.id === id);
}

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

const DETAIL_PROMPT: Record<DetailNiveau, string> = {
  eenvoudig:
    "Very simple composition for toddlers and pre-schoolers: few elements, very thick uniform outlines, large open shapes that are easy to colour inside, almost no small details.",
  gemiddeld:
    "Moderate level of detail for children aged four to eight: a clear main character, a readable background, medium-thick uniform outlines, no tiny fiddly shapes.",
  gedetailleerd:
    "Richer level of detail for children aged eight and up: a fuller scene with background elements and pattern details, still with clean uniform outlines and open areas to colour.",
};

export interface PromptInput {
  /** Scène-omschrijving (Engels) — uit een preset of vertaald vrije tekst. */
  scene: string;
  detail: DetailNiveau;
  naam?: string;
  rugnummer?: string;
  extra?: string;
  metReferenties: boolean;
}

/**
 * Zet de instellingen om in één prompt. De opbouw is bewust vast: eerst het
 * soort plaat, dan het karakter, dan de scène, dan de personalisatie en als
 * laatste de harde eisen aan het lijnwerk (die wegen het zwaarst achteraan).
 */
export function bouwPrompt(input: PromptInput): string {
  const delen: string[] = [];

  delen.push(
    "A black and white line art colouring page for children, in the style of a printable colouring book."
  );

  delen.push(
    input.metReferenties
      ? "The main character is Phoxy, the fox mascot of football club PSV Eindhoven, shown in the reference images. Keep his head shape, ears, snout, tail, body proportions and his football kit exactly the same as in the reference images — only redraw him as clean black line art."
      : "The main character is Phoxy, a friendly cartoon fox mascot of a football club, wearing a football kit with shorts and socks."
  );

  delen.push(`Scene: ${input.scene}.`);

  const naam = input.naam?.trim();
  const rugnummer = input.rugnummer?.trim();
  if (naam) {
    delen.push(
      `Write the name "${naam}" in large hollow outline bubble letters across the bottom of the page, so a child can colour the letters in. Spell it exactly as given, with no extra words.`
    );
  }
  if (rugnummer) {
    delen.push(
      `Phoxy's shirt shows the number ${rugnummer} in large hollow outline digits on the front, drawn as empty outlines so it can be coloured in.`
    );
  }

  const extra = input.extra?.trim();
  if (extra) delen.push(`Additional wishes: ${extra}.`);

  delen.push(DETAIL_PROMPT[input.detail]);

  delen.push(
    "Hard requirements: pure black outlines on a pure white background, no colour at all, no grey, no shading, no hatching, no cross-hatching, no gradients, no shadows, no filled black areas, no photo texture. Even line weight throughout, closed shapes, generous white space inside every shape. No watermark, no logo, no signature, no border frame, and no text other than what is explicitly asked for above."
  );

  return delen.join(" ");
}

/** Vertaalt vrije Nederlandse invoer naar een bruikbare scèneregel. */
export function eigenScenePrompt(tekst: string): string {
  return tekst.trim().replace(/\s+/g, " ");
}

/* ------------------------------------------------------------------ */
/* API-types (gedeeld tussen client en route)                          */
/* ------------------------------------------------------------------ */

export interface GenereerRequest {
  model: string;
  sceneId: string | "eigen";
  eigenScene?: string;
  detail: DetailNiveau;
  verhouding: Verhouding;
  naam?: string;
  rugnummer?: string;
  extra?: string;
  /** Data-URL's van de (verkleinde) referentie-uploads. */
  referenties: string[];
}

export interface GenereerResponse {
  id: string;
  prompt: string;
  model: string;
}

export interface StatusResponse {
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  imageUrl?: string;
  error?: string;
  /** Doorlooptijd in seconden, zodra Replicate hem meldt. */
  duur?: number;
}
