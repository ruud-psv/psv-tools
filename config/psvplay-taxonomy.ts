/**
 * De tag-taxonomie van PSV Play. De redactie geeft elke video in JW Player
 * tags met een prefix, zoals `type:persconferentie`, `team:psv1` en
 * `seizoen:2026-27`. PSV Tools groepeert de cijfers op die tags.
 *
 * - Een video zonder `type:`-tag valt onder "Ongecategoriseerd". De pagina
 *   toont welk deel van de kijktijd dat is: een stuurmiddel voor de redactie.
 * - Hoofdletters en spaties rond de dubbele punt tellen niet.
 * - Een onbekende waarde (zoals `type:podcast`) telt gewoon mee onder die
 *   waarde. Voeg hem hier toe voor een nette naam.
 */

export interface TagGroep {
  /** Naam van de groep op de pagina en in de tools. */
  label: string;
  /** Bekende waarden met hun weergavenaam. */
  waarden: Record<string, string>;
  /** Patroon voor geldige waarden, als die niet vooraf vast te leggen zijn (zoals seizoenen). */
  patroon?: RegExp;
}

export const PSVPLAY_TAXONOMIE = {
  type: {
    label: "Type",
    waarden: {
      persconferentie: "Persconferentie",
      oefenwedstrijd: "Oefenwedstrijd",
      docu: "Docu",
      interview: "Interview",
      "behind-the-scenes": "Behind the scenes",
      samenvatting: "Samenvatting",
    },
  },
  team: {
    label: "Team",
    waarden: {
      psv1: "PSV 1",
      vrouwen: "PSV Vrouwen",
      jong: "Jong PSV",
      jeugd: "Jeugd",
    },
  },
  seizoen: {
    label: "Seizoen",
    waarden: {},
    /** `2026-27`: het seizoen loopt van 1 juli tot en met 30 juni. */
    patroon: /^\d{4}-\d{2}$/,
  },
} satisfies Record<string, TagGroep>;

export type TagPrefix = keyof typeof PSVPLAY_TAXONOMIE;
export const TAG_PREFIXEN = Object.keys(PSVPLAY_TAXONOMIE) as TagPrefix[];

/** Waar een video zonder `type:`-tag onder valt. */
export const ONGECATEGORISEERD = "Ongecategoriseerd";
