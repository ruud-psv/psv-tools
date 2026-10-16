/**
 * Contact Filter Import: een lijst relatienummers, SSO-ID's of GroupID's
 * inlezen. Draait in de browser (voorbeeld vóór het doorzetten) en op de server
 * (die controleert elke waarde opnieuw).
 *
 * Invoer is geplakte tekst, een CSV/TXT-bestand of een Excel-werkblad:
 *
 * - **Met kopregel:** de kolom wordt op naam gezocht (bijv. `CRM ID`, `SSO ID`,
 *   `GroupID`); andere kolommen mogen erin staan.
 * - **Zonder kopregel, tekst:** elke waarde op een eigen regel, of gescheiden
 *   door komma's, puntkomma's of spaties. Kolommen met tabs ertussen (geplakt
 *   uit Excel) kunnen dan niet: niet te zeggen welke kolom de ID's bevat.
 * - **Zonder kopregel, Excel:** alleen als het werkblad één kolom heeft.
 */

import { parseCsvTable } from "@/lib/aangrenzende-stoelen/holders";

export type IdType = "relatienummer" | "sso-id" | "groupid";

export interface IdTypeInfo {
  label: string;
  plural: string;
  /** Kopnamen waaraan we de kolom herkennen, als `headerKey()`. */
  headers: readonly string[];
  /** De waarde zoals hij naar Maileon gaat, of `null` als hij niet klopt. */
  normalize(value: unknown): string | null;
}

/** Hoeveel voorbeelden een melding noemt. */
const MAX_EXAMPLES = 5;

function cellText(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  return typeof value === "string" ? value.trim() : null;
}

/** Een relatienummer: alleen cijfers, zonder voorloopnullen (zoals bij Aangrenzende stoelen). */
function toRelationNumber(value: unknown): string | null {
  const text = cellText(value);
  if (!text || !/^\d{1,15}$/.test(text)) return null;
  const trimmed = text.replace(/^0+/, "");
  return trimmed || null;
}

/**
 * SSO-ID's en GroupID's: het formaat ligt niet vast, dus letters, cijfers en
 * `-_.:`, zonder spaties. Er moet minstens één cijfer in, zodat een kopregel
 * of een naam niet als ID meegaat.
 */
