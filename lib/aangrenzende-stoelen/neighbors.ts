/**
 * Wie zit er naast een vrije stoel?
 *
 * Kort voor een thuiswedstrijd zijn er soms nog losse stoelen vrij. Kaartverkoop
 * wil dan de seizoenkaarthouders benaderen die ernaast zitten: die kunnen er
 * iemand bij nemen. Deze module rekent dat uit — puur, zonder Ringside of
 * opslag, zodat de regels te testen zijn:
 *
 * - **Vrije stoel**: staat in de stoelenkaart, is niet geblokkeerd, ligt niet in
 *   een uitgesloten vak, en heeft geen geldig ticket — of alleen tickets die in
 *   de resale staan.
 * - **Buren**: links en rechts (stoelnummer ±1) en voor en achter (rijnummer
 *   ±1, zelfde stoelnummer), altijd binnen hetzelfde vak. Waar een trap of gat
 *   in de rij zit slaat de nummering over, dus ±1 klopt daar vanzelf.
 * - **Op de lijst**: een seizoenkaarthouder op zo'n buurstoel, die voor deze
 *   wedstrijd een geldig ticket heeft dat niet in de resale staat. Behalve als
 *   hij zelf de aanbieder is van de vrije stoel ernaast.
 * - **Groepjes**: vrije stoelen met opeenvolgende stoelnummers in dezelfde rij
 *   vormen samen een groepje. Geteld als los, twee, of drie of meer.
 *
 * Bewust niet hier: hoe de rijen uit Ringside gelezen worden. Dit krijgt
 * stoelen en tickets binnen en geeft relatienummers terug.
 */

/** Vakken die nooit meetellen: niet als vrije stoel en niet als buur. */
export const EXCLUDED_AREAS: readonly string[] = [
  // Sfeervakken, ongenummerd.
  "V",
  "W",
  "X",
  "Y",
  // Uitvak.
  "BEZOEKERS",
];

/** Alle rolstoelvakken: RSA t/m RSF, RSH, RSJ en RSK, en eventuele nieuwe. */
export const EXCLUDED_AREA_PREFIXES: readonly string[] = ["RS"];

export function normalizeArea(area: string): string {
  return area.trim().toUpperCase();
}

export function isExcludedArea(area: string): boolean {
  const normalized = normalizeArea(area);
  return (
    EXCLUDED_AREAS.includes(normalized) ||
    EXCLUDED_AREA_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
}

/** Een rij- of stoelnummer als geheel getal, of `null` als het geen nummer is. */
export function toSeatNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 ? value : null;
  if (typeof value === "string" && /^\s*\d+\s*$/.test(value)) return Number(value.trim());
  return null;
}

/**
 * Sleutel van een stoel: `VAK|rij|stoel`.
 *
 * Ringside, de ticketshop en de lijst van Digital Marketing schrijven vak, rij
 * en stoel net iets anders (tekst of getal, hoofd- of kleine letters). Via deze
 * sleutel vallen ze samen. Zonder numerieke rij en stoel is er geen sleutel:
 * zo'n plek heeft geen buren.
 */
export function seatKey(area: unknown, row: unknown, seat: unknown): string | null {
  if (typeof area !== "string" || !area.trim()) return null;
  const r = toSeatNumber(row);
  const s = toSeatNumber(seat);
  if (r === null || s === null) return null;
  return `${normalizeArea(area)}|${r}|${s}`;
}

export interface SeatRef {
  area: string;
  row: number;
  seat: number;
}

/** Een stoel uit de stoelenkaart van de wedstrijd. */
export interface SeatInfo extends SeatRef {
  /** Niet geblokkeerd: `is_counted_as_available` in Ringside. */
  sellable: boolean;
}

/** Een geldig ticket voor deze wedstrijd, op een stoel. */
export interface TicketInfo {
  key: string;
  /** In de resale aangeboden (`resale_status = 'Posted'`). */
  resalePosted: boolean;
  /** Gehashte eigenaar, om "is dit dezelfde persoon" te kunnen vragen. */
  owner: string | null;
}

/** Een regel uit de lijst seizoenkaarthouders. */
export interface Holder extends SeatRef {
  relationNumber: string;
}

export interface NeighborOptions {
  /**
   * Laat relatienummers met méér stoelen dan dit buiten de lijst — bedoeld voor
   * zakelijke en groepsaccounts. `null` of leeg: geen grens.
   */
  maxSeatsPerRelation?: number | null;
}

export interface NeighborRow {
  relationNumber: string;
  /** De eigen stoelen die aan een vrije stoel grenzen, gesorteerd. */
  seats: SeatRef[];
}

/**
 * Hoe de vrije stoelen liggen: los, met z'n tweeën of met meer direct naast
 * elkaar in dezelfde rij. Voor en achter telt hier niet; een gat in de
 * nummering (trap) breekt een groepje.
 */
export interface FreeGroups {
  /** Losse vrije stoelen: links en rechts is niets vrij. */
  one: number;
  /** Groepjes van precies twee vrije stoelen naast elkaar. */
  two: number;
  /** Groepjes van drie of meer vrije stoelen naast elkaar. */
  threeOrMore: number;
  /** Hoeveel stoelen die groepjes van drie of meer samen tellen. */
  seatsInThreeOrMore: number;
}

