/**
 * Van de ingelezen tickets en scans naar wat het scherm afspeelt: per stoel of
 * er een kaart voor verkocht is en op welke seconde hij is gescand.
 *
 * Puur rekenwerk, zodat het te testen is. Waar de stoelenkaart en de data
 * vandaan komen, regelt `load.ts`.
 *
 * - **Stoel van een scan.** De scan zelf als die een plek draagt; anders het
 *   ticket waar hij naar verwijst. Welke koppeling werkte, staat in `joins`:
 *   zo is aan de echte data te zien of `primary_ticket_id` de sleutel is.
 * - **Tijdstip per stoel.** De vroegste geslaagde scan naar binnen. `first_scan`
 *   uit Ringside is daarvoor niet bruikbaar: een seizoenkaart staat op `False`.
 * - **Tijdlijn.** Van de eerste tot de laatste scan, maar niet verder dan zes uur
 *   voor en vier uur na de aftrap. Zonder die grens rekt één testscan van dagen
 *   eerder de hele tijdlijn op. Scans daarbuiten vallen op het begin of het eind.
 */

import { normalizeArea, seatKey } from "../aangrenzende-stoelen/neighbors";
import { SCAN_ENTRY, SCAN_OK, type InstroomData, type InstroomTicket } from "./state";
import { REPLAY_CODE, type Replay, type ReplayArea, type ReplayJoins, type ReplayTotals } from "./replay-types";

export { REPLAY_CODE };
export type { Replay, ReplayArea, ReplayJoins, ReplayRow, ReplayStanding, ReplayTotals } from "./replay-types";

export interface LayoutSeat {
  area: string;
  row: number;
  seat: number;
}

/** De stoelen van het stadion, uit de stoelenkaart van een komende thuiswedstrijd. */
export interface StadiumLayout {
  seats: LayoutSeat[];
  /** Staanvakken: de capaciteit per vak. */
  standing: Record<string, number>;
  /** De wedstrijd waarvan de stoelenkaart is; `null` als er geen was. */
  source: string | null;
}

export const EMPTY_LAYOUT: StadiumLayout = { seats: [], standing: {}, source: null };

const HOUR = 3600;
/** Hoe ver de tijdlijn voor en na de aftrap mag lopen. */
const BEFORE_KICKOFF = 6 * HOUR;
const AFTER_KICKOFF = 4 * HOUR;

/** `Vak A`, `a` en `A` zijn hetzelfde vak. */
export function replayArea(area: string): string {
  return normalizeArea(area).replace(/^VAK\s+/, "");
}

interface Slot {
  sold: boolean;
  /** Vroegste scan, in seconden sinds 1970; -1 als niet gescand. */
  at: number;
}

type Place = { area: string; key: string | null };

function placeOf(area: unknown, row: unknown, seat: unknown): Place | null {
  if (typeof area !== "string" || !replayArea(area)) return null;
  const name = replayArea(area);
  return { area: name, key: seatKey(name, row, seat) };
}

export interface ReplayInput {
  match: { productId: string; name: string; kickoffMs: number | null };
  layout: StadiumLayout;
  data: InstroomData | null;
  /** Welke vakken op de plattegrond staan. Zonder: alle vakken tellen mee. */
  isStand?: (area: string) => boolean;
}

