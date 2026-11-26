/**
 * Een Venn-diagram met twee cirkels op schaal: de oppervlakte van elke cirkel
 * is het aantal fans in die bron, en de overlap is het aantal in beide. Puur
 * rekenwerk, zodat het te testen is; de pagina tekent het in SVG.
 */

export interface VennVorm {
  /** Straal van cirkel A en B, in de eenheid waarin oppervlakte = aantal. */
  rA: number;
  rB: number;
  /** Afstand tussen de middelpunten. */
  d: number;
}

/** Oppervlakte van de overlap van twee cirkels met stralen rA en rB op afstand d. */
export function lensOppervlak(rA: number, rB: number, d: number): number {
  if (d >= rA + rB) return 0;
  if (d <= Math.abs(rA - rB)) return Math.PI * Math.min(rA, rB) ** 2;
  const a = rA * rA * Math.acos((d * d + rA * rA - rB * rB) / (2 * d * rA));
  const b = rB * rB * Math.acos((d * d + rB * rB - rA * rA) / (2 * d * rB));
  const c = 0.5 * Math.sqrt((-d + rA + rB) * (d + rA - rB) * (d - rA + rB) * (d + rA + rB));
  return a + b - c;
}

/**
 * De stralen en de afstand waarbij de overlap precies `beide` is. Zoekt de
 * afstand met bisectie: hoe verder uit elkaar, hoe kleiner de overlap.
 */
export function vennVorm(a: number, b: number, beide: number): VennVorm {
  const rA = Math.sqrt(Math.max(0, a) / Math.PI);
  const rB = Math.sqrt(Math.max(0, b) / Math.PI);
  const doel = Math.max(0, Math.min(beide, a, b));
  let lo = Math.abs(rA - rB);
  let hi = rA + rB;
  if (doel <= 0) return { rA, rB, d: hi };
  if (doel >= Math.min(a, b)) return { rA, rB, d: lo };
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (lensOppervlak(rA, rB, mid) > doel) lo = mid;
    else hi = mid;
  }
  return { rA, rB, d: (lo + hi) / 2 };
}
