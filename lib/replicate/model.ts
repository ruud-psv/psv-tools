/**
 * Modeltypes die de beeldtools delen (Kleurplaat Creator, Groepsfoto Creator).
 * Hier staat niets tool-specifieks: een model is een Replicate-identifier, en
 * hoe het aangeroepen wordt leest `lib/replicate/schema.ts` uit.
 */

/**
 * Een model is niet meer dan zijn Replicate-identifier. Hoe het aangeroepen
 * moet worden, leest `lib/replicate/schema.ts` uit het schema dat Replicate
 * publiceert — zo werkt elk model dat iemand erin plakt, zonder code.
 */
export interface Model {
  /** `owner/name`, zoals op replicate.com. */
  id: string;
  label: string;
  /** Korte uitleg in de UI; leeg bij zelf toegevoegde modellen. */
  hint?: string;
  /** Optionele version hash, als het model gepind is. */
  versie?: string;
}

/**
 * Leest een model-identifier uit wat de gebruiker plakt. Toegestaan:
 * `owner/name`, `owner/name:versionhash`, en een volledige replicate.com-URL.
 */
export function parseerModelId(invoer: string): { id: string; versie?: string } | null {
  let tekst = invoer.trim();
  if (!tekst) return null;

  // Volledige URL: https://replicate.com/openai/gpt-image-1.5(/versions/<hash>)
  const url = tekst.match(/^https?:\/\/(?:www\.)?replicate\.com\/([^/\s?#]+\/[^/\s?#]+)(?:\/versions\/([0-9a-f]{6,64}))?/i);
  if (url) tekst = url[2] ? `${url[1]}:${url[2]}` : url[1];

  const m = tekst.match(/^([a-z0-9][a-z0-9._-]*)\/([a-z0-9][a-z0-9._-]*)(?::([0-9a-f]{6,64}))?$/i);
  if (!m) return null;

  return { id: `${m[1]}/${m[2]}`, versie: m[3] };
}

/** Een net label voor een zelf toegevoegd model: `openai/gpt-image-1.5` → `gpt-image-1.5`. */
export function labelUitId(id: string): string {
  return id.split("/").pop() ?? id;
}

/** Een model dat iemand aan de gedeelde lijst heeft toegevoegd. */
export interface BewaardModel {
  id: string;
  versie?: string;
  label: string;
  toegevoegdDoor: string;
  toegevoegdOp: string;
}

/** Wat een `…/model`-route over een model terugmeldt. */
export interface ModelProfielInfo {
  id: string;
  versie?: string;
  omschrijving?: string;
  /** Hoeveel referenties dit model meeneemt; 0 = het kent er geen veld voor. */
  maxReferenties: number;
  referentieVeld?: string;
  verhoudingOpties: string[];
  levertBestand: boolean;
  waarschuwingen: string[];
}

export interface StatusResponse {
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  imageUrl?: string;
  error?: string;
  /** Doorlooptijd in seconden, zodra Replicate hem meldt. */
  duur?: number;
}
