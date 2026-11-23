import type { Tone } from "@/lib/paid-ads/derive";

/** Opmaak volgens het Rood-Witte Boekje: Nederlandse getallen, datums voluit of kort. */

const MAANDEN_KORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

export function getal(n: number | null | undefined, decimalen = 0): string {
  if (n == null || !Number.isFinite(n)) return "–";
  return n.toLocaleString("nl-NL", { minimumFractionDigits: decimalen, maximumFractionDigits: decimalen });
}

export function procent(n: number | null | undefined, decimalen = 1): string {
  return n == null ? "–" : `${getal(n, decimalen)}%`;
}

export function uren(n: number | null | undefined): string {
  if (n == null) return "–";
  return n >= 100 ? getal(n, 0) : getal(n, 1);
}

/** `2026-11-23` → `23 nov`. */
export function datumKort(d: string | null | undefined): string {
  if (!d) return "–";
  const [, m, dag] = d.slice(0, 10).split("-").map(Number);
  return `${dag} ${MAANDEN_KORT[m - 1]}`;
}

/** `2026-11-23` → `23 november 2026`. */
export function datumLang(d: string | null | undefined): string {
  if (!d) return "–";
  const [j, m, dag] = d.slice(0, 10).split("-").map(Number);
  return `${dag} ${MAANDEN[m - 1]} ${j}`;
}

export function duur(sec: number | null | undefined): string {
  if (!sec) return "–";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Delta als badgetekst en kleur. */
export function delta(pct: number | null | undefined): { tekst: string | null; tone: Tone } {
  if (pct == null) return { tekst: null, tone: "neutral" };
  const teken = pct > 0 ? "+" : pct < 0 ? "−" : "±";
  return { tekst: `${teken}${getal(Math.abs(pct), 1)}%`, tone: pct > 0 ? "good" : pct < 0 ? "bad" : "neutral" };
}
