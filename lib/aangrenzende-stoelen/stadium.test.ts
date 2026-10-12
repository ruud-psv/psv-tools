import { test } from "node:test";
import assert from "node:assert/strict";
import { binFor, STADIUM_AREAS } from "./stadium";
import { isExcludedArea } from "./neighbors";

/** De genummerde vakken uit de ticketshop en de lijst seizoenkaarthouders (oktober 2026). */
const NUMBERED = (
  "*N *Z A AA B BB C CC CD D DD E EE F FF GG H HH J JJ K KK L LL M N NN O OO P PP PR R RR S SS T TT UU VV WW XX YY ZZ"
).split(" ");

test("elk genummerd vak staat precies één keer op de plattegrond", () => {
  for (const area of NUMBERED) {
    assert.equal(STADIUM_AREAS.filter((shape) => shape.area === area).length, 1, area);
  }
});

test("vakken die niet meedoen zijn op de plattegrond ook gemarkeerd", () => {
  for (const shape of STADIUM_AREAS) {
    if (isExcludedArea(shape.area)) assert.ok(shape.excluded, `${shape.area} hoort gemarkeerd`);
    if (NUMBERED.includes(shape.area)) assert.equal(shape.excluded, undefined, `${shape.area} doet wel mee`);
    assert.ok(shape.rect || shape.path, `${shape.area} heeft een vorm`);
  }
});

test("klassen lopen op zonder gaten", () => {
  assert.equal(binFor(0).fill, "#eeeeee");
  assert.equal(binFor(1).fill, "#fbc9ca");
  assert.equal(binFor(4).fill, "#fbc9ca");
  assert.equal(binFor(5).fill, "#f79da1");
  assert.equal(binFor(15).fill, "#e82026");
  assert.equal(binFor(40).fill, "#9c1006");
  assert.equal(binFor(500).fill, "#9c1006");
});
