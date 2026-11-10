/**
 * Waar elke stoel op de plattegrond van het Philips Stadion komt.
 *
 * Ringside kent alleen vak, rij en stoelnummer, niet de echte plek van een
 * stoel. De plattegrond (`lib/aangrenzende-stoelen/stadium.ts`) kent per vak
 * alleen de vorm. Hier leggen we de rijen en stoelnummers als raster in die
 * vorm: een schema, net als de vakweergave, geen bouwtekening.
 *
 * - **Rijen:** rij 1 aan het veld, oplopend naar buiten. Een ontbrekend
 *   rijnummer blijft een lege rij.
 * - **Stoelen:** het hoogste stoelnummer links als je naar het veld kijkt, zoals
 *   in de ticketshop. Rond het stadion gezien lopen de nummers dus met de klok
 *   mee op. Een stoelnummer dat in het hele vak ontbreekt (een trap) blijft open.
 * - **Tribunes** aan de lange en korte zijden zijn een recht raster. In de vier
 *   hoeken volgen de rijen de bocht, rond het draaipunt van die hoek.
 *
 * Puur rekenwerk zonder browser of Node, zodat het in de browser draait en te
 * testen is.
 */

import type { StadiumArea } from "../aangrenzende-stoelen/stadium";

export type Point = [x: number, y: number];

/* ---------- Vorm van een vak ---------- */

const ARC_STEP = (4 * Math.PI) / 180;

