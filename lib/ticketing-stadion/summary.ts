/**
 * Ticketing Stadion: de cijfers per thuiswedstrijd van PSV 1 in het Philips
 * Stadion. Puur rekenwerk, zodat het te testen is.
 *
 * Twee bronnen, allebei al bijgehouden uit Ringside:
 *
 * - **De stoelstatus** (`lib/ringside/seat-state.ts`, cron elk kwartier): de
 *   actuele stand per stoel. Daaruit komt de bezetting per vak.
 * - **De verkoop per dag** (`lib/ringside/store.ts`, cron elk uur): per wedstrijd
 *   hoeveel tickets er op elke dag-tot-de-wedstrijd verkocht zijn, ook voor
 *   wedstrijden die al gespeeld zijn. Daaruit komen het tempo en de vergelijking.
 */

import { isPsvHomeMatch } from "../aangrenzende-stoelen/events";
import { normalizeArea, type SeatRef } from "../aangrenzende-stoelen/neighbors";
import { SEAT_CODE, type SeatMaps } from "../aangrenzende-stoelen/seat-map";
import { STADIUM_AREAS } from "../aangrenzende-stoelen/stadium";
import { seasonOf } from "../ringside/daily-sales";
import type { EventSeatState } from "../ringside/seat-state";
import type { EventSales, OffsetCounts } from "../ringside/store";
import { occupancyByArea, type AreaOccupancy, type Occupancy } from "../ticketing-herdgang/occupancy";

export { isPsvHomeMatch };

/* ---------- Bezetting ---------- */

const STANDS = new Set(STADIUM_AREAS.map((shape) => normalizeArea(shape.area)));

/** Een vak op de plattegrond van het Philips Stadion. Parkeren en de rest niet. */
export function isStadiumStand(area: string): boolean {
  return STANDS.has(normalizeArea(area));
}

/** De bezetting van één wedstrijd zoals de overzichtspagina hem nodig heeft. */
export interface StadionMatch {
  eventId: string;
  name: string | null;
  eventDate: string | null;
  /** Alleen de vakken op de plattegrond. */
  total: Occupancy;
  areas: AreaOccupancy[];
  /** Parkeren en andere vakken buiten de plattegrond: apart, niet in `total`. */
  otherTotal: Occupancy;
}

export function summarizeMatch(event: EventSeatState): StadionMatch {
  const { total, areas, otherTotal } = occupancyByArea(event, isStadiumStand);
  return { eventId: event.eventId, name: event.name, eventDate: event.eventDate, total, areas, otherTotal };
}

/* ---------- Data ---------- */

/** Dagnummer van een `YYYY-MM-DD` (of een datum met tijd erachter). */
function dayNumber(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return null;
  return Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000);
}

/**
 * Dagen van `today` tot de wedstrijddag: 0 is de wedstrijddag zelf. Dezelfde
 * conventie als de offsets in de verkoop per dag.
 */
export function daysUntil(eventDate: string | null, today: string): number | null {
  if (!eventDate) return null;
  const event = dayNumber(eventDate);
  const now = dayNumber(today);
  return event === null || now === null ? null : event - now;
}

/* ---------- Tempo ---------- */

export interface SalesPace {
  /** Verkocht op de dag van `daysOut` (vandaag). */
  today: number;
  /** Verkocht in de zeven dagen tot en met vandaag. */
  last7Days: number;
  /** Verkocht tot en met vandaag. */
  toDate: number;
}

/**
 * Verkoop tot `daysOut` dagen voor de wedstrijd. Offsets zijn "dagen vóór de
 * wedstrijd", dus alles met een offset van `daysOut` of hoger was er toen al.
 */
export function soldBy(perOffset: OffsetCounts, daysOut: number): number {
  let total = 0;
  for (const [key, count] of Object.entries(perOffset)) if (Number(key) >= daysOut) total += count;
  return total;
}

export function salesPace(perOffset: OffsetCounts, daysOut: number): SalesPace {
  let last7Days = 0;
  for (let offset = daysOut; offset < daysOut + 7; offset++) last7Days += perOffset[String(offset)] ?? 0;
  return { today: perOffset[String(daysOut)] ?? 0, last7Days, toDate: soldBy(perOffset, daysOut) };
}

/* ---------- Vergelijken ---------- */

/** Woorden die bij dezelfde club wel of niet in de naam staan: `AFC Ajax` en `Ajax`. */
const CLUB_AFFIXES = new Set(["fc", "afc", "sc", "sbv", "bv", "sv", "vv", "fk", "cf"]);

/**
 * De tegenstander uit een naam als `PSV - Ajax`, genormaliseerd zodat dezelfde
 * club over seizoenen heen herkend wordt. Leeg als de naam die vorm niet heeft.
 */