function toOpaqueId(value: unknown): string | null {
  const text = cellText(value);
  return text && /^(?=.*\d)[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(text) ? text : null;
}

export const ID_TYPES: Record<IdType, IdTypeInfo> = {
  relatienummer: {
    label: "Relatienummer",
    plural: "relatienummers",
    headers: ["relatienummer", "relatienummers", "relatienr", "crmid", "membernumberprior", "relationnumber"],
    normalize: toRelationNumber,
  },
  "sso-id": {
    label: "SSO-ID",
    plural: "SSO-ID's",
    headers: ["ssoid", "ssoids", "sso"],
    normalize: toOpaqueId,
  },
  groupid: {
    label: "GroupID",
    plural: "GroupID's",
    headers: ["groupid", "groupids", "groepid", "externalid"],
    normalize: toOpaqueId,
  },
};

export const ID_TYPE_KEYS = Object.keys(ID_TYPES) as IdType[];

export function isIdType(value: unknown): value is IdType {
  return typeof value === "string" && value in ID_TYPES;
}

export class IdListError extends Error {}

export interface IdListSummary {
  /** Unieke waarden, in de volgorde van de lijst. */
  values: string[];
  /** Niet-lege waarden gelezen, dubbelen en fouten meegeteld. */
  read: number;
  /** Waarden die niet klopten, met een paar voorbeelden ("regel 5" of de waarde zelf). */
  invalid: { count: number; examples: string[] };
  duplicates: number;
  /** De kopnaam van de gebruikte kolom, of `null` zonder kopregel. */
  column: string | null;
}

/** `"SSO-ID's"` → `"ssoids"`: kleine letters, zonder spaties en leestekens. */
function headerKey(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().replace(/[\s_\-.'’]/g, "") : "";
}

function isEmpty(cell: unknown): boolean {
  return cell === null || cell === undefined || (typeof cell === "string" && !cell.trim());
}

class Collector {
  private readonly seen = new Set<string>();
  private readonly invalidExamples: string[] = [];
  private invalidCount = 0;
  private duplicates = 0;
  private read = 0;
  private readonly type: IdTypeInfo;

  constructor(type: IdTypeInfo) {
    this.type = type;
  }

  add(cell: unknown, example: string) {
    this.read++;
    const value = this.type.normalize(cell);
    if (!value) {
      this.invalidCount++;
      if (this.invalidExamples.length < MAX_EXAMPLES) this.invalidExamples.push(example);
    } else if (this.seen.has(value)) {
      this.duplicates++;
    } else {
      this.seen.add(value);
    }
  }

  summary(column: string | null): IdListSummary {
    if (this.seen.size === 0) {
      throw new IdListError(
        this.invalidCount
          ? `Geen enkel geldig ${this.type.label} gevonden. Controleer bijvoorbeeld ${this.invalidExamples.slice(0, 3).join(", ")}.`
          : "Er staan geen waarden in de lijst."
      );
    }
    return {
      values: [...this.seen],
      read: this.read,
      invalid: { count: this.invalidCount, examples: this.invalidExamples },
      duplicates: this.duplicates,
      column,
    };
  }
}

/**
 * Zoekt in de eerste niet-lege rij de kolom voor `type`. Staat er wel een kolom
 * van een ander soort ID, dan is dat vrijwel zeker een verkeerde keuze.
 */
function findColumn(table: readonly (readonly unknown[])[], type: IdType) {
  const headerIndex = table.findIndex((row) => row.some((cell) => !isEmpty(cell)));
  if (headerIndex === -1) return null;
  const keys = table[headerIndex].map(headerKey);
  const column = keys.findIndex((key) => ID_TYPES[type].headers.includes(key));
  if (column !== -1) {
    return { headerIndex, column, name: String(table[headerIndex][column]).trim() };
  }
  for (const other of ID_TYPE_KEYS) {
    const position = keys.findIndex((key) => ID_TYPES[other].headers.includes(key));
    if (other !== type && position !== -1) {
      throw new IdListError(
        `De kolom "${String(table[headerIndex][position]).trim()}" bevat ${ID_TYPES[other].plural}, maar je koos ${ID_TYPES[type].label}. Kies het juiste soort ID.`
      );
    }
  }
  return null;
}

/** Alle waarden in één kolom vanaf rij `start`; `name` is de kopnaam, als die er is. */
function fromColumn(
  table: readonly (readonly unknown[])[],
  type: IdType,
  start: number,
  column: number,
  name: string | null
): IdListSummary {
  const collector = new Collector(ID_TYPES[type]);
  for (let i = start; i < table.length; i++) {
    const cell = table[i][column];
    // Regelnummer zoals Excel hem toont: 1-gebaseerd.
    if (!isEmpty(cell)) collector.add(cell, `regel ${i + 1}`);
  }
  return collector.summary(name);
}

/**
 * Geplakte tekst of een CSV/TXT-bestand. Met een kopregel per kolom; zonder
 * kopregel is elk stukje tekst tussen regeleinden, komma's, puntkomma's of
 * spaties een waarde.
 */
export function parseIdText(text: string, type: IdType): IdListSummary {
  const clean = text.replace(/^﻿/, "");
  const table = parseCsvTable(clean);
  const found = findColumn(table, type);
  if (found) return fromColumn(table, type, found.headerIndex + 1, found.column, found.name);

  const lines = clean.split(/\r?\n/);
  // Tabs zonder kopregel: dan zijn het kolommen uit Excel, en is niet te zeggen
  // welke de ID's bevat.
  if (lines.some((line) => line.trim().split("\t").filter((cell) => cell.trim()).length > 1)) {
    throw new IdListError(
      `De lijst heeft meerdere kolommen, maar geen kopregel. Zet "${ID_TYPES[type].label}" boven de kolom, of plak alleen die kolom.`
    );
  }

  const collector = new Collector(ID_TYPES[type]);
  for (const line of lines) {
    for (const token of line.split(/[\s,;]+/)) {
      if (token) collector.add(token, `"${token.slice(0, 40)}"`);
    }
  }
  return collector.summary(null);
}

/** Een Excel-werkblad: rijen met cellen, zoals `readSheet()` ze geeft. */
export function parseIdSheet(table: readonly (readonly unknown[])[], type: IdType): IdListSummary {
  const found = findColumn(table, type);
  if (found) return fromColumn(table, type, found.headerIndex + 1, found.column, found.name);

  const columns = new Set<number>();
  for (const row of table) row.forEach((cell, index) => !isEmpty(cell) && columns.add(index));
  if (columns.size === 0) throw new IdListError("Het werkblad is leeg.");
  if (columns.size > 1) {
    throw new IdListError(
      `Het werkblad heeft meerdere kolommen, maar geen kopregel. Zet "${ID_TYPES[type].label}" boven de kolom met de ${ID_TYPES[type].plural}.`
    );
  }
  const [column] = columns;
  return fromColumn(table, type, 0, column, null);
}

/**
 * Controle op de server: elke waarde uit het verzoek moet kloppen. De browser
 * heeft foute waarden al weggelaten, dus een fout hier is geen gewone invoer.
 */
export function checkIds(type: IdType, values: unknown): { values: string[] } | { error: string } {
  if (!Array.isArray(values) || values.length === 0) return { error: `Er zijn geen ${ID_TYPES[type].plural} ontvangen.` };
  const unique = new Set<string>();
  let invalid = 0;
  for (const value of values) {
    const normalized = ID_TYPES[type].normalize(value);
    if (normalized) unique.add(normalized);
    else invalid++;
  }
  if (invalid > 0) return { error: `${invalid} waarden zijn geen geldig ${ID_TYPES[type].label}.` };
  return { values: [...unique] };
}
