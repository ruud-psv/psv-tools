/**
 * Het compacte formaat waarin zowel de SSO-bron als een campagne-export wordt
 * bewaard: één gesorteerde lijst van 64-bits woorden, 8 bytes per record.
 *
 *   [ 48 bits hash van het SSO-ID ][ 16 bits dagnummer sinds 2000-01-01 ]
 *
 * Waarom niet gewoon JSON met de ID's erin? Een bronexport is 100.000 tot een
 * miljoen records. Als JSON is dat ~40 MB, hier 8 MB — en belangrijker: omdat
 * de hash in de *hoge* bits zit, is sorteren op deze woorden hetzelfde als
 * sorteren op ID, en staat bij een dubbel ID de vroegste datum vanzelf vooraan.
 * Een analyse is daarmee een merge-join van twee gesorteerde lijsten, O(n+m),
 * zonder ook maar iets in een hashmap te stoppen.
 *
 * In de hete lussen komt geen BigInt voor: er wordt geschreven en vergeleken
 * via een `Uint32Array`-view op dezelfde buffer (twee 32-bits woorden per
 * record). Alleen het sorteren gaat via `BigUint64Array.sort()`, en dat is
 * native code.
 *
 * Bewust vrij van DOM- en Node-API's: dezelfde functies voeden de uploadpagina
 * in de browser en de analyse in een route handler.
 */

/**
 * Meeversturen met elke opgeslagen index. Verandert het hash-algoritme of de
 * indeling van een woord, dan moet dit omhoog: opgeslagen campagne-indexen zijn
 * dan niet meer te vergelijken met een nieuwe bron, en dat moet opvallen in
 * plaats van stilletjes verkeerde aantallen opleveren.
 */
export const HASH_VERSION = 1;

export const BYTES_PER_RECORD = 8;

/**
 * Hoe groot een shard van de index maximaal mag zijn. Een serverless function
 * neemt ~4,5 MB request body aan; 3 MB laat ruimte voor de overhead eromheen.
 * Staat hier en niet bij de opslag omdat de browser het opsplitsen doet.
 */
export const MAX_PART_BYTES = 3 * 1024 * 1024;

/** Nulpunt van het dagnummer. 16 bits reikt daarmee tot in 2179. */
const EPOCH_UTC = Date.UTC(2000, 0, 1);
const MS_PER_DAY = 86400000;
const MAX_DAY = 0xffff;

/**
 * Typed arrays gebruiken de bytevolgorde van het platform. Browser en Node
 * draaien allebei little-endian, dus de woordindexen liggen vast; op een
 * big-endian platform zou het sorteren stilzwijgend op de verkeerde bits
 * gebeuren, en daar willen we een harde fout in plaats van foute cijfers.
 */
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
if (!LITTLE_ENDIAN) {
  throw new Error(
    "lib/database/index-format gaat uit van een little-endian platform."
  );
}

/** Woordindexen binnen één record, little-endian. */
const LOW = 0;
const HIGH = 1;

/** Een gesorteerde index: `words` bevat `count * 2` 32-bits woorden. */
export interface PackedIndex {
  words: Uint32Array;
  count: number;
}

/* ---------- Dagnummers ---------- */

/**
 * Dagen sinds 2000-01-01, of -1 als de datum buiten het bereik valt dat in
 * 16 bits past. Bewust op UTC gerekend: een export bevat alleen een datum, en
 * zomertijd mag het dagnummer niet laten verspringen.
 */
export function dayNumber(year: number, month: number, day: number): number {
  const ms = Date.UTC(year, month - 1, day);
  if (Number.isNaN(ms)) return -1;
  const n = Math.floor((ms - EPOCH_UTC) / MS_PER_DAY);
  return n < 0 || n > MAX_DAY ? -1 : n;
}