export interface NeighborStats {
  freeSeats: number;
  /** Hoeveel daarvan vrij zijn omdat het ticket in de resale staat. */
  freeFromResale: number;
  freeGroups: FreeGroups;
  freeGroupsByArea: Record<string, FreeGroups>;
  freeByArea: Record<string, number>;
  /** Per vak: hoeveel van de vrije stoelen in de resale staan. */
  freeFromResaleByArea: Record<string, number>;
  /** Per vak: hoeveel stoelen van seizoenkaarthouders op de lijst staan. */
  listedSeatsByArea: Record<string, number>;
  /** Seizoenkaartstoelen die in de stoelenkaart van deze wedstrijd ontbreken. */
  holderSeatsUnknown: number;
  /** Buren die afvielen omdat ze zelf de stoel ernaast aanbieden. */
  skippedOwnResale: number;
  /** Relatienummers die afvielen op de grens van `maxSeatsPerRelation`. */
  skippedTooManySeats: number;
}

export interface NeighborResult {
  rows: NeighborRow[];
  stats: NeighborStats;
}

function compareSeats(a: SeatRef, b: SeatRef): number {
  return a.area.localeCompare(b.area) || a.row - b.row || a.seat - b.seat;
}

export type SeatStatus = "vrij" | "resale" | "bezet" | "geblokkeerd";

/**
 * Wat er op een stoel aan de hand is, volgens de regels bovenaan. Een geldig
 * ticket dat niet in de resale staat maakt hem bezet; anders is hij
 * geblokkeerd als Ringside hem niet meetelt, en vrij als dat wel zo is (via de
 * resale als er alleen zulke tickets op staan). Uitgesloten vakken bekijkt de
 * aanroeper zelf.
 */
export function seatStatus(seat: SeatInfo, here: readonly TicketInfo[]): SeatStatus {
  if (here.some((ticket) => !ticket.resalePosted)) return "bezet";
  if (!seat.sellable) return "geblokkeerd";
  return here.length > 0 ? "resale" : "vrij";
}

function emptyGroups(): FreeGroups {
  return { one: 0, two: 0, threeOrMore: 0, seatsInThreeOrMore: 0 };
}

function addGroup(groups: FreeGroups, size: number) {
  if (size === 1) groups.one++;
  else if (size === 2) groups.two++;
  else {
    groups.threeOrMore++;
    groups.seatsInThreeOrMore += size;
  }
}

/** Telt de groepjes vrije stoelen naast elkaar, in totaal en per vak. */
export function countFreeGroups(free: Iterable<SeatRef>): { total: FreeGroups; byArea: Record<string, FreeGroups> } {
  const seatsPerRow = new Map<string, { area: string; seats: Set<number> }>();
  for (const { area, row, seat } of free) {
    const a = normalizeArea(area);
    const key = `${a}|${row}`;
    let entry = seatsPerRow.get(key);
    if (!entry) {
      entry = { area: a, seats: new Set() };
      seatsPerRow.set(key, entry);
    }
    entry.seats.add(seat);
  }

  const total = emptyGroups();
  const byArea: Record<string, FreeGroups> = {};
  for (const { area, seats } of seatsPerRow.values()) {
    const sorted = [...seats].sort((a, b) => a - b);
    const groups = (byArea[area] ??= emptyGroups());
    let size = 1;
    for (let i = 1; i <= sorted.length; i++) {
      if (i < sorted.length && sorted[i] === sorted[i - 1] + 1) {
        size++;
        continue;
      }
      addGroup(total, size);
      addGroup(groups, size);
      size = 1;
    }
  }
  return { total, byArea };
}

function neighborKeys({ area, row, seat }: SeatRef): string[] {
  const keys: string[] = [];
  const a = normalizeArea(area);
  if (seat > 0) keys.push(`${a}|${row}|${seat - 1}`);
  keys.push(`${a}|${row}|${seat + 1}`);
  if (row > 0) keys.push(`${a}|${row - 1}|${seat}`);
  keys.push(`${a}|${row + 1}|${seat}`);
  return keys;
}