export function buildReplay({ match, layout, data, isStand }: ReplayInput): Replay {
  const onMap = (area: string) => !isStand || isStand(area);

  // vak → rij → stoelnummer
  const seats = new Map<string, Map<number, Map<number, Slot>>>();
  const slotAt = (area: string, row: number, seat: number): Slot => {
    let rows = seats.get(area);
    if (!rows) seats.set(area, (rows = new Map()));
    let numbers = rows.get(row);
    if (!numbers) rows.set(row, (numbers = new Map()));
    let slot = numbers.get(seat);
    if (!slot) numbers.set(seat, (slot = { sold: false, at: -1 }));
    return slot;
  };
  const slotForKey = (key: string): Slot => {
    const [area, row, seat] = key.split("|");
    return slotAt(area, Number(row), Number(seat));
  };

  for (const seat of layout.seats) {
    const area = replayArea(seat.area);
    if (area && onMap(area)) slotAt(area, seat.row, seat.seat);
  }

  const standing = new Map<string, { capacity: number; sold: number; times: number[] }>();
  const standingAt = (area: string) => {
    let entry = standing.get(area);
    if (!entry) standing.set(area, (entry = { capacity: 0, sold: 0, times: [] }));
    return entry;
  };
  for (const [name, capacity] of Object.entries(layout.standing)) {
    const area = replayArea(name);
    if (area && onMap(area)) standingAt(area).capacity += capacity;
  }

  // Een ticket zonder rij en stoel hoort bij een staanvak, behalve in een vak
  // dat genummerde stoelen heeft: dan weten we de plek gewoon niet.
  const isStandingArea = (area: string) => standing.has(area) || !seats.has(area);

  /* ---------- Tickets ---------- */

  const byPrimary = new Map<string, InstroomTicket>();
  const byItem = new Map<string, InstroomTicket>();
  const bySale = new Map<string, InstroomTicket>();
  // Meerdere regels kunnen hetzelfde id dragen (een eerdere versie, een retour);
  // de geldige gaat voor.
  const remember = (map: Map<string, InstroomTicket>, id: string, ticket: InstroomTicket) => {
    if (!id) return;
    const existing = map.get(id);
    if (!existing || (ticket[3] === 1 && existing[3] !== 1)) map.set(id, ticket);
  };

  // Eerst de tickets met een stoel, dan pas die zonder: of een vak een staanvak
  // is, hangt af van welke stoelen er bekend zijn.
  const withoutSeat: string[] = [];
  for (const [key, ticket] of Object.entries(data?.tickets ?? {})) {
    remember(bySale, key, ticket);
    remember(byPrimary, ticket[4], ticket);
    remember(byItem, ticket[5], ticket);
    if (ticket[3] !== 1) continue;
    const place = placeOf(ticket[0], ticket[1], ticket[2]);
    if (!place || !onMap(place.area)) continue;
    if (place.key) slotForKey(place.key).sold = true;
    else withoutSeat.push(place.area);
  }
  for (const area of withoutSeat) if (isStandingArea(area)) standingAt(area).sold++;

  /* ---------- Scans ---------- */

  const joins: ReplayJoins = { onScan: 0, primaryTicket: 0, productItem: 0, salesItem: 0, scannedItem: 0, none: 0 };
  const ticketPlace = (ticket: InstroomTicket | undefined) => (ticket ? placeOf(ticket[0], ticket[1], ticket[2]) : null);
  const findPlace = (scan: InstroomData["scans"][string]): Place | null => {
    const candidates: [keyof ReplayJoins, Place | null][] = [
      ["onScan", scan[4] ? placeOf(scan[4], scan[5], scan[6]) : null],
      ["primaryTicket", ticketPlace(byPrimary.get(scan[2]))],
      ["productItem", ticketPlace(byItem.get(scan[2]))],
      ["salesItem", ticketPlace(bySale.get(scan[2]))],
      ["scannedItem", ticketPlace(byPrimary.get(scan[3]) ?? byItem.get(scan[3]) ?? bySale.get(scan[3]))],
    ];
    for (const [join, place] of candidates) {
      if (!place) continue;
      joins[join]++;
      return place;
    }
    joins.none++;
    return null;
  };

  // Per ticket de vroegste geslaagde scan naar binnen.
  const firstEntry = new Map<string, InstroomData["scans"][string]>();
  let failedScans = 0;
  for (const [key, scan] of Object.entries(data?.scans ?? {})) {
    if (!(scan[1] & SCAN_OK)) {
      failedScans++;
      continue;
    }
    if (!(scan[1] & SCAN_ENTRY)) continue;
    const ticket = scan[2] || scan[3] || key;
    const earlier = firstEntry.get(ticket);
    if (!earlier || scan[0] < earlier[0]) firstEntry.set(ticket, scan);
  }

  let unplaced = 0;
  let elsewhere = 0;
  const standingScans = new Map<string, number[]>();
  const allTimes: number[] = [];
  for (const scan of firstEntry.values()) {
    allTimes.push(scan[0]);
    const place = findPlace(scan);
    if (!place) {
      unplaced++;
    } else if (!onMap(place.area)) {
      elsewhere++;
    } else if (place.key) {
      const slot = slotForKey(place.key);
      if (slot.at < 0 || scan[0] < slot.at) slot.at = scan[0];
    } else if (isStandingArea(place.area)) {
      const list = standingScans.get(place.area);
      if (list) list.push(scan[0]);
      else standingScans.set(place.area, [scan[0]]);
    } else {
      unplaced++;
    }
  }

  /* ---------- Tijdlijn ---------- */

  const kickoff = match.kickoffMs === null ? null : Math.round(match.kickoffMs / 1000);
  let start = kickoff ?? 0;
  let end = start;
  if (allTimes.length) {
    const first = allTimes.reduce((a, b) => Math.min(a, b));
    const last = allTimes.reduce((a, b) => Math.max(a, b));
    start = kickoff === null ? first : Math.max(first, kickoff - BEFORE_KICKOFF);
    end = kickoff === null ? last : Math.min(last, kickoff + AFTER_KICKOFF);
    // Alle scans buiten het venster rond de aftrap: dan zegt de aftrap niets.
    if (start > end) [start, end] = [first, last];
  }
  const duration = end - start;
  const offset = (at: number) => Math.min(Math.max(at - start, 0), duration);

  /* ---------- Uitvoer ---------- */

  const totals: ReplayTotals = {
    capacity: 0,
    sold: 0,
    entered: 0,
    scannedTickets: firstEntry.size,
    unplaced,
    elsewhere,
    failedScans,
  };

  const names = new Set([...seats.keys(), ...standing.keys(), ...standingScans.keys()]);
  const areas: ReplayArea[] = [];
  for (const name of [...names].sort((a, b) => a.localeCompare(b, "nl", { numeric: true }))) {
    const area: ReplayArea = { area: name, rows: [] };

    for (const [row, numbers] of [...(seats.get(name) ?? [])].sort((a, b) => a[0] - b[0])) {
      const present = [...numbers.keys()];
      const first = Math.min(...present);
      const last = Math.max(...present);
      let codes = "";
      const times: number[] = [];
      for (let seat = first; seat <= last; seat++) {
        const slot = numbers.get(seat);
        const scanned = slot !== undefined && slot.at >= 0;
        // Een gescande stoel had een kaart, ook als de verkoopregel ontbreekt.
        codes += !slot ? REPLAY_CODE.none : slot.sold || scanned ? REPLAY_CODE.sold : REPLAY_CODE.seat;
        times.push(scanned ? offset(slot.at) : -1);
        if (slot) totals.capacity++;
        if (slot && (slot.sold || scanned)) totals.sold++;
        if (scanned) totals.entered++;
      }
      area.rows.push([row, first, codes, times]);
    }

    const scans = standingScans.get(name) ?? [];
    const entry = standing.get(name);
    if (entry || scans.length) {
      const sold = Math.max(entry?.sold ?? 0, scans.length);
      area.standing = {
        capacity: Math.max(entry?.capacity ?? 0, sold),
        sold,
        times: scans.map(offset).sort((a, b) => a - b),
      };
      totals.capacity += area.standing.capacity;
      totals.sold += sold;
      totals.entered += scans.length;
    }

    areas.push(area);
  }

  return {
    match: {
      productId: match.productId,
      name: match.name,
      kickoff: match.kickoffMs === null ? null : new Date(match.kickoffMs).toISOString(),
    },
    start: new Date(start * 1000).toISOString(),
    duration,
    areas,
    totals,
    joins,
    layoutSource: layout.source,
  };
}

