import { ONGECATEGORISEERD, PSVPLAY_TAXONOMIE, TAG_PREFIXEN, type TagPrefix } from "../../config/psvplay-taxonomy";

/**
 * Tags van een video lezen met de taxonomie uit `config/psvplay-taxonomy.ts`.
 */

export interface GeparsdeTags {
  /** Sleutel van de waarde, zoals `persconferentie`; `null` zonder tag. */
  type: string | null;
  team: string | null;
  seizoen: string | null;
  /** Tags zonder bekende prefix. */
  overig: string[];
}

function schoon(tekst: string): string {
  return tekst.trim().toLowerCase().replace(/\s+/g, "-");
}

/** JW geeft tags als lijst of als komma-gescheiden tekst. */
export function tagLijst(tags: unknown): string[] {
  const ruw = Array.isArray(tags) ? tags : typeof tags === "string" ? tags.split(",") : [];
  return ruw.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean);
}

export function parseTags(tags: unknown): GeparsdeTags {
  const uit: GeparsdeTags = { type: null, team: null, seizoen: null, overig: [] };
  for (const tag of tagLijst(tags)) {
    const dp = tag.indexOf(":");
    const prefix = dp > 0 ? (schoon(tag.slice(0, dp)) as TagPrefix) : null;
    const waarde = dp > 0 ? schoon(tag.slice(dp + 1)) : "";
    if (!prefix || !TAG_PREFIXEN.includes(prefix) || !waarde) {
      uit.overig.push(tag);
      continue;
    }
    const groep = PSVPLAY_TAXONOMIE[prefix];
    if ("patroon" in groep && groep.patroon && !groep.patroon.test(waarde)) {
      uit.overig.push(tag);
      continue;
    }
    // De eerste tag per prefix telt.
    if (uit[prefix] === null) uit[prefix] = waarde;
  }
  return uit;
}

/** De weergavenaam van een waarde, of "Ongecategoriseerd" / "Geen team" zonder waarde. */
export function tagLabel(prefix: TagPrefix, waarde: string | null): string {
  if (!waarde) return prefix === "type" ? ONGECATEGORISEERD : prefix === "team" ? "Geen team" : "Geen seizoen";
  const waarden = PSVPLAY_TAXONOMIE[prefix].waarden as Record<string, string>;
  return waarden[waarde] ?? waarde;
}

/** Past een video bij de filters (sleutels of weergavenamen)? */
export function pastBij(tags: GeparsdeTags, filter: { type?: string; team?: string; seizoen?: string }): boolean {
  for (const prefix of ["type", "team", "seizoen"] as const) {
    const gevraagd = filter[prefix];
    if (!gevraagd) continue;
    const g = schoon(gevraagd);
    const waarde = tags[prefix];
    if (g === schoon(ONGECATEGORISEERD) && prefix === "type") {
      if (waarde !== null) return false;
      continue;
    }
    if (waarde !== g && schoon(tagLabel(prefix, waarde)) !== g) return false;
  }
  return true;
}
