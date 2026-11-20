/**
 * De naam van een concept in Maileon. Los van `concept.ts`, zodat de pagina
 * hem ook in de browser kan tonen (die module gebruikt `node:crypto`).
 */

/**
 * De API-documentatie van Maileon noemt 3 tot 64 tekens, maar bestaande
 * mailings volgens de naamconventie zijn langer (zoals "2026.05.03 PSV Vrouwen
 * - Kampioenschap - Mail personeel - DMID26-11566", 70 tekens). Daarom alleen
 * een waarschuwing boven de 64; weigert Maileon de naam, dan zegt de pagina dat.
 */
export const NAAM_ADVIES = 64;
/** Harde grens, als vangnet. */
export const MAX_NAAM = 255;

/**
 * De mailnaam, met de DMID erachter als die er nog niet in staat, zoals de
 * naamconventie vraagt: "[DATUM] [EXPLOITATIE] - [ONDERWERP] - [DMID]".
 */
export function conceptNaam(naam: string, dmid?: string): string {
  const basis = naam.trim().replace(/\s+/g, " ");
  const id = dmid?.trim() ?? "";
  if (!id || basis.toLowerCase().includes(id.toLowerCase())) return basis;
  return basis ? `${basis} - ${id}` : id;
}
