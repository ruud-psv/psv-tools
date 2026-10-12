/**
 * Welke evenementen in de keuzelijst horen.
 *
 * De stoelstatus wordt bijgehouden voor alle komende evenementen met een
 * stoelenkaart, maar de tool is bedoeld voor thuiswedstrijden van het eerste
 * elftal. Ringside geeft geen team of thuis/uit mee; de naam wel, en die volgt
 * een vaste vorm (zie ook `categorizeProduct()` in `lib/ringside/ticket-events.ts`):
 *
 * - thuis: `PSV - Willem II`, uit: `Willem II - PSV`;
 * - Jong PSV en de vrouwen hebben dat in de naam: `Jong PSV - …`,
 *   `PSV Vrouwen - …`, `FC Twente Vrouwen - PSV Vrouwen`.
 */
export function isPsvHomeMatch(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  if (!/^psv\s*[-–]\s*\S/.test(n)) return false;
  return !n.includes("jong psv") && !n.includes("vrouwen");
}
