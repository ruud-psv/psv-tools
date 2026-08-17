/**
 * Samenvatten van transactie-exports uit het ticketsysteem naar verkopen per dag.
 *
 * Een export van één seizoen is ~450.000 regels van elk één ticket. Die ruwe
 * regels hoeven nergens bewaard te worden: voor het verkoopverloop is alleen
 * "hoeveel tickets zijn er op dag X voor wedstrijd Y verkocht" nodig. Deze
 * module doet die samenvatting regel voor regel, zodat de aanroeper streamend
 * kan lezen en er nooit meer dan de aggregatie in het geheugen zit.
 *
 * Bewust vrij van DOM- en Node-API's: dezelfde functies voeden de uploadpagina
 * in de browser en kunnen later ook een script of route-handler voeden.
 */

/** Kolommen die we nodig hebben; de rest van de export negeren we. */
export interface ColumnMap {
  eventName: number;
  eventDate: number;
  purchasedAt: number;
  orderId: number;
  price: number;
  ticketType: number;
  channel: number;
}

/**
 * Positionele mapping van de bekende export. Wordt alleen gebruikt wanneer er
 * geen headerrij is; de aanroeper toont hem zodat de aanname zichtbaar blijft.
 *
 * 0 nameAndDate · 1 eventName · 2 eventDate · 3 blokId · 4 blok · 5 rij ·
 * 6 stoel · 7 prijs · 8 tickettype · 9 kanaal · 10 aankoopmoment ·
 * 11 ticketId · 12 orderId · 13 blokId
 */
export const DEFAULT_COLUMNS: ColumnMap = {
  eventName: 1,
  eventDate: 2,
  purchasedAt: 10,
  orderId: 12,
  price: 7,
  ticketType: 8,
  channel: 9,
};

export const COLUMN_LABELS: Record<keyof ColumnMap, string> = {
  eventName: "Wedstrijd",
  eventDate: "Wedstrijddatum",
  purchasedAt: "Aankoopmoment",
  orderId: "Order-ID",
  price: "Prijs",
  ticketType: "Tickettype",
  channel: "Kanaal",
};

/** Kopteksten waarop we een kolom herkennen, genormaliseerd naar kleine letters. */
const HEADER_PATTERNS: Record<keyof ColumnMap, RegExp> = {
  eventName: /^(event ?name|wedstrijd|evenement|omschrijving)$/,
  eventDate: /^(event ?date|actual ?event ?date|wedstrijddatum|datum event)$/,
  purchasedAt: /^(purchase|purchased ?at|order ?date|aankoop|aankoopdatum|aankoopmoment|verkoopdatum|besteldatum)$/,
  orderId: /^(order ?id|ordernummer|order ?number|bestelnummer)$/,
  price: /^(price|prijs|amount|bedrag)$/,
  ticketType: /^(ticket ?type|tickettype|type|soort)$/,
  channel: /^(channel|kanaal|verkoopkanaal|source)$/,
};

const DELIMITERS = ["\t", ";", ","] as const;

/**
 * Raadt het scheidingsteken uit een voorbeeldregel: dat met de meeste
 * voorkomens wint. Excel exporteert in een NL-locale CSV met puntkomma's, en
 * "Tekst (tab gescheiden)" met tabs.
 */
export function detectDelimiter(line: string): string {
  let best: string = DELIMITERS[0];
  let bestCount = -1;
  for (const d of DELIMITERS) {
    const count = line.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return bestCount > 0 ? best : "\t";
}

/** Verwijdert een UTF-8 BOM en omringende quotes van een celwaarde. */
function clean(value: string): string {
  let v = value.replace(/^\uFEFF/, "").trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).trim();
  return v;
}

export function splitLine(line: string, delimiter: string): string[] {
  return line.split(delimiter).map(clean);
}

export interface ColumnDetection {
  columns: ColumnMap;
  /** True wanneer de eerste regel een headerrij bleek en dus niet als data telt. */
  hasHeader: boolean;
  /** Per kolom hoe die is bepaald — voor weergave in de UI. */
  source: Record<keyof ColumnMap, "header" | "positie">;
}

/**
 * Bepaalt de kolomindexen uit de eerste regel. Zit daar een herkenbare
 * koptekst in, dan mappen we op naam; anders vallen we terug op
 * `DEFAULT_COLUMNS`. Deels herkende headers worden per kolom aangevuld, zodat
 * een export met afwijkende namen niet meteen alles onbruikbaar maakt.
 */
export function detectColumns(firstLine: string, delimiter: string): ColumnDetection {
  const cells = splitLine(firstLine, delimiter).map((c) => c.toLowerCase());
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

  // Eén toevallige match maakt van een datarij nog geen header. Pas vanaf drie
  // herkende kopteksten nemen we aan dat dit echt een headerrij is.
  const hasHeader = matched >= 3;
  if (!hasHeader) {
    for (const key of Object.keys(HEADER_PATTERNS) as (keyof ColumnMap)[]) {
      columns[key] = DEFAULT_COLUMNS[key];
      source[key] = "positie";
    }
  }

  return { columns, hasHeader, source };
}

