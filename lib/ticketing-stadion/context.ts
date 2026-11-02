/**
 * De data van Ticketing Stadion als tekst voor de chat: precies wat op de
 * pagina staat, zodat de antwoorden daarop aansluiten. Puur, zodat het te
 * testen is.
 *
 * De vrije stoelen gaan mee als groepjes per rij (vak, rij, van–tot), zodat
 * vragen als "hoeveel plekken voor twee naast elkaar zijn er nog?" exact te
 * beantwoorden zijn, ook per vak of rij.
 */

import { SEAT_CODE, type SeatMaps } from "../aangrenzende-stoelen/seat-map";
import type { Occupancy } from "../ticketing-herdgang/occupancy";
import type { StadionMatchData, StadionOverview } from "./load";
import { soldBy } from "./summary";

/** Een rij vrije stoelen naast elkaar: opeenvolgende nummers, geen trap ertussen. */
export interface FreeRun {
  area: string;
  row: number;
  from: number;
  to: number;
  size: number;
}

export function freeRuns(maps: SeatMaps): FreeRun[] {
  const runs: FreeRun[] = [];
  for (const [area, rows] of Object.entries(maps)) {
    for (const [row, firstSeat, codes] of rows) {
      let start = -1;
      for (let i = 0; i <= codes.length; i++) {
        const free = i < codes.length && (codes[i] === SEAT_CODE.vrij || codes[i] === SEAT_CODE.resale);
        if (free && start < 0) start = i;
        if (!free && start >= 0) {
          runs.push({ area, row, from: firstSeat + start, to: firstSeat + i - 1, size: i - start });
          start = -1;
        }
      }
    }
  }
  return runs;
}

const nl = new Intl.NumberFormat("nl-NL");
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");

function occupancyLine(o: Occupancy): string {
  return `capaciteit ${nl.format(o.capacity)}, verkocht ${nl.format(o.sold)} (${pct(o.sold, o.capacity)}), gereserveerd ${nl.format(o.reserved)}, in de resale ${nl.format(o.resale)}, vrij ${nl.format(o.free)}`;
}

/** Bereikt `n` plekken voor `groupSize` mensen naast elkaar in een groepje van `size`? */
function seatingsFor(size: number, groupSize: number): number {
  return Math.floor(size / groupSize);
}