/** Een cirkel- of ellipsboog als punten, volgens de omrekening uit de SVG-specificatie. */
function arcPoints(from: Point, rx: number, ry: number, rotation: number, largeArc: boolean, sweep: boolean, to: Point): Point[] {
  if (rx === 0 || ry === 0 || (from[0] === to[0] && from[1] === to[1])) return [to];
  const phi = (rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from[0] - to[0]) / 2;
  const dy = (from[1] - to[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;

  let a = Math.abs(rx);
  let b = Math.abs(ry);
  // Te kleine stralen rekt de specificatie op tot de boog net past.
  const scale = (x1 * x1) / (a * a) + (y1 * y1) / (b * b);
  if (scale > 1) {
    a *= Math.sqrt(scale);
    b *= Math.sqrt(scale);
  }

  const numerator = a * a * b * b - a * a * y1 * y1 - b * b * x1 * x1;
  const factor = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(numerator, 0) / (a * a * y1 * y1 + b * b * x1 * x1));
  const cx1 = (factor * a * y1) / b;
  const cy1 = (-factor * b * x1) / a;
  const cx = cos * cx1 - sin * cy1 + (from[0] + to[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (from[1] + to[1]) / 2;

  const start = Math.atan2((y1 - cy1) / b, (x1 - cx1) / a);
  let delta = Math.atan2((-y1 - cy1) / b, (-x1 - cx1) / a) - start;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  if (!sweep && delta > 0) delta -= 2 * Math.PI;

  const steps = Math.max(Math.ceil(Math.abs(delta) / ARC_STEP), 1);
  const points: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    const angle = start + (delta * i) / steps;
    const x = a * Math.cos(angle);
    const y = b * Math.sin(angle);
    points.push([cos * x - sin * y + cx, sin * x + cos * y + cy]);
  }
  points[points.length - 1] = to;
  return points;
}

/**
 * Een SVG-pad als veelhoek. Kent de opdrachten die de plattegrond gebruikt:
 * `M`, `L`, `H`, `V`, `A` en `Z`, allemaal met absolute coördinaten.
 */
export function pathToPolygon(d: string): Point[] {
  const tokens = d.match(/[MLHVAZ]|-?\d*\.?\d+/gi) ?? [];
  const points: Point[] = [];
  let current: Point = [0, 0];
  let i = 0;
  const number = () => Number(tokens[i++]);

  while (i < tokens.length) {
    const command = tokens[i++].toUpperCase();
    if (command === "M" || command === "L") current = [number(), number()];
    else if (command === "H") current = [number(), current[1]];
    else if (command === "V") current = [current[0], number()];
    else if (command === "A") {
      const rx = number();
      const ry = number();
      const rotation = number();
      const largeArc = number() === 1;
      const sweep = number() === 1;
      const to: Point = [number(), number()];
      const arc = arcPoints(current, rx, ry, rotation, largeArc, sweep, to);
      points.push(...arc.slice(0, -1));
      current = to;
    } else if (command === "Z") continue;
    else throw new Error(`Onbekende padopdracht: ${command}`);
    points.push(current);
  }
  return points;
}

export function areaPolygon(area: StadiumArea): Point[] {
  if (area.rect) {
    const [x, y, w, h] = area.rect;
    return [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
  }
  return area.path ? pathToPolygon(area.path) : [];
}

/** Ligt het punt in de veelhoek? Even-oneven, met een straal naar rechts. */
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* ---------- Waar een vak ligt ---------- */

export type Side = "N" | "E" | "S" | "W" | "NW" | "NE" | "SE" | "SW";

/** Het midden van het veld op de plattegrond. */
const CENTER: Point = [998, 737];
/** Tussen deze grenzen ligt een vak recht boven of onder, of recht naast het veld. */
const STAND_X: [number, number] = [520, 1480];
const STAND_Y: [number, number] = [492, 983];

/** De draaipunten van de vier hoeken: de middelpunten van de buitenbochten. */
const PIVOTS: Record<"NW" | "NE" | "SE" | "SW", Point> = {
  NW: [607, 505],
  NE: [1390, 505],
  SE: [1390, 997],
  SW: [607, 997],
};

/** De hoek waar een bocht begint, met de klok mee gemeten vanaf rechts (y loopt naar beneden). */
const SECTOR_START: Record<"NW" | "NE" | "SE" | "SW", number> = {
  SE: 0,
  SW: Math.PI / 2,
  NW: Math.PI,
  NE: 1.5 * Math.PI,
};

function bounds(polygon: readonly Point[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of polygon) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
}

/** Aan welke kant van het veld een vak ligt, op het midden van zijn omhullende. */
export function sideOf(polygon: readonly Point[]): Side {
  const { x0, y0, x1, y1 } = bounds(polygon);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const inX = cx >= STAND_X[0] && cx <= STAND_X[1];
  const inY = cy >= STAND_Y[0] && cy <= STAND_Y[1];
  if (inX && cy < STAND_Y[0]) return "N";
  if (inX && cy > STAND_Y[1]) return "S";
  if (inX || inY) return cx < CENTER[0] ? "W" : "E";
  return `${cy < CENTER[1] ? "N" : "S"}${cx < CENTER[0] ? "W" : "E"}` as Side;
}

/* ---------- Raster in een vak ---------- */

/**
 * Het assenstelsel van een vak: `u` loopt langs de rij (met de klok mee rond het
 * stadion, 0 tot 1), `v` van het veld naar buiten (0 tot 1).
 */
export interface AreaFrame {
  side: Side;
  polygon: Point[];
  pointAt(u: number, v: number): Point;
  /** Diepte van het vak in eenheden van de plattegrond. */
  depth: number;
  /** Lengte van een hele rij (`u` van 0 tot 1) op diepte `v`. */
  lengthAt(v: number): number;
  /** Rechthoek recht aan het veld: elke rij loopt van 0 tot 1. */
  full: boolean;
}

/** Binnen dit deel van de buitenstraal ligt de binnenrand van een hoekvak. */
const INNER_SHARE = 0.85;

export function areaFrame(area: StadiumArea): AreaFrame {
  const polygon = areaPolygon(area);
  const side = sideOf(polygon);

  if (side.length === 2) {
    const corner = side as "NW" | "NE" | "SE" | "SW";
    const pivot = PIVOTS[corner];
    const radii = polygon.map(([x, y]) => Math.hypot(x - pivot[0], y - pivot[1]));
    const outer = Math.max(...radii);
    // De binnenrand is een afgeschuinde hoek, geen bocht: de rijen beginnen
    // waar die rand het verst van het draaipunt ligt, zodat ze er niet doorheen lopen.
    const inner = Math.max(...radii.filter((radius) => radius < outer * INNER_SHARE), 0) || outer * 0.6;
    const start = SECTOR_START[corner];
    const radiusAt = (v: number) => inner + v * (outer - inner);
    return {
      side,
      polygon,
      pointAt: (u, v) => {
        const angle = start + (u * Math.PI) / 2;
        const radius = radiusAt(v);
        return [pivot[0] + radius * Math.cos(angle), pivot[1] + radius * Math.sin(angle)];
      },
      depth: outer - inner,
      lengthAt: (v) => (radiusAt(v) * Math.PI) / 2,
      full: false,
    };
  }

  const { x0, y0, x1, y1 } = bounds(polygon);
  const w = x1 - x0;
  const h = y1 - y0;
  const horizontal = side === "N" || side === "S";
  return {
    side,
    polygon,
    pointAt: (u, v) => {
      if (side === "N") return [x0 + u * w, y1 - v * h];
      if (side === "S") return [x1 - u * w, y0 + v * h];
      if (side === "E") return [x0 + v * w, y0 + u * h];
      return [x1 - v * w, y1 - u * h];
    },
    depth: horizontal ? h : w,
    lengthAt: () => (horizontal ? w : h),
    full: Boolean(area.rect),
  };
}

const RUN_STEPS = 240;

/**
 * Het stuk van een rij dat binnen het vak valt, als `[u0, u1]`: het langste
 * aaneengesloten stuk. `null` als de rij het vak niet raakt.
 */
export function insideRun(frame: AreaFrame, v: number): [number, number] | null {
  if (frame.full) return [0, 1];
  let best: [number, number] | null = null;
  let from = -1;
  for (let i = 0; i <= RUN_STEPS; i++) {
    const inside = i < RUN_STEPS && pointInPolygon(frame.pointAt((i + 0.5) / RUN_STEPS, v), frame.polygon);
    if (inside && from < 0) from = i;
    if (!inside && from >= 0) {
      if (!best || i - from > (best[1] - best[0]) * RUN_STEPS) best = [from / RUN_STEPS, i / RUN_STEPS];
      from = -1;
    }
  }
  return best;
}

export interface PlacedSeats {
  /** Per stoel het midden, in de volgorde van de rijen en daarbinnen de stoelnummers. */
  x: Float32Array;
  y: Float32Array;
  /** Zijde van één stoel, in eenheden van de plattegrond. */
  size: number;
}

/** Het deel van de ruimte per stoel dat de stoel zelf vult; de rest is tussenruimte. */
const SEAT_FILL = 0.72;

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** De rij op diepte `v`, of de dichtstbijzijnde rij die wél in het vak valt. */
function runNear(frame: AreaFrame, v: number): [number, number] {
  for (const shift of [0, 0.03, -0.03, 0.08, -0.08, 0.15, -0.15, 0.3, -0.3]) {
    const run = insideRun(frame, Math.min(Math.max(v + shift, 0.01), 0.99));
    if (run) return run;
  }
  return [0, 1];
}

/** Een rij uit de stoelenkaart: het rijnummer en de stoelnummers die bestaan. */
export interface SeatRowInput {
  row: number;
  seats: number[];
}

/** Legt de stoelen van een vak in zijn vorm. */
export function placeSeats(area: StadiumArea, rows: readonly SeatRowInput[]): PlacedSeats {
  const count = rows.reduce((sum, row) => sum + row.seats.length, 0);
  const placed: PlacedSeats = { x: new Float32Array(count), y: new Float32Array(count), size: 0 };
  if (!count) return placed;

  const frame = areaFrame(area);
  let minRow = Infinity;
  let maxRow = -Infinity;
  let minSeat = Infinity;
  let maxSeat = -Infinity;
  for (const { row, seats } of rows) {
    if (!seats.length) continue;
    minRow = Math.min(minRow, row);
    maxRow = Math.max(maxRow, row);
    for (const seat of seats) {
      minSeat = Math.min(minSeat, seat);
      maxSeat = Math.max(maxSeat, seat);
    }
  }
  const rowSpan = maxRow - minRow + 1;
  const seatSpan = maxSeat - minSeat + 1;

  const widths: number[] = [];
  let index = 0;
  for (const { row, seats } of rows) {
    if (!seats.length) continue;
    const v = (row - minRow + 0.5) / rowSpan;
    const [u0, u1] = runNear(frame, v);
    widths.push(((u1 - u0) * frame.lengthAt(v)) / seatSpan);
    for (const seat of seats) {
      const [x, y] = frame.pointAt(u0 + ((seat - minSeat + 0.5) / seatSpan) * (u1 - u0), v);
      placed.x[index] = x;
      placed.y[index] = y;
      index++;
    }
  }

  placed.size = SEAT_FILL * Math.min(frame.depth / rowSpan, median(widths));
  return placed;
}

/**
 * Plekken voor een staanvak: geen echte plaatsen, maar evenveel punten als de
 * capaciteit, gelijkmatig over het vak.
 */
export function placeStanding(area: StadiumArea, capacity: number): PlacedSeats {
  const placed: PlacedSeats = { x: new Float32Array(capacity), y: new Float32Array(capacity), size: 0 };
  if (capacity <= 0) return placed;

  const frame = areaFrame(area);
  const rowLength = (v: number, run: [number, number]) => (run[1] - run[0]) * frame.lengthAt(v);
  const middle = runNear(frame, 0.5);
  // Vierkante cellen: zoveel rijen dat een plek even breed als diep is.
  const cell = Math.sqrt((frame.depth * rowLength(0.5, middle)) / capacity);
  const rowCount = Math.max(Math.round(frame.depth / cell), 1);

  const runs: { v: number; run: [number, number]; length: number }[] = [];
  let total = 0;
  for (let r = 0; r < rowCount; r++) {
    const v = (r + 0.5) / rowCount;
    const run = runNear(frame, v);
    const length = rowLength(v, run);
    runs.push({ v, run, length });
    total += length;
  }

  // Elke rij krijgt plekken naar zijn lengte; de laatste rij krijgt de rest.
  let index = 0;
  let passed = 0;
  for (const [r, { v, run, length }] of runs.entries()) {
    passed += length;
    const upTo = r === runs.length - 1 ? capacity : Math.round((passed / total) * capacity);
    const inRow = upTo - index;
    for (let s = 0; s < inRow; s++) {
      const [x, y] = frame.pointAt(run[0] + ((s + 0.5) / inRow) * (run[1] - run[0]), v);
      placed.x[index] = x;
      placed.y[index] = y;
      index++;
    }
  }

  placed.size = SEAT_FILL * Math.min(frame.depth / rowCount, cell);
  return placed;
}

/**
 * Een vaste, door elkaar gehusselde volgorde van `count` plekken. Een staanvak
 * loopt daardoor verspreid vol in plaats van rij voor rij, en elke keer hetzelfde.
 */
export function shuffledOrder(count: number, seed: string): Uint32Array {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = new Uint32Array(count);
  for (let i = 0; i < count; i++) order[i] = i;
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
