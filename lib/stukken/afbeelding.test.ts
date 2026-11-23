import { test } from "node:test";
import assert from "node:assert/strict";

import { AfbeeldingFout, MAX_AFBEELDING_BYTES, beeldSoort, controleerAfbeelding } from "./afbeelding";

const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");

test("beeldsoort aan de inhoud, niet aan de naam", () => {
  assert.equal(beeldSoort(JPG), "jpg");
  assert.equal(beeldSoort(PNG), "png");
  assert.equal(beeldSoort(WEBP), "webp");
  assert.equal(beeldSoort(new TextEncoder().encode("<svg onload=alert(1)>")), null);
  assert.equal(beeldSoort(new TextEncoder().encode("GIF89a")), null);
  assert.equal(beeldSoort(new Uint8Array([0xff])), null);
});

test("controle: leeg, te groot of geen foto wordt geweigerd", () => {
  assert.equal(controleerAfbeelding(PNG), "png");
  assert.throws(() => controleerAfbeelding(new Uint8Array()), AfbeeldingFout);
  assert.throws(() => controleerAfbeelding(new TextEncoder().encode("%PDF-1.7")), /Alleen JPG, PNG of WebP/);
  const groot = new Uint8Array(MAX_AFBEELDING_BYTES + 1);
  groot.set(JPG);
  assert.throws(() => controleerAfbeelding(groot), /te groot \(4 MB\)\. Hooguit 4 MB/);
});