export function opponentOf(name: string | null | undefined): string {
  const match = /^\s*psv\s*[-–]\s*(.+)$/i.exec(name ?? "");
  if (!match) return "";
  return match[1]
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .split(/[|·]/)[0]
    .replace(/[^\p{L}\p{N}\s.'-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word && !CLUB_AFFIXES.has(word))
    .join(" ")
    .trim();
}

function sameOpponent(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `);
}

/** Een eerdere thuiswedstrijd om tegen af te zetten. */
export interface Reference {
  eventId: string;
  name: string;
  eventDate: string;
  season: string;
  /** Verkocht op hetzelfde aantal dagen voor de wedstrijd. */
  soldBy: number;
  /** Eindstand. */
  total: number;
}

/** Het gemiddelde van de thuiswedstrijden van een seizoen. */
export interface SeasonAverage {
  season: string;
  matches: number;
  soldBy: number;
  total: number;
}

export interface Comparison {
  /** Deze wedstrijd volgens de verkoop per dag, voor een eerlijke vergelijking. */
  soldBy: number;
  /** Dezelfde tegenstander, de laatste keer thuis. */
  sameOpponent: Reference | null;
  /** Het vorige seizoen, gemiddeld over alle thuiswedstrijden. */
  previousSeason: SeasonAverage | null;
}

export function isHomeMatchSales(sales: EventSales): boolean {
  return sales.category === "Wedstrijden" && isPsvHomeMatch(sales.name);
}

/** Het seizoen ervoor: `25/26` → `24/25`. */
export function previousSeasonOf(season: string): string {
  const match = /^(\d{2})\/(\d{2})$/.exec(season);
  if (!match) return "";
  const pad = (n: number) => String((n + 100) % 100).padStart(2, "0");
  return `${pad(Number(match[1]) - 1)}/${pad(Number(match[2]) - 1)}`;
}

/**
 * Zet een wedstrijd af tegen eerdere thuiswedstrijden, op hetzelfde aantal
 * dagen voor de aftrap. Alles uit dezelfde bron (de verkoop per dag), zodat
 * appels met appels vergeleken worden.
 */
export function compareMatch(
  match: { eventId: string; name: string | null; eventDate: string | null },
  daysOut: number,
  sales: Record<string, EventSales>
): Comparison {
  const own = sales[match.eventId];
  const ownDate = match.eventDate ?? own?.eventDate ?? "";
  const earlier = Object.values(sales).filter(
    (other) => other.productId !== match.eventId && isHomeMatchSales(other) && other.eventDate && other.eventDate < ownDate
  );

  const opponent = opponentOf(match.name ?? own?.name);
  const previous = earlier
    .filter((other) => sameOpponent(opponent, opponentOf(other.name)))
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate))[0];

  const season = own?.season || (ownDate ? seasonOf(ownDate) : "");
  const lastSeason = previousSeasonOf(season);
  const inLastSeason = earlier.filter((other) => other.season === lastSeason && other.total > 0);

  return {
    soldBy: own ? soldBy(own.perOffset, daysOut) : 0,
    sameOpponent: previous
      ? {
          eventId: previous.productId,
          name: previous.name,
          eventDate: previous.eventDate,
          season: previous.season,
          soldBy: soldBy(previous.perOffset, daysOut),
          total: previous.total,
        }
      : null,
    previousSeason: inLastSeason.length
      ? {
          season: lastSeason,
          matches: inLastSeason.length,
          soldBy: Math.round(
            inLastSeason.reduce((sum, other) => sum + soldBy(other.perOffset, daysOut), 0) / inLastSeason.length
          ),
          total: Math.round(inLastSeason.reduce((sum, other) => sum + other.total, 0) / inLastSeason.length),
        }
      : null,
  };
}

/* ---------- Wedstrijddetail ---------- */

/**
 * De vrije stoelen uit de stoelenkaart per vak (`buildSeatMaps()`): vrij, of
 * alleen bezet door een ticket dat in de resale staat. Voor de groepjes
 * vrije stoelen naast elkaar (`countFreeGroups()`).
 */
export function freeSeatsFromMaps(maps: SeatMaps): SeatRef[] {
  const free: SeatRef[] = [];
  for (const [area, rows] of Object.entries(maps)) {
    for (const [row, firstSeat, codes] of rows) {
      for (let i = 0; i < codes.length; i++) {
        if (codes[i] === SEAT_CODE.vrij || codes[i] === SEAT_CODE.resale) free.push({ area, row, seat: firstSeat + i });
      }
    }
  }
  return free;
}

/** Een eerdere thuiswedstrijd die je naast deze kunt leggen. */
export interface ComparableMatch {
  productId: string;
  name: string;
  eventDate: string;
  season: string;
  total: number;
}

/** Eerdere thuiswedstrijden van PSV 1 met verkoop, nieuwste eerst. */
export function comparableMatches(sales: Record<string, EventSales>, exceptId: string, before: string): ComparableMatch[] {
  return Object.values(sales)
    .filter(
      (other) =>
        other.productId !== exceptId &&
        isHomeMatchSales(other) &&
        other.total > 0 &&
        Boolean(other.eventDate) &&
        other.eventDate < before
    )
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate))
    .map(({ productId, name, eventDate, season, total }) => ({ productId, name, eventDate, season, total }));
}
