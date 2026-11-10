/**
 * Een voorbeeld met nagebootste scans, voor zolang de echte wedstrijd nog niet
 * is ingelezen. De stoelen zijn een raster dat in de vakken van de plattegrond
 * past, niet de echte stoelenkaart; de aankomsttijden zijn verzonnen. Het
 * scherm zet er daarom altijd "voorbeeld" bij.
 *
 * Het voorbeeld gaat door dezelfde `buildReplay()` als de echte data, zodat het
 * scherm in beide gevallen precies hetzelfde doet.
 */

import { STADIUM_AREAS } from "../aangrenzende-stoelen/stadium";
import { isStadiumStand } from "../ticketing-stadion/summary";
import { areaFrame, insideRun } from "./geometry";
import { buildReplay, type LayoutSeat, type Replay, type StadiumLayout } from "./replay";
import { SCAN_ENTRY, SCAN_OK, type InstroomData } from "./state";

/** Ruimte per stoel in eenheden van de plattegrond; samen ruim 35.000 plaatsen. */
const SEAT_WIDTH = 3.6;
const ROW_DEPTH = 4.6;
/** Oppervlak per staanplaats. */
const STANDING_SPACE = 14;

/** Een vaste reeks willekeurige getallen, zodat het voorbeeld elke keer hetzelfde is. */
function generator(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoLayout(): StadiumLayout {
  const seats: LayoutSeat[] = [];
  const standing: Record<string, number> = {};

  for (const area of STADIUM_AREAS) {
    const frame = areaFrame(area);
    const run = insideRun(frame, 0.5) ?? [0, 1];
    const length = (run[1] - run[0]) * frame.lengthAt(0.5);

    if (area.excluded === "staanvak") {
      standing[area.area] = Math.round((frame.depth * length) / STANDING_SPACE);
      continue;
    }

    // Een rolstoelvak heeft weinig, brede plaatsen.
    const wheelchair = area.excluded === "rolstoelvak";
    const rows = wheelchair ? 2 : Math.max(Math.round(frame.depth / ROW_DEPTH), 2);
    const perRow = Math.max(Math.round(length / (wheelchair ? SEAT_WIDTH * 3 : SEAT_WIDTH)), 2);
    // In een breed vak zit halverwege een trap: daar slaan de nummers er twee over.
    const stairs = perRow > 28 ? Math.round(perRow / 2) : -1;
    for (let row = 1; row <= rows; row++) {
      for (let seat = 1; seat <= perRow; seat++) {
        if (seat === stairs || seat === stairs + 1) continue;
        seats.push({ area: area.area, row, seat });
      }
    }
  }

  return { seats, standing, source: null };
}

/** Vakken waar het publiek gemiddeld eerder of later binnen is. */
const EARLY_AREAS = new Set(["V", "W", "X", "Y", "U", "MM", "UU"]);
const LATE_AREAS = new Set(["*N", "*Z"]);

export function demoData(layout: StadiumLayout, kickoffMs: number): InstroomData {
  const random = generator(20261031);
  const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  const kickoff = Math.round(kickoffMs / 1000);

  /** Een aankomsttijd: de meeste mensen een half uur voor de aftrap, een enkeling erna. */
  const arrival = (area: string): number => {
    if (random() < 0.04) return kickoff + Math.round(random() * 18 * 60);
    const shift = EARLY_AREAS.has(area) ? 1.5 : LATE_AREAS.has(area) ? 0.7 : 1;
    // Heel vroege komers verspreid over het eerste kwartier, niet allemaal op dezelfde seconde.
    const drawn = Math.exp(Math.log(32 * shift) + 0.55 * normal());
    const minutes = drawn > 165 ? 165 + random() * 15 : drawn;
    return kickoff - Math.round(minutes * 60);
  };

  const data: InstroomData = { productId: "demo", tickets: {}, scans: {} };
  let ticket = 0;
  const sell = (area: string, row: string, seat: string, at: number | null) => {
    const id = ticket++;
    data.tickets[`t${id}`] = [area, row, seat, 1, `p${id}`, `i${id}`];
    if (at === null) return;
    // Af en toe gaat een scan eerst mis en lukt hij daarna.
    if (random() < 0.03) data.scans[`f${id}`] = [at - 8, SCAN_ENTRY, `p${id}`, `c${id}`];
    data.scans[`s${id}`] = [at, SCAN_OK | SCAN_ENTRY, `p${id}`, `c${id}`];
  };

  // Wie naast elkaar zit, komt meestal samen binnen: groepjes van één tot vier.
  let groupLeft = 0;
  let groupAt = 0;
  let groupArea = "";
  let groupRow = -1;
  for (const { area, row, seat } of layout.seats) {
    const soldShare = area.length === 2 ? 0.88 : 0.95;
    if (random() > soldShare) {
      groupLeft = 0;
      continue;
    }
    if (groupLeft <= 0 || area !== groupArea || row !== groupRow) {
      groupLeft = 1 + Math.floor(random() * 4);
      groupAt = arrival(area);
      groupArea = area;
      groupRow = row;
    }
    groupLeft--;
    const present = random() < 0.9;
    sell(area, String(row), String(seat), present ? groupAt + Math.round(random() * 25) : null);
  }

  for (const [area, capacity] of Object.entries(layout.standing)) {
    for (let i = 0; i < Math.round(capacity * 0.96); i++) sell(area, "", "", random() < 0.93 ? arrival(area) : null);
  }

  return data;
}

/** Zaterdag 31 oktober 2026, 20:00 uur Nederlandse tijd. */
const DEMO_KICKOFF_MS = Date.UTC(2026, 9, 31, 19, 0, 0);

export function buildDemoReplay(): Replay {
  const layout = demoLayout();
  const replay = buildReplay({
    match: { productId: "demo", name: "Voorbeeld met nagebootste scans", kickoffMs: DEMO_KICKOFF_MS },
    layout,
    data: demoData(layout, DEMO_KICKOFF_MS),
    isStand: isStadiumStand,
  });
  return { ...replay, demo: true };
}