/* ---------- Aftrap ---------- */

const AMSTERDAM_OFFSET = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Amsterdam", timeZoneName: "longOffset" });

/** Hoeveel milliseconden Nederland op dat moment voorloopt op UTC. */
function amsterdamOffsetMs(instant: number): number {
  const name = AMSTERDAM_OFFSET.formatToParts(new Date(instant)).find((part) => part.type === "timeZoneName")?.value ?? "";
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) return 0;
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000;
}

/**
 * De aftrap als tijdstip. De stoelstatus bewaart hem met de offset erbij
 * (`2026-11-28T18:45:00+01:00`); de productenlijst als Nederlandse tijd zonder
 * offset (`2026-10-31 20:00:00`). Geeft `null` als er geen tijd in staat.
 */
export function eventDateToMs(value: string | null | undefined): number | null {
  const raw = (value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(raw);
  if (!match) return null;
  if (match[7]) {
    const ms = new Date(raw.replace(" ", "T")).getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  const asUtc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] ?? 0)
  );
  // Twee keer: rond het verzetten van de klok hoort de offset bij het
  // uiteindelijke tijdstip, niet bij de eerste gok.
  const guess = asUtc - amsterdamOffsetMs(asUtc);
  return asUtc - amsterdamOffsetMs(guess);
}
