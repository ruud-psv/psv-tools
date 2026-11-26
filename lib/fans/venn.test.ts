import { test } from "node:test";
import assert from "node:assert/strict";
import { lensOppervlak, vennVorm } from "./venn";

test("Venn op schaal: cirkels zo groot als de bronnen, overlap zo groot als beide", () => {
  // De handmatige stand van 26 november.
  const v = vennVorm(73_852, 64_748, 34_106);
  assert.ok(Math.abs(Math.PI * v.rA ** 2 - 73_852) < 1);
  assert.ok(Math.abs(Math.PI * v.rB ** 2 - 64_748) < 1);
  assert.ok(Math.abs(lensOppervlak(v.rA, v.rB, v.d) - 34_106) < 1);
  assert.ok(v.d > Math.abs(v.rA - v.rB) && v.d < v.rA + v.rB);
});

test("Venn: geen overlap legt de cirkels tegen elkaar, volledige overlap de kleine erin", () => {
  const los = vennVorm(100, 50, 0);
  assert.equal(los.d, los.rA + los.rB);
  const binnen = vennVorm(100, 50, 50);
  assert.equal(binnen.d, Math.abs(binnen.rA - binnen.rB));
  assert.equal(lensOppervlak(1, 1, 3), 0);
});
