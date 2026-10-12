/**
 * De lijst seizoenkaarthouders van Digital Marketing inlezen.
 *
 * Het bestand komt uit Excel: één werkblad met een kopregel en de kolommen
 * `CRM ID`, `Vak`, `Rij` en `Stoel`. Kolommen worden op naam gezocht, niet op
 * positie — een eerdere versie had ook `SCC Abonnement`, en extra kolommen
 * mogen er gewoon in staan.
 *
 * Meldingen noemen regelnummers, nooit relatienummers: ze komen in de interface
 * terecht en die is voor iedereen met een login.
 */

import { normalizeArea, toSeatNumber, seatKey, isExcludedArea, type Holder } from "./neighbors";

export class HolderListError extends Error {}

/** Toegestane kopnamen per kolom, in kleine letters. */
const COLUMNS = {
  relationNumber: ["crm id", "crmid", "crm_id", "relatienummer", "relatie nummer"],
  area: ["vak"],
  row: ["rij"],
  seat: ["stoel"],
} as const;

type Column = keyof typeof COLUMNS;

const COLUMN_LABELS: Record<Column, string> = {
  relationNumber: "CRM ID",
  area: "Vak",
  row: "Rij",
  seat: "Stoel",
};

/** Hoeveel voorbeeldregelnummers een melding noemt. */
const MAX_EXAMPLES = 10;

export interface HolderListSummary {
  holders: Holder[];
  /** Regels in het bestand, zonder de kopregel. */
  rowsRead: number;
  relations: number;
  /** Regels die niet te gebruiken waren, met de eerste paar regelnummers. */
  invalidRows: { count: number; examples: number[] };
  /** Stoelen die twee keer voorkwamen; de eerste telt. */
  duplicateSeats: { count: number; examples: number[] };
  /** Stoelen in vakken die de tool toch overslaat (rolstoel, sfeer, uitvak). */
  excludedAreaSeats: number;
}

function headerName(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

/** Een relatienummer als tekst: Excel levert het als getal, CSV als tekst. */
function toRelationNumber(value: unknown): string | null {
  if (typeof value === "number") return Number.isInteger(value) && value > 0 ? String(value) : null;
  if (typeof value === "string" && /^\s*\d+\s*$/.test(value)) return value.trim().replace(/^0+(?=\d)/, "");
  return null;
}

/**
 * Leest een tabel (rijen met cellen) in tot seizoenkaarthouders.
 *
 * De eerste niet-lege rij is de kopregel. Gooit een `HolderListError` als een
 * verplichte kolom ontbreekt of als er geen enkele bruikbare regel is.
 */
export function parseHolderTable(table: readonly (readonly unknown[])[]): HolderListSummary {
  const headerIndex = table.findIndex((row) => row.some((cell) => headerName(cell) !== ""));
  if (headerIndex === -1) throw new HolderListError("Het bestand is leeg.");

  const header = table[headerIndex].map(headerName);
  const index = {} as Record<Column, number>;
  const missing: string[] = [];
  for (const column of Object.keys(COLUMNS) as Column[]) {
    const position = header.findIndex((name) => (COLUMNS[column] as readonly string[]).includes(name));
    if (position === -1) missing.push(COLUMN_LABELS[column]);
    index[column] = position;
  }
  if (missing.length) {
    throw new HolderListError(
      `Kolom ${missing.map((name) => `"${name}"`).join(", ")} ontbreekt. Verwacht: CRM ID, Vak, Rij en Stoel.`
    );
  }

  const holders: Holder[] = [];
  const seen = new Set<string>();
  const relations = new Set<string>();
  const invalid: number[] = [];
  const duplicates: number[] = [];
  let rowsRead = 0;
  let excludedAreaSeats = 0;

  for (let i = headerIndex + 1; i < table.length; i++) {
    const row = table[i];
    if (row.every((cell) => cell === null || cell === undefined || (typeof cell === "string" && !cell.trim()))) continue;
    rowsRead++;
    // Regelnummer zoals Excel hem toont: 1-gebaseerd.
    const line = i + 1;

    const relationNumber = toRelationNumber(row[index.relationNumber]);
    const areaCell = row[index.area];
    const area = typeof areaCell === "string" ? normalizeArea(areaCell) : "";
    const seatRow = toSeatNumber(row[index.row]);
    const seat = toSeatNumber(row[index.seat]);
    const key = seatKey(area, seatRow, seat);

    if (!relationNumber || !area || seatRow === null || seat === null || !key) {
      invalid.push(line);
      continue;
    }
    if (seen.has(key)) {
      duplicates.push(line);
      continue;
    }
    seen.add(key);
    relations.add(relationNumber);
    if (isExcludedArea(area)) excludedAreaSeats++;
    holders.push({ relationNumber, area, row: seatRow, seat });
  }

  if (holders.length === 0) {
    throw new HolderListError(
      invalid.length
        ? `Geen enkele bruikbare regel gevonden. Controleer bijvoorbeeld regel ${invalid.slice(0, 3).join(", ")}.`
        : "Het bestand bevat alleen een kopregel."
    );
  }

  return {
    holders,
    rowsRead,
    relations: relations.size,
    invalidRows: { count: invalid.length, examples: invalid.slice(0, MAX_EXAMPLES) },
    duplicateSeats: { count: duplicates.length, examples: duplicates.slice(0, MAX_EXAMPLES) },
    excludedAreaSeats,
  };
}

/**
 * Splitst CSV-tekst in rijen en cellen.
 *
 * Het scheidingsteken volgt uit de kopregel: puntkomma (Excel met Nederlandse
 * instellingen), tab of komma. Aanhalingstekens rond een cel worden gerespecteerd.
 */
export function parseCsvTable(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [";", "\t", ","].reduce((best, candidate) =>
    firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best
  );

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