/** `YYYY-MM-DD` uit een dagnummer. */
export function dayToIso(n: number): string {
  const d = new Date(EPOCH_UTC + n * MS_PER_DAY);
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${month}-${day}`;
}

/** `YYYY-MM` uit een dagnummer — voor de groei per maand. */
export function dayToMonth(n: number): string {
  return dayToIso(n).slice(0, 7);
}

/** Dagnummer uit een `YYYY-MM-DD`, of -1 als het geen bruikbare datum is. */
export function isoToDay(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return -1;
  return dayNumber(Number(m[1]), Number(m[2]), Number(m[3]));
}

/* ---------- Hash ---------- */

/**
 * 48-bits hash van een SSO-ID, verdeeld over een low-woord (32 bits) en een
 * high-woord (16 bits). De mixfunctie is die van cyrb53: twee onafhankelijke
 * 32-bits ketens die elkaar aan het eind kruisen, wat een goede spreiding geeft
 * tegen een handvol `Math.imul`-operaties per teken.
 *
 * `crypto.subtle` valt af: dat is asynchroon, en een miljoen keer awaiten kost
 * minuten in plaats van seconden.
 *
 * Botsingskans bij een miljoen records is ~0,2% op één botsend paar — en zo'n
 * botsing scheelt hooguit één record in de telling.
 */
export function hash48(id: string): { lo: number; hi: number } {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < id.length; i++) {
    const ch = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return { lo: h1 >>> 0, hi: (h2 >>> 0) & 0xffff };
}

/* ---------- Opbouwen ---------- */

/**
 * Verzamelt records en levert ze gesorteerd op. Groeit verdubbelend mee, zodat
 * de aanroeper het aantal regels niet vooraf hoeft te weten — een CSV wordt
 * streamend gelezen en dan weet je dat niet.
 */
export class IndexBuilder {
  private words: Uint32Array;
  private count = 0;

  constructor(initialRecords = 1 << 14) {
    this.words = new Uint32Array(Math.max(1, initialRecords) * 2);
  }

  /** `day` moet uit `dayNumber()` komen; een -1 hoort hier niet te belanden. */
  add(id: string, day: number): void {
    if ((this.count + 1) * 2 > this.words.length) {
      const grown = new Uint32Array(this.words.length * 2);
      grown.set(this.words);
      this.words = grown;
    }
    const { hi, lo } = hash48(id);
    const i = this.count * 2;
    this.words[i + LOW] = ((((lo & 0xffff) << 16) >>> 0) | (day & 0xffff)) >>> 0;
    this.words[i + HIGH] = ((((hi & 0xffff) << 16) >>> 0) | (lo >>> 16)) >>> 0;
    this.count++;
  }

  get size(): number {
    return this.count;
  }

  /** Gesorteerd op ID, en per ID op datum oplopend. */
  finish(): PackedIndex {
    const words = this.words.slice(0, this.count * 2);
    if (this.count > 0) new BigUint64Array(words.buffer).sort();
    return { words, count: this.count };
  }
}

/* ---------- Lezen ---------- */

/** Hoge 32 bits van het woord — de bovenste helft van de sleutel. */
function keyHigh(words: Uint32Array, i: number): number {
  return words[i * 2 + HIGH];
}

/** Bits 31..16 van het lage woord — de onderste helft van de sleutel. */
function keyLow(words: Uint32Array, i: number): number {
  return words[i * 2 + LOW] >>> 16;
}

/** Het dagnummer van record `i`. */
export function dayAt(index: PackedIndex, i: number): number {
  return index.words[i * 2 + LOW] & 0xffff;
}

/** -1, 0 of 1 op de 48-bits sleutel; de datum telt niet mee. */
function compareKeys(
  a: PackedIndex,
  i: number,
  b: PackedIndex,
  j: number
): number {
  const ah = keyHigh(a.words, i);
  const bh = keyHigh(b.words, j);
  if (ah !== bh) return ah < bh ? -1 : 1;
  const al = keyLow(a.words, i);
  const bl = keyLow(b.words, j);
  if (al !== bl) return al < bl ? -1 : 1;
  return 0;
}

/** True als record `i` en `i - 1` hetzelfde ID hebben. */
function samePreviousKey(index: PackedIndex, i: number): boolean {
  return i > 0 && compareKeys(index, i, index, i - 1) === 0;
}

/**
 * Houdt per ID alleen het eerste record over. Omdat de lijst gesorteerd is, is
 * dat het record met de vroegste datum — bij een campagne de eerste deelname,
 * bij de bron de oudste aanmaakdatum.
 */
export function dedupe(index: PackedIndex): {
  index: PackedIndex;
  duplicates: number;
} {
  const out = new Uint32Array(index.count * 2);
  let n = 0;
  for (let i = 0; i < index.count; i++) {
    if (samePreviousKey(index, i)) continue;
    out[n * 2 + LOW] = index.words[i * 2 + LOW];
    out[n * 2 + HIGH] = index.words[i * 2 + HIGH];
    n++;
  }
  return {
    index: { words: out.slice(0, n * 2), count: n },
    duplicates: index.count - n,
  };
}

/* ---------- Serialiseren ---------- */

export function toBytes(index: PackedIndex): Uint8Array<ArrayBuffer> {
  return new Uint8Array(
    index.words.buffer as ArrayBuffer,
    index.words.byteOffset,
    index.count * BYTES_PER_RECORD
  );
}

/**
 * Leest een index terug uit ruwe bytes. Kopieert wanneer de bytes niet op een
 * veelvoud van vier beginnen of de buffer groter is dan de index: een
 * `Uint32Array`-view stelt die eis, en een blob-response geeft geen garantie.
 */
export function fromBytes(bytes: Uint8Array): PackedIndex {
  const usable = bytes.byteLength - (bytes.byteLength % BYTES_PER_RECORD);
  const aligned =
    bytes.byteOffset % 4 === 0 && bytes.byteLength === usable
      ? bytes
      : new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + usable));
  const words = new Uint32Array(aligned.buffer, aligned.byteOffset, usable / 4);
  return { words, count: usable / BYTES_PER_RECORD };
}

/** Plakt vooraf gesorteerde shards weer aan elkaar tot één index. */
export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

/* ---------- Vergelijken ---------- */

/**
 * Loopt twee gesorteerde indexen tegelijk af. `onMatch` krijgt de posities van
 * een ID dat in beide voorkomt, `onOnlyA` die van een ID dat alleen links zit.
 * Wat alleen rechts zit slaan we over: geen van de analyses heeft dat nodig.
 */
export function mergeJoin(
  a: PackedIndex,
  b: PackedIndex,
  onMatch: (ai: number, bi: number) => void,
  onOnlyA?: (ai: number) => void
): void {
  let i = 0;
  let j = 0;
  while (i < a.count && j < b.count) {
    const cmp = compareKeys(a, i, b, j);
    if (cmp === 0) {
      onMatch(i, j);
      i++;
      j++;
    } else if (cmp < 0) {
      onOnlyA?.(i);
      i++;
    } else {
      j++;
    }
  }
  for (; i < a.count; i++) onOnlyA?.(i);
}

/** Hoeveel ID's in beide indexen voorkomen. Beide moeten ontdubbeld zijn. */
export function intersectionSize(a: PackedIndex, b: PackedIndex): number {
  let shared = 0;
  mergeJoin(a, b, () => {
    shared++;
  });
  return shared;
}

/**
 * Hoeveel unieke personen aan 1, 2, 3, ... van de meegegeven campagnes
 * meededen. Alle sleutels achter elkaar plakken, sorteren en de reeksen tellen
 * is hier sneller en simpeler dan een k-weg merge, en de invoer is hooguit een
 * paar honderdduizend records.
 */
export function participationCounts(indexes: PackedIndex[]): number[] {
  const total = indexes.reduce((sum, ix) => sum + ix.count, 0);
  if (total === 0) return [];

  const merged = new Uint32Array(total * 2);
  let n = 0;
  for (const ix of indexes) {
    for (let i = 0; i < ix.count; i++) {
      // Alleen de sleutel telt; de datum zou de sortering per persoon breken.
      merged[n * 2 + LOW] = ix.words[i * 2 + LOW] & 0xffff0000;
      merged[n * 2 + HIGH] = ix.words[i * 2 + HIGH];
      n++;
    }
  }
  new BigUint64Array(merged.buffer).sort();

  const all: PackedIndex = { words: merged, count: total };
  const counts: number[] = [];
  let run = 0;
  for (let i = 0; i < total; i++) {
    if (samePreviousKey(all, i)) {
      run++;
    } else {
      if (run > 0) counts[run - 1] = (counts[run - 1] ?? 0) + 1;
      run = 1;
    }
  }
  if (run > 0) counts[run - 1] = (counts[run - 1] ?? 0) + 1;

  for (let i = 0; i < counts.length; i++) counts[i] = counts[i] ?? 0;
  return counts;
}
