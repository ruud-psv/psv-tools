/** Nederlandse notatie voor de getallen in het Paid Ads dashboard. */

export function nl(value: number | null | undefined, decimals = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("nl-NL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function eur(value: number | null | undefined, decimals = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `€ ${nl(value, decimals)}`;
}

export function pct(value: number | null | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${nl(value, decimals)}%`;
}

/** Kort bedrag voor de as van een grafiek: € 4,2k. */
export function eurShort(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  if (Math.abs(value) >= 1000) return `€ ${nl(value / 1000, 1)}k`;
  return eur(value);
}

export function shortDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function longDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Delta met teken. Procentpunten (`pp`) voor metrics die zelf al een percentage
 * zijn — een CTR die van 1,2% naar 1,5% gaat stijgt met 0,3pp, niet met 25%.
 */
export function signed(value: number | null | undefined, unit: "%" | "pp" | "" = "%"): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const decimals = unit === "%" ? 1 : 2;
  return `${value >= 0 ? "+" : ""}${nl(value, decimals)}${unit}`;
}
