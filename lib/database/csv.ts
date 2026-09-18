/**
 * Het inlezen van een SSO-export of een campagne-export in de browser.
 *
 * Het parsen gebeurt hier en niet op de server omdat een bronexport 100.000 tot
 * een miljoen regels telt (tientallen MB's) en een serverless function maximaal
 * ~4,5 MB request body aanneemt. Hetzelfde patroon als
 * `app/dashboard/ticket-inzichten/upload/page.tsx`: streamend lezen, en alleen
 * de compacte index gaat over de lijn.
 *
 * Bijkomend: het bestand zelf verlaat dit apparaat nooit. Wat wordt verstuurd
 * zijn 48-bits hashes van de ID's met een datum — niet terug te rekenen.
 */

import {
  detectDelimiter,
  parseNlDateTime,
  splitLine,
} from "@/lib/ticket-sales-aggregate";
import {
  IndexBuilder,
  dayAt,
  dayNumber,
  dayToIso,
  dayToMonth,
  dedupe,
  type PackedIndex,
} from "@/lib/database/index-format";

/** De twee kolommen die we nodig hebben; de rest van de export negeren we. */
export interface ColumnMap {
  id: number;
  date: number;
}

/**
 * Kopteksten waarop we een kolom herkennen, genormaliseerd naar kleine letters.
 * De bron levert een aanmaakdatum, een campagne-export een deelnamedatum — voor
 * het inlezen is dat dezelfde kolom, dus beide woordenlijsten staan hier.
 */
const HEADER_PATTERNS: Record<keyof ColumnMap, RegExp> = {
  id: /^(sso ?-?id|ssoid|id|user ?-?id|account ?-?id|customer ?-?id|contact ?-?id|klant ?-?id|persoon ?-?id|profile ?-?id|uuid|guid|hash)$/,
  date: /^(creation ?date|created ?(at|on)?|create ?date|aanmaakdatum|aangemaakt( op)?|registratiedatum|geregistreerd|registered( at)?|signup ?date|deelnamedatum|deelname( op)?|participation ?date|datum|date|timestamp|tijdstip)$/,
};

/** Zonder herkenbare koptekst: eerste kolom het ID, tweede de datum. */
export const DEFAULT_COLUMNS: ColumnMap = { id: 0, date: 1 };

export const COLUMN_LABELS: Record<keyof ColumnMap, string> = {
  id: "SSO-ID",
  date: "Datum",
};

export interface ColumnDetection {
  columns: ColumnMap;
  delimiter: string;
  /** True wanneer de eerste regel een koptekst bleek en dus geen data is. */
  hasHeader: boolean;
  source: Record<keyof ColumnMap, "header" | "positie">;
  /** De cellen van de eerste regel, ongewijzigd — zodat de UI de aanname naast
   *  de echte koptekst kan tonen in plaats van om vertrouwen te vragen. */
  cells: string[];
}

/**
 * Bepaalt scheidingsteken en kolommen uit de eerste regel. Lukt het op naam,
 * dan mappen we op naam; anders vallen we terug op `DEFAULT_COLUMNS`. De
 * aanroeper laat het resultaat zien en kan het laten corrigeren.
 */
export function detectColumns(firstLine: string): ColumnDetection {
  const delimiter = detectDelimiter(firstLine);
  const raw = splitLine(firstLine, delimiter);
  const cells = raw.map((c) => c.toLowerCase().trim());
  const columns = { ...DEFAULT_COLUMNS };
  const source = {} as Record<keyof ColumnMap, "header" | "positie">;

  let matched = 0;
  for (const key of Object.keys(HEADER_PATTERNS) as (keyof ColumnMap)[]) {
    const index = cells.findIndex((c) => HEADER_PATTERNS[key].test(c));
    if (index >= 0) {
      columns[key] = index;
      source[key] = "header";
      matched++;
    } else {
      source[key] = "positie";
    }
  }

  // Eén toevallige match maakt van een datarij nog geen koptekst. Staat er in
  // de datumcel geen leesbare datum, dan is dit sowieso geen datarij — dat
  // vangt ook een export waarvan álle kolomnamen afwijken.
  const dateCellIsDate = parseNlDateTime(cells[columns.date] ?? "") !== null;
  const hasHeader = matched >= 1 || !dateCellIsDate;
  if (!hasHeader) {
    columns.id = DEFAULT_COLUMNS.id;
    columns.date = DEFAULT_COLUMNS.date;
    source.id = "positie";
    source.date = "positie";
  }

  return { columns, delimiter, hasHeader, source, cells: raw };
}

/**
 * Kiest de tekstcodering op inhoud in plaats van op goed vertrouwen. Excel
 * schrijft "Tekst (tab gescheiden)" op Windows als Windows-1252 zonder BOM,
 * terwijl "CSV UTF-8" juist een BOM meegeeft. UTF-8 is zelfvaliderend, dus we
 * proberen een stukje strikt te decoderen: lukt dat, dan is het UTF-8.
 */
export async function sniffEncoding(
  file: Blob
): Promise<"utf-8" | "windows-1252"> {
  const sample = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
  if (sample[0] === 0xef && sample[1] === 0xbb && sample[2] === 0xbf) return "utf-8";
  // De laatste bytes kunnen een afgekapt meerbyte-teken zijn; die laten we weg
  // zodat een geldige UTF-8-tekst niet onterecht afkeurt.
  const trimmed = sample.subarray(0, Math.max(0, sample.length - 4));
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(trimmed);
    return "utf-8";
  } catch {
    return "windows-1252";
  }
}

