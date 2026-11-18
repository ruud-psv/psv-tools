/**
 * Een periodepreset ("7d", "30d", "seizoen2526", …) als concreet datumbereik
 * (YYYY-MM-DD). Gedeeld door de browser (deelpagina's, periodekiezer) en de
 * server, die met dezelfde berekening controleert of een deellink om een
 * periode vraagt die gedeeld is. `now` is er voor de tests.
 */
export function getDateRange(preset: string, customFrom?: string, customTo?: string, now: Date = new Date()) {
  if (preset === "custom" && customFrom && customTo) return { from: customFrom, to: customTo };
  const to = now.toISOString().slice(0, 10);
  switch (preset) {
    case "7d":  { const d = new Date(now); d.setDate(d.getDate() - 7);   return { from: d.toISOString().slice(0, 10), to }; }
    case "30d": { const d = new Date(now); d.setDate(d.getDate() - 30);  return { from: d.toISOString().slice(0, 10), to }; }
    case "90d": { const d = new Date(now); d.setDate(d.getDate() - 90);  return { from: d.toISOString().slice(0, 10), to }; }
    case "6m":  { const d = new Date(now); d.setMonth(d.getMonth() - 6); return { from: d.toISOString().slice(0, 10), to }; }
    case "1y":  { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return { from: d.toISOString().slice(0, 10), to }; }
    case "seizoen2425": return { from: "2024-07-01", to: "2025-06-30" };
    case "seizoen2526": {
      const end = new Date(Math.min(new Date("2026-06-30").getTime(), now.getTime()));
      return { from: "2025-07-01", to: end.toISOString().slice(0, 10) };
    }
    default: { const d = new Date(now); d.setDate(d.getDate() - 30); return { from: d.toISOString().slice(0, 10), to }; }
  }
}
