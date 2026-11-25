/**
 * Types en vaste waarden van het TLD overzicht, los van de opslag zodat de
 * pagina in de browser ze kan gebruiken. Zie `lib/tld-overzicht/store.ts`.
 */

export type TldCategorie =
  | "verdacht"
  | "ander gebruik"
  | "geparkeerd"
  | "eigen"
  | "geen website"
  | "geregistreerd, geen webadres"
  | "niet geregistreerd"
  | "wildcard";

/** De volgorde op de pagina: wat aandacht nodig heeft eerst. */
export const CATEGORIE_VOLGORDE: TldCategorie[] = [
  "verdacht",
  "ander gebruik",
  "geparkeerd",
  "eigen",
  "geen website",
  "geregistreerd, geen webadres",
];

export interface TldResultaat {
  domein: string;
  tld: string;
  categorie: TldCategorie;
  /** Verschil met de vorige scan: "nieuw", "was: geparkeerd", "titel veranderd". */
  wijziging?: string;
  ips: string[];
  nameservers: string[];
  eindUrl?: string;
  eindHost?: string;
  httpStatus?: number | null;
  https?: boolean;
  titel?: string;
  fragment?: string;
  wachtwoordveld?: boolean;
  /** Pad van de screenshot in Blob. */
  screenshotPad?: string;
  fout?: string;
}

export interface TldScan {
  datum: string;
  gescandOp: string;
  naam: string;
  eigen: string[];
  resultaten: TldResultaat[];
}

/** Alleen screenshots uit een scanmap mogen via de route opgevraagd worden. */
export function isScreenshotPad(pad: string): boolean {
  return /^tld-overzicht\/\d{4}-\d{2}-\d{2}\/screenshots\/[a-z0-9.-]+\.jpg$/i.test(pad) && !pad.includes("..");
}