export interface ParseReport {
  /** Datarijen die zijn gelezen, koptekst niet meegeteld. */
  rowsRead: number;
  /** Rijen zonder ID of zonder leesbare datum. */
  rowsSkipped: number;
  skippedNoId: number;
  skippedBadDate: number;
  /** Rijen met een ID dat al eerder in het bestand stond. */
  duplicates: number;
  /** Unieke ID's. */
  unique: number;
  growthByMonth: Record<string, number>;
  /** `YYYY-MM-DD`, of een lege string als er niets is gelezen. */
  firstRecordDate: string;
  lastRecordDate: string;
  encoding: string;
  detection: ColumnDetection;
}

export interface ParseResult {
  /** Ontdubbeld en gesorteerd; per ID de vroegste datum. */
  index: PackedIndex;
  report: ParseReport;
}

export interface ParseProgress {
  /** 0..1 op basis van gelezen bytes. */
  fraction: number;
  rows: number;
}

export interface ParseOptions {
  /** `auto` sniffet de codering uit de eerste 64 kB. */
  encoding?: "auto" | "utf-8" | "windows-1252";
  /** Overschrijft de automatische kolomherkenning. */
  columns?: ColumnMap;
  onProgress?: (progress: ParseProgress) => void;
}

/**
 * Leest een export streamend en levert de compacte index plus een rapport.
 * Werpt bij een leeg bestand of een bestand zonder bruikbare regels, zodat de
 * aanroeper dat als foutmelding kan tonen in plaats van nul records op te slaan.
 */
export async function parseExport(
  file: File,
  options: ParseOptions = {}
): Promise<ParseResult> {
  const encoding =
    !options.encoding || options.encoding === "auto"
      ? await sniffEncoding(file)
      : options.encoding;

  // Zelf decoderen in plaats van via `TextDecoderStream`: zo tellen we de ruwe
  // bytes direct mee voor de voortgangsbalk, zonder extra stream.
  const reader = file.stream().getReader();
  const decoder = new TextDecoder(encoding);
  const builder = new IndexBuilder();

  let detection: ColumnDetection | null = null;
  let carry = "";
  let bytesRead = 0;
  let rowsRead = 0;
  let skippedNoId = 0;
  let skippedBadDate = 0;
  let lastPaint = 0;

  const consume = (line: string) => {
    if (!line.trim()) return;
    if (!detection) {
      detection = detectColumns(line);
      if (options.columns) detection = { ...detection, columns: options.columns };
      if (detection.hasHeader) return;
    }
    rowsRead++;
    const cells = splitLine(line, detection.delimiter);
    const id = (cells[detection.columns.id] ?? "").trim();
    if (!id) {
      skippedNoId++;
      return;
    }
    const parsed = parseNlDateTime((cells[detection.columns.date] ?? "").trim());
    if (!parsed) {
      skippedBadDate++;
      return;
    }
    const day = dayNumber(parsed.year, parsed.month, parsed.day);
    if (day < 0) {
      skippedBadDate++;
      return;
    }
    builder.add(id, day);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    carry += decoder.decode(value, { stream: true });
    const lines = carry.split(/\r?\n/);
    // De laatste kan halverwege een chunkgrens afgebroken zijn.
    carry = lines.pop() ?? "";
    for (const line of lines) consume(line);

    // Niet elke chunk een render: bij een bestand van tientallen MB's zijn dat
    // duizenden updates en dan staat de UI stil.
    const now = Date.now();
    if (now - lastPaint > 200) {
      lastPaint = now;
      options.onProgress?.({
        fraction: file.size ? bytesRead / file.size : 0,
        rows: rowsRead,
      });
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  carry += decoder.decode();
  if (carry) consume(carry);

  if (!detection) throw new Error("Het bestand is leeg.");
  if (builder.size === 0) {
    throw new Error(
      "Geen bruikbare regels gevonden. Controleer of de kolommen met het SSO-ID en de datum goed staan."
    );
  }

  const { index, duplicates } = dedupe(builder.finish());

  // Pas ná het ontdubbelen tellen: anders telt een dubbel ID twee keer mee in
  // de groeicurve en klopt het totaal niet met het aantal records.
  const growthByMonth: Record<string, number> = {};
  let firstDay = Infinity;
  let lastDay = -Infinity;
  for (let i = 0; i < index.count; i++) {
    const day = dayAt(index, i);
    const month = dayToMonth(day);
    growthByMonth[month] = (growthByMonth[month] ?? 0) + 1;
    if (day < firstDay) firstDay = day;
    if (day > lastDay) lastDay = day;
  }

  options.onProgress?.({ fraction: 1, rows: rowsRead });

  return {
    index,
    report: {
      rowsRead,
      rowsSkipped: skippedNoId + skippedBadDate,
      skippedNoId,
      skippedBadDate,
      duplicates,
      unique: index.count,
      growthByMonth,
      firstRecordDate: index.count ? dayToIso(firstDay) : "",
      lastRecordDate: index.count ? dayToIso(lastDay) : "",
      encoding,
      detection,
    },
  };
}
