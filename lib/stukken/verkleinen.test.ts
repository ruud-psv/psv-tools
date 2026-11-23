import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

import { MAX_ZIJDE, verkleinVoorStuk } from "./verkleinen";

test("verkleinen: groot naar hooguit 2560 px als JPEG, klein blijft klein, doorzichtig blijft PNG", async () => {
  const groot = await sharp({ create: { width: 6000, height: 4000, channels: 3, background: "#e30713" } }).jpeg().toBuffer();
  const a = await verkleinVoorStuk(groot);
  const ma = await sharp(a.bytes).metadata();
  assert.equal(a.soort, "jpg");
  assert.equal(ma.width, MAX_ZIJDE);
  assert.equal(ma.height, Math.round((4000 / 6000) * MAX_ZIJDE));

  const klein = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#000" } }).png().toBuffer();
  const mb = await sharp((await verkleinVoorStuk(klein)).bytes).metadata();
  assert.equal(mb.width, 800); // niet groter gemaakt

  const doorzichtig = await sharp({ create: { width: 3000, height: 3000, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const c = await verkleinVoorStuk(doorzichtig);
  assert.equal(c.soort, "png");
  assert.equal((await sharp(c.bytes).metadata()).width, MAX_ZIJDE);
});
