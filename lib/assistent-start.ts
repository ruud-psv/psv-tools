/**
 * De overdracht van het dashboard naar de assistent: het dashboard zet de
 * eerste vraag klaar, de assistent pakt hem bij het openen op en start
 * meteen het gesprek. Via sessionStorage en niet via de URL, zodat een
 * herlaad of de terugknop de vraag niet nog een keer verstuurt.
 */

export const ASSISTENT_HREF = "/dashboard/assistent";

const KEY = "assistent-eerste-vraag";

export const SUGGESTIES = [
  "Hoe loopt de verkoop van de eerstvolgende thuiswedstrijd?",
  "Waar gingen de vragen aan de FANdesk deze week over?",
  "Hoeveel plekken voor twee naast elkaar zijn er nog?",
  "Hoe deel ik een bestand met persoonsgegevens?",
];

export function zetEersteVraag(vraag: string): boolean {
  try {
    sessionStorage.setItem(KEY, vraag);
    return true;
  } catch {
    return false;
  }
}

/** Leest de klaargezette vraag en haalt hem meteen weg, zodat hij maar één keer wordt verstuurd. */
export function pakEersteVraag(): string | null {
  try {
    const vraag = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return vraag?.trim() ? vraag : null;
  } catch {
    return null;
  }
}