/**
 * `D-M-YYYY HH:mm` (en `DD-MM-YYYY`, met of zonder tijd) naar losse delen.
 * De export is Nederlands geformatteerd, dus `new Date(string)` interpreteert
 * dit fout of helemaal niet — vandaar een eigen parser.
 */
export function parseNlDateTime(
  value: string
): { year: number; month: number; day: number; hour: number; minute: number } | null {
  const m = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day, hour: Number(m[4] ?? 0), minute: Number(m[5] ?? 0) };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** `YYYY-MM-DD` uit een geparseerde NL-datum. */
function toDayKey(d: { year: number; month: number; day: number }): string {
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Middernacht lokale tijd, zodat dagverschillen hele dagen zijn. */
function dayStart(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

/**
 * Dagen tot het event, met dezelfde conventie als `daysUntilEvent` in
 * `lib/ticket-daily-sales.ts`: positief vóór het event, negatief erna.
 */
function offsetBetween(purchaseDay: string, eventDay: string): number {
  return Math.round((dayStart(eventDay) - dayStart(purchaseDay)) / DAY_MS);
}

/** Naam naar een url-veilig fragment voor het event-id. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** `2425` uit `24/25`, zodat het id geen scheidingstekens bevat. */
export function seasonSlug(season: string): string {
  return season.replace(/[^0-9]/g, "") || "onbekend";
}

/**
 * Stabiel event-id: seizoen + maand/dag + naam. De naam alleen is niet genoeg —
 * "PSV - Ajax" komt elk seizoen terug — en het id belandt in share-links, dus
 * het moet over herhaalde uploads hetzelfde blijven.
 */
export function eventId(season: string, eventDay: string, name: string): string {
  const [, month, day] = eventDay.split("-");
  return `${seasonSlug(season)}-${month}${day}-${slugify(name)}`;
}

/** Tegenstander uit een wedstrijdnaam, voor "zelfde tegenstander" in de picker. */
export function extractOpponent(name: string): string {
  const parts = name.split(/\s+-\s+/);
  if (parts.length < 2) return "";
  const left = parts[0].trim();
  const right = parts.slice(1).join(" - ").trim();
  const isPsv = (s: string) => /^(psv|jong psv|psv vrouwen)$/i.test(s.trim());
  const other = isPsv(left) ? right : left;
  // Competitie-achtervoegsels ("beker 24/25", "eredivisie") horen niet bij de
  // tegenstandersnaam waarop we willen matchen.
  return other
    .replace(/\b(beker|eredivisie|champions league|europa league|conference league|oefen\w*)\b.*$/i, "")
    .replace(/\b\d{2}\/\d{2}\b/g, "")
    .trim()
    .toLowerCase();
}

/** Eén samengevat event zoals het wordt opgeslagen. */
export interface AggregatedEvent {
  id: string;
  name: string;
  /** Eventmoment als `YYYY-MM-DDTHH:mm` (lokale tijd, zoals de export). */
  date: string;
  season: string;
  opponent: string;
  totalTickets: number;
  totalOrders: number;
  /** Hoogste dagen-tot-event met verkoop; begin van de dichte reeksen. */
  firstOffset: number;
  /** Tickets per dag vanaf `firstOffset`, aflopend, dicht (0 = geen verkoop). */
  tickets: number[];
  /** Unieke orders per dag, zelfde indexering als `tickets`. */
  orders: number[];
}

export interface EventBreakdown {
  id: string;
  name: string;
  date: string;
  totalTickets: number;
  totalOrders: number;
  firstOffset: number;
  lastOffset: number;
  byTicketType: Record<string, number>;
  byChannel: Record<string, number>;
  /** Aantal tickets met prijs 0 — die tellen mee, maar zijn wel te zien. */
  freeTickets: number;
}

export type SkipReason =
  | "te weinig kolommen"
  | "geen wedstrijdnaam"
  | "onleesbare wedstrijddatum"
  | "onleesbaar aankoopmoment";

export interface AggregateReport {
  season: string;
  rowsRead: number;
  rowsSkipped: number;
  skippedByReason: Record<SkipReason, number>;
  events: EventBreakdown[];
}

export interface AggregateResult {
  events: AggregatedEvent[];
  report: AggregateReport;
}

interface EventAccumulator {
  id: string;
  name: string;
  date: string;
  eventDay: string;
  /** Tickets per dagen-tot-event. */
  perOffset: Map<number, number>;
  /** Order-id's per dagen-tot-event, om transacties los te kunnen tellen. */
  ordersPerOffset: Map<number, Set<string>>;
  byTicketType: Map<string, number>;
  byChannel: Map<string, number>;
  freeTickets: number;
  totalTickets: number;
}

export interface AggregatorOptions {
  season: string;
  columns: ColumnMap;
  delimiter: string;
}

export interface Aggregator {
  /** Verwerkt één dataregel. Lege regels worden genegeerd. */
  addLine(line: string): void;
  finish(): AggregateResult;
  readonly rowsRead: number;
}

function bump<K>(map: Map<K, number>, key: K, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

/**
 * Bouwt de aggregatie op terwijl er regels binnenkomen.
 *
 * Elke regel is één ticket — ook gratis regels en begeleiderskaarten tellen
 * mee, zodat het totaal zo dicht mogelijk bij het `SoldTickets` uit de live
 * feed ligt. Orders worden apart geteld omdat "aantal transacties" en "aantal
 * tickets" verschillende vragen beantwoorden.
 */
export function createAggregator({ season, columns, delimiter }: AggregatorOptions): Aggregator {
  const events = new Map<string, EventAccumulator>();
  const skipped: Record<SkipReason, number> = {
    "te weinig kolommen": 0,
    "geen wedstrijdnaam": 0,
    "onleesbare wedstrijddatum": 0,
    "onleesbaar aankoopmoment": 0,
  };
  let rowsRead = 0;
  let rowsSkipped = 0;

  const maxIndex = Math.max(...Object.values(columns));

  function skip(reason: SkipReason): void {
    skipped[reason]++;
    rowsSkipped++;
  }

  return {
    get rowsRead() {
      return rowsRead;
    },

    addLine(line: string): void {
      if (!line || !line.trim()) return;
      rowsRead++;

      const cells = splitLine(line, delimiter);
      if (cells.length <= maxIndex) return skip("te weinig kolommen");

      const name = cells[columns.eventName];
      if (!name) return skip("geen wedstrijdnaam");

      const eventAt = parseNlDateTime(cells[columns.eventDate]);
      if (!eventAt) return skip("onleesbare wedstrijddatum");

      const purchasedAt = parseNlDateTime(cells[columns.purchasedAt]);
      if (!purchasedAt) return skip("onleesbaar aankoopmoment");

      const eventDay = toDayKey(eventAt);
      const key = `${name}|${eventDay}`;

      let acc = events.get(key);
      if (!acc) {
        acc = {
          id: eventId(season, eventDay, name),
          name,
          date: `${eventDay}T${pad(eventAt.hour)}:${pad(eventAt.minute)}`,
          eventDay,
          perOffset: new Map(),
          ordersPerOffset: new Map(),
          byTicketType: new Map(),
          byChannel: new Map(),
          freeTickets: 0,
          totalTickets: 0,
        };
        events.set(key, acc);
      }

      const offset = offsetBetween(toDayKey(purchasedAt), eventDay);
      bump(acc.perOffset, offset);
      acc.totalTickets++;

      const orderId = cells[columns.orderId];
      if (orderId) {
        let orders = acc.ordersPerOffset.get(offset);
        if (!orders) {
          orders = new Set();
          acc.ordersPerOffset.set(offset, orders);
        }
        orders.add(orderId);
      }

      bump(acc.byTicketType, cells[columns.ticketType] || "onbekend");
      bump(acc.byChannel, cells[columns.channel] || "onbekend");

      // Prijzen zijn NL-geformatteerd ("12,5"); alleen de nulcheck is nodig.
      const price = Number((cells[columns.price] || "0").replace(",", "."));
      if (!price) acc.freeTickets++;
    },

    finish(): AggregateResult {
      const out: AggregatedEvent[] = [];
      const breakdowns: EventBreakdown[] = [];

      for (const acc of events.values()) {
        const offsets = [...acc.perOffset.keys()];
        if (offsets.length === 0) continue;

        // Aflopend: van de vroegste verkoopdag (hoogste dagen-tot-event) naar
        // de laatste. Dagen zonder verkoop binnen dat venster worden een echte
        // 0, zodat de grafiek "niemand kocht" kan onderscheiden van "stond
        // niet in de verkoop".
        const firstOffset = Math.max(...offsets);
        const lastOffset = Math.min(...offsets);
        const length = firstOffset - lastOffset + 1;

        const tickets = new Array<number>(length).fill(0);
        const orders = new Array<number>(length).fill(0);
        for (let i = 0; i < length; i++) {
          const offset = firstOffset - i;
          tickets[i] = acc.perOffset.get(offset) ?? 0;
          orders[i] = acc.ordersPerOffset.get(offset)?.size ?? 0;
        }

        out.push({
          id: acc.id,
          name: acc.name,
          date: acc.date,
          season,
          opponent: extractOpponent(acc.name),
          totalTickets: acc.totalTickets,
          totalOrders: orders.reduce((a, b) => a + b, 0),
          firstOffset,
          tickets,
          orders,
        });

        breakdowns.push({
          id: acc.id,
          name: acc.name,
          date: acc.date,
          totalTickets: acc.totalTickets,
          totalOrders: orders.reduce((a, b) => a + b, 0),
          firstOffset,
          lastOffset,
          byTicketType: Object.fromEntries(acc.byTicketType),
          byChannel: Object.fromEntries(acc.byChannel),
          freeTickets: acc.freeTickets,
        });
      }

      out.sort((a, b) => a.date.localeCompare(b.date));
      breakdowns.sort((a, b) => b.totalTickets - a.totalTickets);

      return {
        events: out,
        report: {
          season,
          rowsRead,
          rowsSkipped,
          skippedByReason: skipped,
          events: breakdowns,
        },
      };
    },
  };
}
