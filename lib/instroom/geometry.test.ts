import { test } from "node:test";
import assert from "node:assert/strict";
import { STADIUM_AREAS, type StadiumArea } from "../aangrenzende-stoelen/stadium";
import {
  areaFrame,
  areaPolygon,
  insideRun,
  pathToPolygon,
  placeSeats,
  placeStanding,
  pointInPolygon,
  shuffledOrder,
  sideOf,
} from "./geometry";

const area = (name: string): StadiumArea => {
  const found = STADIUM_AREAS.find((shape) => shape.area === name);
  assert.ok(found, `vak ${name} staat op de plattegrond`);
  return found;
};

/** Een vak van `rows` rijen met de stoelen 1 t/m `perRow`. */
const grid = (rows: number, perRow: number) =>
  Array.from({ length: rows }, (_, r) => ({ row: r + 1, seats: Array.from({ length: perRow }, (_, s) => s + 1) }));

test("een pad wordt een veelhoek, met de bocht als punten op de cirkel", () => {
  assert.deepEqual(pathToPolygon("M520 352 H645 V442 H566 L520 398 Z"), [
    [520, 352],
    [645, 352],
    [645, 442],
    [566, 442],
    [520, 398],
  ]);

  const corner = pathToPolygon("M390 290 A305 305 0 0 1 607 200 V318 H530 L472 372 Z");
  assert.deepEqual(corner[0], [390, 290]);
  assert.ok(corner.some(([x, y]) => x === 607 && y === 200));
  // De bocht loopt rond het draaipunt van de hoek, op (bijna) 305 afstand.
  const arc = corner.slice(1, corner.findIndex(([x, y]) => x === 607 && y === 200));
  assert.ok(arc.length >= 5);
  for (const [x, y] of arc) assert.ok(Math.abs(Math.hypot(x - 607, y - 505) - 305) < 1.5);
});

test("elk vak ligt aan de goede kant van het veld", () => {
  const sides = Object.fromEntries(STADIUM_AREAS.map((shape) => [shape.area, sideOf(areaPolygon(shape))]));
  assert.equal(sides.PR, "N");
  assert.equal(sides.M, "N");
  assert.equal(sides.U, "N");
  assert.equal(sides.CD, "S");
  assert.equal(sides.RSA, "S");
  assert.equal(sides.L, "W");
  assert.equal(sides.RSK, "W");
  assert.equal(sides.HH, "W");
  assert.equal(sides.Y, "E");
  assert.equal(sides.VV, "E");
  assert.equal(sides.MM, "NW");
  assert.equal(sides.BEZOEKERS, "NW");
  assert.equal(sides.UU, "NE");
  assert.equal(sides.ZZ, "SE");
  assert.equal(sides.GG, "SW");
});

test("rij 1 ligt aan het veld en het hoogste stoelnummer links als je naar het veld kijkt", () => {
  // Noord: het veld ligt eronder, links is op de kaart rechts.
  const north = placeSeats(area("PR"), grid(2, 3));
  assert.ok(north.y[0] > north.y[3], "rij 1 ligt lager op de kaart dan rij 2");
  assert.ok(north.x[2] > north.x[0], "stoel 3 ligt rechts van stoel 1");

  // Zuid: het veld ligt erboven, links is op de kaart links.
  const south = placeSeats(area("CD"), grid(2, 3));
  assert.ok(south.y[0] < south.y[3]);
  assert.ok(south.x[2] < south.x[0]);

  // West: het veld ligt rechts, links is op de kaart boven.
  const west = placeSeats(area("K"), grid(2, 3));
  assert.ok(west.x[0] > west.x[3]);
  assert.ok(west.y[2] < west.y[0]);

  // Oost: het veld ligt links, links is op de kaart onder.
  const east = placeSeats(area("WW"), grid(2, 3));
  assert.ok(east.x[0] < east.x[3]);
  assert.ok(east.y[2] > east.y[0]);
});

test("een stoelnummer dat ontbreekt blijft een open plek", () => {
  const placed = placeSeats(area("PR"), [{ row: 1, seats: [1, 2, 4, 5] }]);
  const step = placed.x[1] - placed.x[0];
  assert.ok(Math.abs(placed.x[2] - placed.x[1] - 2 * step) < 0.01);
});

test("in een hoek volgen de rijen de bocht rond het draaipunt", () => {
  const placed = placeSeats(area("GG"), grid(3, 20));
  const radius = (i: number) => Math.hypot(placed.x[i] - 607, placed.y[i] - 997);
  for (let i = 1; i < 20; i++) assert.ok(Math.abs(radius(i) - radius(0)) < 0.01, "één rij ligt op één cirkel");
  assert.ok(radius(20) > radius(0), "rij 2 ligt verder van het veld");
});

test("alle stoelen van elk vak vallen binnen zijn vorm", () => {
  for (const shape of STADIUM_AREAS) {
    const polygon = areaPolygon(shape);
    const frame = areaFrame(shape);
    const run = insideRun(frame, 0.5);
    assert.ok(run, `vak ${shape.area} heeft een rij op halve diepte`);
    for (const placed of [placeSeats(shape, grid(12, 30)), placeStanding(shape, 400)]) {
      assert.ok(placed.size > 0);
      for (let i = 0; i < placed.x.length; i++) {
        assert.ok(pointInPolygon([placed.x[i], placed.y[i]], polygon), `vak ${shape.area}, plek ${i}`);
      }
    }
  }
});

test("een staanvak krijgt precies zoveel plekken als de capaciteit", () => {
  for (const capacity of [1, 7, 703]) assert.equal(placeStanding(area("U"), capacity).x.length, capacity);
  assert.equal(placeStanding(area("U"), 0).x.length, 0);
});

test("de volgorde van een staanvak is door elkaar, compleet en elke keer gelijk", () => {
  const order = shuffledOrder(500, "U");
  assert.deepEqual([...order].sort((a, b) => a - b), Array.from({ length: 500 }, (_, i) => i));
  assert.deepEqual([...shuffledOrder(500, "U")], [...order]);
  assert.notDeepEqual([...shuffledOrder(500, "MM")], [...order]);
  assert.notDeepEqual([...order].slice(0, 20), Array.from({ length: 20 }, (_, i) => i));
});
