import { test } from "node:test";
import assert from "node:assert/strict";
import { HERDGANG_AREAS, mapArea, occupancyBin } from "./herdgang";

test("elk vak van de plattegrond staat erop, E twee keer", () => {
  for (const area of "A B C D F G H J K L M N O P Q R S T U V".split(" ")) {
    assert.equal(HERDGANG_AREAS.filter((shape) => shape.area === area).length, 1, area);
  }
  assert.equal(HERDGANG_AREAS.filter((shape) => shape.area === "E").length, 2);
});

test("vaknamen uit Ringside passen op de kaart", () => {
  assert.equal(mapArea("Vak A"), "A");
  assert.equal(mapArea(" k "), "K");
  assert.equal(mapArea("VAK  Q"), "Q");
});

test("klassen voor bezetting lopen op zonder gaten", () => {
  assert.equal(occupancyBin(0, 100).fill, "#eeeeee");
  assert.equal(occupancyBin(5, 0).fill, "#eeeeee");
  assert.equal(occupancyBin(1, 100).fill, "#fbc9ca");
  assert.equal(occupancyBin(25, 100).fill, "#f79da1");
  assert.equal(occupancyBin(50, 100).fill, "#e82026");
  assert.equal(occupancyBin(80, 100).fill, "#9c1006");
  assert.equal(occupancyBin(120, 100).fill, "#9c1006");
});
