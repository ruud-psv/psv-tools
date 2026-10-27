/**
 * Welke evenementen in de keuzelijst van Ticketing Herdgang horen.
 *
 * Op De Herdgang spelen Jong PSV en PSV Vrouwen hun thuiswedstrijden. Ringside
 * geeft geen locatie mee in de stroom die we bijhouden; de naam volgt wel een
 * vaste vorm (zie ook `lib/aangrenzende-stoelen/events.ts`): de thuisploeg
 * staat voorop, dus `Jong PSV - FC Den Bosch` en `PSV Vrouwen - Ajax Vrouwen`.
 */
export function isHerdgangMatch(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  return /^(jong psv|psv vrouwen)\s*[-–]\s*\S/.test(n);
}
