"use client";

import { useCallback, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export type SortDir = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

/** Waarde waarop gesorteerd wordt. Leeg (null/undefined/"") komt onderaan. */
export type SortValue = string | number | null | undefined;

/** Accessors per kolom. Definieer deze buiten de component zodat de
 *  sorteer-memo een stabiele referentie heeft. */
export type SortAccessors<T, K extends string> = Record<K, (row: T) => SortValue>;

/**
 * Sorteerstatus voor een tabel. Klikken op een kolom sorteert daarop; nog een
 * klik wisselt tussen hoog→laag en laag→hoog.
 */
export function useTableSort<K extends string>(initialKey: K, initialDir: SortDir = "desc") {
  const [sort, setSort] = useState<SortState<K>>({ key: initialKey, dir: initialDir });

  const toggle = useCallback((key: K, firstDir: SortDir = "desc") => {
    setSort((cur) => (cur.key === key
      ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
      : { key, dir: firstDir }));
  }, []);

  return { sort, toggle };
}

/**
 * Sorteer rijen op een accessor. Lege waarden blijven in beide richtingen
 * onderaan — anders zou "laag naar hoog" een rij lege cellen bovenaan geven.
 * Tekst wordt op Nederlandse collatie vergeleken, met numerieke stukken in
 * getalvolgorde (zodat "/pagina2" voor "/pagina10" komt).
 */
export function sortRows<T>(rows: T[], value: (row: T) => SortValue, dir: SortDir): T[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    const aEmpty = av === null || av === undefined || av === "";
    const bEmpty = bv === null || bv === undefined || bv === "";
    if (aEmpty || bEmpty) return aEmpty && bEmpty ? 0 : aEmpty ? 1 : -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return String(av).localeCompare(String(bv), "nl", { numeric: true }) * factor;
  });
}

/** Tijdstempel voor sortering; ongeldige datums komen onderaan. */
export function timeValue(iso: string | undefined | null): SortValue {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Klikbare kolomkop. `firstDir` bepaalt de richting bij de eerste klik: voor
 * tekstkolommen meestal "asc" (A→Z), voor getallen "desc" (hoog→laag).
 */
export function SortHeader<K extends string>({
  label, sortKey, sort, onSort, align = "right", firstDir, className = "",
}: {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K, firstDir?: SortDir) => void;
  align?: "left" | "right";
  firstDir?: SortDir;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  const dirLabel = !active
    ? "sorteren"
    : sort.dir === "asc"
      ? "laag naar hoog"
      : "hoog naar laag";

  return (
    <th
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-4 py-3 font-heading uppercase tracking-wide text-xs ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey, firstDir)}
        title={`${label} — ${dirLabel}`}
        className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-psv-red-primary ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-psv-red-primary" : ""}`}
      >
        <span>{label}</span>
        <Icon className={`h-3 w-3 flex-shrink-0 ${active ? "" : "opacity-40"}`} aria-hidden />
      </button>
    </th>
  );
}