export function findNeighbors(
  seats: Iterable<SeatInfo>,
  tickets: Iterable<TicketInfo>,
  holders: readonly Holder[],
  options: NeighborOptions = {}
): NeighborResult {
  const seatByKey = new Map<string, SeatInfo>();
  for (const seat of seats) {
    const key = seatKey(seat.area, seat.row, seat.seat);
    if (key) seatByKey.set(key, seat);
  }

  const ticketsByKey = new Map<string, TicketInfo[]>();
  for (const ticket of tickets) {
    const list = ticketsByKey.get(ticket.key);
    if (list) list.push(ticket);
    else ticketsByKey.set(ticket.key, [ticket]);
  }

  const holderByKey = new Map<string, Holder>();
  const seatsPerRelation = new Map<string, number>();
  for (const holder of holders) {
    const key = seatKey(holder.area, holder.row, holder.seat);
    if (!key) continue;
    holderByKey.set(key, holder);
    seatsPerRelation.set(holder.relationNumber, (seatsPerRelation.get(holder.relationNumber) ?? 0) + 1);
  }

  const max = options.maxSeatsPerRelation;
  const tooMany = new Set<string>();
  if (typeof max === "number" && Number.isFinite(max) && max > 0) {
    for (const [relation, count] of seatsPerRelation) if (count > max) tooMany.add(relation);
  }

  const stats: NeighborStats = {
    freeSeats: 0,
    freeFromResale: 0,
    freeGroups: emptyGroups(),
    freeGroupsByArea: {},
    freeByArea: {},
    freeFromResaleByArea: {},
    listedSeatsByArea: {},
    holderSeatsUnknown: 0,
    skippedOwnResale: 0,
    skippedTooManySeats: tooMany.size,
  };

  if (seatByKey.size > 0) {
    for (const key of holderByKey.keys()) if (!seatByKey.has(key)) stats.holderSeatsUnknown++;
  }

  const found = new Map<string, Map<string, SeatRef>>();
  const freeSeats: SeatRef[] = [];

  for (const [freeKey, free] of seatByKey) {
    if (isExcludedArea(free.area)) continue;

    const here = ticketsByKey.get(freeKey) ?? [];
    const status = seatStatus(free, here);
    if (status !== "vrij" && status !== "resale") continue;

    const fromResale = status === "resale";
    freeSeats.push(free);
    stats.freeSeats++;
    if (fromResale) stats.freeFromResale++;
    const area = normalizeArea(free.area);
    stats.freeByArea[area] = (stats.freeByArea[area] ?? 0) + 1;
    if (fromResale) stats.freeFromResaleByArea[area] = (stats.freeFromResaleByArea[area] ?? 0) + 1;

    // Wie biedt deze stoel aan? Eerst op eigenaar uit Ringside, en als die
    // ontbreekt op het relatienummer dat volgens de lijst op deze stoel zit.
    const sellers = new Set(here.map((ticket) => ticket.owner).filter((owner): owner is string => Boolean(owner)));
    const sellerRelation = fromResale ? holderByKey.get(freeKey)?.relationNumber : undefined;

    for (const key of neighborKeys(free)) {
      const holder = holderByKey.get(key);
      if (!holder || tooMany.has(holder.relationNumber)) continue;

      // Alleen wie er deze wedstrijd ook echt zit: een geldig ticket dat niet
      // zelf in de resale staat.
      const attending = (ticketsByKey.get(key) ?? []).filter((ticket) => !ticket.resalePosted);
      if (attending.length === 0) continue;

      if (fromResale) {
        const sameOwner =
          sellers.size > 0
            ? attending.some((ticket) => ticket.owner !== null && sellers.has(ticket.owner))
            : sellerRelation === holder.relationNumber;
        if (sameOwner) {
          stats.skippedOwnResale++;
          continue;
        }
      }

      let seatsOfRelation = found.get(holder.relationNumber);
      if (!seatsOfRelation) {
        seatsOfRelation = new Map();
        found.set(holder.relationNumber, seatsOfRelation);
      }
      seatsOfRelation.set(key, { area: normalizeArea(holder.area), row: holder.row, seat: holder.seat });
    }
  }

  const rows: NeighborRow[] = [...found]
    .map(([relationNumber, seatsOfRelation]) => ({
      relationNumber,
      seats: [...seatsOfRelation.values()].sort(compareSeats),
    }))
    .sort((a, b) => compareSeats(a.seats[0], b.seats[0]) || a.relationNumber.localeCompare(b.relationNumber));

  for (const row of rows) {
    for (const seat of row.seats) {
      stats.listedSeatsByArea[seat.area] = (stats.listedSeatsByArea[seat.area] ?? 0) + 1;
    }
  }

  const groups = countFreeGroups(freeSeats);
  stats.freeGroups = groups.total;
  stats.freeGroupsByArea = groups.byArea;

  return { rows, stats };
}

/**
 * Zet de uitkomst om naar CSV voor Excel.
 *
 * Puntkomma als scheidingsteken, want dat verwacht Excel met Nederlandse
 * instellingen. Heeft één relatienummer meerdere stoelen naast een vrije plek,
 * dan blijft het één regel en staan de waarden met een komma achter elkaar.
 * De BOM zorgt dat Excel het bestand als UTF-8 opent.
 */
export function toCsv(rows: readonly NeighborRow[], includeSeatColumns: boolean): string {
  const header = includeSeatColumns ? ["relatienummer", "vak", "rij", "stoel"] : ["relatienummer"];
  const lines = rows.map((row) => {
    const cells = [row.relationNumber];
    if (includeSeatColumns) {
      cells.push(
        row.seats.map((seat) => seat.area).join(", "),
        row.seats.map((seat) => seat.row).join(", "),
        row.seats.map((seat) => seat.seat).join(", ")
      );
    }
    return cells.join(";");
  });
  return `﻿${[header.join(";"), ...lines].join("\r\n")}\r\n`;
}
