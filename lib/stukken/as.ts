/**
 * Een mooie verdeling van de y-as (0, 500, 1.000 … in plaats van 0, 95, 190 …),
 * als alle waarden nul of positief zijn. Anders kiest Recharts zelf.
 */
export function asVerdeling(waarden: number[], stappen = 5): { domein: [number, number]; ticks: number[] } | null {
  const max = Math.max(...waarden);
  if (!Number.isFinite(max) || max <= 0 || waarden.some((w) => w < 0)) return null;
  const ruw = max / stappen;
  const macht = 10 ** Math.floor(Math.log10(ruw));
  const stap = [1, 2, 2.5, 5, 10].map((f) => f * macht).find((s) => s >= ruw) ?? 10 * macht;
  const top = Math.ceil(max / stap) * stap;
  const ticks = Array.from({ length: Math.round(top / stap) + 1 }, (_, i) => Number((i * stap).toPrecision(12)));
  return { domein: [0, top], ticks };
}
