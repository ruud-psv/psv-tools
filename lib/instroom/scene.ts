/**
 * Van de afspeeldata naar wat het scherm tekent: per plek een punt op de
 * plattegrond, of er een kaart voor is, en op welke seconde hij oplicht.
 *
 * Alles in platte arrays: een stadion is ruim 35.000 plekken, en het scherm
 * loopt er bij elk beeld doorheen. Zonder browser, zodat het te testen is.
 */

import { normalizeArea } from "../aangrenzende-stoelen/neighbors";
import { STADIUM_AREAS, type StadiumArea } from "../aangrenzende-stoelen/stadium";
import { placeSeats, placeStanding, shuffledOrder, type PlacedSeats, type SeatRowInput } from "./geometry";
import { REPLAY_CODE, type ReplayArea } from "./replay-types";

export interface Scene {
  count: number;
  /** Het midden van elke plek, in eenheden van de plattegrond. */
  x: Float32Array;
  y: Float32Array;
  /** Zijde van de plek. */
  size: Float32Array;
  /** 1 als er een geldige kaart voor de plek is. */
  sold: Uint8Array;
  /** Seconde op de tijdlijn waarop de plek oplicht; -1 als hij niet gescand is. */
  time: Int32Array;
  /** De gescande plekken, oplopend op tijd. */
  order: Uint32Array;
  /** De tijden van `order`, om snel te vinden hoeveel er op een moment binnen zijn. */
  orderTimes: Int32Array;
  /** De vakken die getekend zijn. */
  shapes: StadiumArea[];
  /** Vakken uit de data die niet op de plattegrond staan. */
  missing: string[];
}

const SHAPES = new Map(STADIUM_AREAS.map((shape) => [normalizeArea(shape.area), shape]));

interface Chunk {
  placed: PlacedSeats;
  sold: number[];
  time: number[];
}

function seatedChunk(shape: StadiumArea, area: ReplayArea): Chunk {
  const rows: SeatRowInput[] = [];
  const sold: number[] = [];
  const time: number[] = [];
  for (const [row, first, codes, times] of area.rows) {
    const seats: number[] = [];
    for (let i = 0; i < codes.length; i++) {
      if (codes[i] === REPLAY_CODE.none) continue;
      seats.push(first + i);
      sold.push(codes[i] === REPLAY_CODE.sold ? 1 : 0);
      time.push(times[i] ?? -1);
    }
    rows.push({ row, seats });
  }
  return { placed: placeSeats(shape, rows), sold, time };
}

/**
 * Een staanvak heeft geen plaatsen: elke scan krijgt de volgende plek uit een
 * vaste, door elkaar gehusselde volgorde. Zo loopt het vak verspreid vol.
 */
function standingChunk(shape: StadiumArea, area: ReplayArea): Chunk {
  const { capacity, sold: soldCount, times } = area.standing!;
  const sold = new Array<number>(capacity).fill(0);
  const time = new Array<number>(capacity).fill(-1);
  const order = shuffledOrder(capacity, area.area);
  for (let k = 0; k < capacity; k++) {
    if (k < soldCount) sold[order[k]] = 1;
    if (k < times.length) time[order[k]] = times[k];
  }
  return { placed: placeStanding(shape, capacity), sold, time };
}

export function buildScene(areas: readonly ReplayArea[]): Scene {
  const chunks: Chunk[] = [];
  const shapes: StadiumArea[] = [];
  const missing: string[] = [];

  for (const area of areas) {
    const shape = SHAPES.get(normalizeArea(area.area));
    if (!shape) {
      missing.push(area.area);
      continue;
    }
    shapes.push(shape);
    if (area.rows.length) chunks.push(seatedChunk(shape, area));
    if (area.standing && area.standing.capacity > 0) chunks.push(standingChunk(shape, area));
  }

  const count = chunks.reduce((sum, chunk) => sum + chunk.sold.length, 0);
  const scene: Scene = {
    count,
    x: new Float32Array(count),
    y: new Float32Array(count),
    size: new Float32Array(count),
    sold: new Uint8Array(count),
    time: new Int32Array(count),
    order: new Uint32Array(0),
    orderTimes: new Int32Array(0),
    shapes,
    missing,
  };

  let offset = 0;
  for (const { placed, sold, time } of chunks) {
    scene.x.set(placed.x, offset);
    scene.y.set(placed.y, offset);
    scene.size.fill(placed.size, offset, offset + sold.length);
    scene.sold.set(sold, offset);
    scene.time.set(time, offset);
    offset += sold.length;
  }

  const scanned: number[] = [];
  for (let i = 0; i < count; i++) if (scene.time[i] >= 0) scanned.push(i);
  scanned.sort((a, b) => scene.time[a] - scene.time[b]);
  scene.order = Uint32Array.from(scanned);
  scene.orderTimes = Int32Array.from(scanned, (i) => scene.time[i]);
  return scene;
}

/** Hoeveel plekken er op seconde `now` binnen zijn: de eerste tijd die later is. */
export function enteredAt(orderTimes: Int32Array, now: number): number {
  let low = 0;
  let high = orderTimes.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (orderTimes[middle] <= now) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Scans per stukje tijdlijn, voor de grafiek achter de schuif. */
export function scanHistogram(orderTimes: Int32Array, duration: number, bins: number): number[] {
  const counts = new Array<number>(bins).fill(0);
  if (duration <= 0) {
    if (bins > 0) counts[0] = orderTimes.length;
    return counts;
  }
  for (const time of orderTimes) counts[Math.min(Math.floor((time / duration) * bins), bins - 1)]++;
  return counts;
}
