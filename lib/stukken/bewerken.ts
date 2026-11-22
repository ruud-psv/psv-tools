import type { BlokInhoud, BlokType } from "./model";

/**
 * Hulp voor het bewerken van een stuk in het voorbeeld. Puur, zodat het te
 * testen is; de controle zelf gebeurt op de server met dezelfde regels als bij
 * de assistent (`lib/stukken/model.ts`).
 */

export const HANDMATIGE_BRON = "Handmatig ingevuld";

export const NIEUW_BLOK_LABEL: Record<BlokType, string> = {
  kop: "Kop",
  tekst: "Tekst",
  kerngetallen: "Kerngetallen",
  conclusie: "Conclusie",
  tabel: "Tabel",
  grafiek: "Grafiek",
  afbeelding: "Afbeelding",
};

/** Een nieuw blok om mee te beginnen; de collega vult het daarna in. */
export function nieuwBlok(type: BlokType): BlokInhoud {
  switch (type) {
    case "kop":
      return { type, tekst: "Nieuwe kop" };
    case "tekst":
      return { type, tekst: "Nieuwe tekst" };
    case "kerngetallen":
      return { type, items: [{ label: "Label", waarde: "0" }], bron: HANDMATIGE_BRON };
    case "conclusie":
      return { type, punten: ["Nieuw punt"] };
    case "tabel":
      return { type, kolommen: ["Kolom 1", "Kolom 2"], rijen: [["", ""]], bron: HANDMATIGE_BRON };
    case "grafiek":
      return { type, titel: "Nieuwe grafiek", soort: "staaf", labels: ["A", "B"], reeksen: [{ naam: "Reeks 1", waarden: [0, 0] }], bron: HANDMATIGE_BRON };
    case "afbeelding":
      return { type, wens: "Beschrijf welke foto hier moet" };
  }
}

/**
 * Een getal zoals een collega het typt: "1.400", "1.400,5", "12,4" of "1400.5".
 * Met een komma is de punt een duizendtal-teken; zonder komma telt een punt
 * gevolgd door precies drie cijfers ook als duizendtal ("1.400" is 1400).
 * Geeft `null` als het geen getal is.
 */
export function leesGetal(tekst: string): number | null {
  const schoon = tekst.replace(/[\s€%]/g, "");
  if (!schoon) return null;
  let genormaliseerd: string;
  if (schoon.includes(",")) genormaliseerd = schoon.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(schoon)) genormaliseerd = schoon.replace(/\./g, "");
  else genormaliseerd = schoon;
  if (!/^-?\d+(\.\d+)?$/.test(genormaliseerd)) return null;
  return Number(genormaliseerd);
}

/** Een getal terug als tekst, zoals in het invulveld. */
export function toonGetal(getal: number): string {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 4, useGrouping: false }).format(getal);
}