export function matchContext(
  data: StadionMatchData,
  compared: { name: string; season: string; eventDate: string; perOffset: Record<string, number>; total: number }[]
): string {
  const { match, pace, comparison } = data;
  const runs = freeRuns(data.seatMaps);
  const lines: string[] = [];

  lines.push(`WEDSTRIJD: ${match.name ?? "onbekend"}, ${match.eventDate ?? "datum onbekend"} (${match.daysOut} dagen tot de aftrap)`);
  lines.push(`Totaal (vakken op de plattegrond): ${occupancyLine(match.total)}`);
  if (match.otherTotal.sold + match.otherTotal.reserved > 0) {
    lines.push(`Niet meegeteld (parkeren en vakken buiten de plattegrond): ${nl.format(match.otherTotal.sold)} verkocht, ${nl.format(match.otherTotal.reserved)} gereserveerd`);
  }
  if (pace) {
    lines.push(`Verkooptempo: vandaag ${nl.format(pace.today)}, laatste 7 dagen ${nl.format(pace.last7Days)}, totaal tot nu volgens de verkoop per dag ${nl.format(pace.toDate)}`);
  }
  if (comparison.sameOpponent) {
    const r = comparison.sameOpponent;
    lines.push(`Vergelijking zelfde tegenstander: ${r.name} (${r.season}, ${r.eventDate}) had op ${match.daysOut} dagen voor de aftrap ${nl.format(r.soldBy)} verkocht, eindstand ${nl.format(r.total)}; deze wedstrijd nu ${nl.format(comparison.soldBy)}`);
  }
  if (comparison.previousSeason) {
    const r = comparison.previousSeason;
    lines.push(`Vergelijking gemiddelde ${r.season}: ${nl.format(r.soldBy)} verkocht op dit moment over ${r.matches} thuiswedstrijden, eindstand gemiddeld ${nl.format(r.total)}; deze wedstrijd nu ${nl.format(comparison.soldBy)}`);
  }

  const sizes = new Map<number, number>();
  for (const run of runs) sizes.set(run.size, (sizes.get(run.size) ?? 0) + 1);
  const pairs = runs.reduce((sum, run) => sum + seatingsFor(run.size, 2), 0);
  lines.push("");
  lines.push("VRIJE STOELEN NAAST ELKAAR (genummerde vakken; vrij of alleen in de resale)");
  lines.push(
    `Groepjes per grootte: ${[...sizes.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([size, count]) => `${count}× ${size}`)
      .join(", ") || "geen"}`
  );
  lines.push(`Groepjes van precies 2 ("tweetjes"): ${sizes.get(2) ?? 0}. Plekken voor 2 mensen naast elkaar als je grotere groepjes opsplitst: ${pairs}.`);

  lines.push("");
  lines.push("PER VAK: capaciteit | verkocht | gereserveerd | resale | vrij | bezetting | groepjes vrije stoelen (rij: stoelen)");
  const runsByArea = new Map<string, FreeRun[]>();
  for (const run of runs) runsByArea.set(run.area, [...(runsByArea.get(run.area) ?? []), run]);
  for (const area of match.areas) {
    const areaRuns = runsByArea.get(area.area) ?? [];
    const groups = areaRuns.length
      ? areaRuns.map((r) => (r.size === 1 ? `r${r.row}:${r.from}` : `r${r.row}:${r.from}-${r.to}`)).join(" ")
      : area.standing
        ? "staanvak"
        : "geen";
    lines.push(
      `${area.area} | ${area.capacity} | ${area.sold} | ${area.reserved} | ${area.resale} | ${area.free} | ${pct(area.sold, area.capacity)}${area.sellable === 0 && area.capacity > 0 ? " (niet te koop)" : ""} | ${groups}`
    );
  }

  if (data.sales && match.eventDate) {
    lines.push("");
    lines.push("VERKOOP PER DAG (dagen voor de aftrap: aantal; 0 = wedstrijddag)");
    lines.push(offsetLine(data.sales.perOffset));
  }
  for (const other of compared) {
    lines.push(`Ter vergelijking in de grafiek: ${other.name} (${other.season}, ${other.eventDate}), eindstand ${nl.format(other.total)}, op ${match.daysOut} dagen voor de aftrap ${nl.format(soldBy(other.perOffset, match.daysOut))}`);
    lines.push(offsetLine(other.perOffset));
  }

  lines.push("");
  lines.push(`Stand stoelstatus: ${data.seats.caughtUpAt ?? "onbekend"}; verkoop per dag: ${data.salesStatus.updatedAt ?? "onbekend"}.`);
  if (!data.seats.capacityComplete || !data.seats.reservationComplete) {
    lines.push("Let op: capaciteit en reserveringen worden nog aangevuld; cijfers kunnen afwijken.");
  }
  return lines.join("\n");
}

function offsetLine(perOffset: Record<string, number>): string {
  return Object.entries(perOffset)
    .map(([offset, count]) => [Number(offset), count] as const)
    .filter(([offset, count]) => Number.isFinite(offset) && count > 0)
    .sort((a, b) => b[0] - a[0])
    .map(([offset, count]) => `${offset}:${count}`)
    .join(" ");
}

export function overviewContext(overview: StadionOverview): string {
  const lines: string[] = ["KOMENDE THUISWEDSTRIJDEN VAN PSV IN HET PHILIPS STADION"];
  for (const m of overview.matches) {
    lines.push("");
    lines.push(`${m.name ?? "onbekend"}, ${m.eventDate ?? "datum onbekend"} (${m.daysOut} dagen tot de aftrap)`);
    lines.push(`  ${occupancyLine(m.total)}`);
    if (m.pace) lines.push(`  Verkocht vandaag ${m.pace.today}, laatste 7 dagen ${m.pace.last7Days}`);
    const { sameOpponent, previousSeason } = m.comparison;
    if (sameOpponent) {
      lines.push(`  Vorige keer tegen deze tegenstander (${sameOpponent.name}, ${sameOpponent.season}): ${sameOpponent.soldBy} op hetzelfde moment, eindstand ${sameOpponent.total}; nu ${m.comparison.soldBy}`);
    }
    if (previousSeason) {
      lines.push(`  Gemiddelde ${previousSeason.season}: ${previousSeason.soldBy} op hetzelfde moment, eindstand ${previousSeason.total}; nu ${m.comparison.soldBy}`);
    }
    const mostFree = [...m.areas].sort((a, b) => b.free - a.free).slice(0, 8);
    lines.push(`  Vakken met de meeste vrije plaatsen: ${mostFree.map((a) => `${a.area} ${a.free}`).join(", ") || "geen"}`);
  }
  lines.push("");
  lines.push(`Stand stoelstatus: ${overview.seats.caughtUpAt ?? "onbekend"}; verkoop per dag: ${overview.sales.updatedAt ?? "onbekend"}.`);
  return lines.join("\n");
}
