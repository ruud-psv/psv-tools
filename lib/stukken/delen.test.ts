import { test } from "node:test";
import assert from "node:assert/strict";

import { deelToegang, leesDeelInvoer, standaardVerloopdatum } from "./delen";

const vandaag = "2026-11-18";

test("toegang: collega's, openbaar en verlopen", () => {
  assert.equal(deelToegang({ publiek: false }, true, vandaag), "ok");
  assert.equal(deelToegang({ publiek: false }, false, vandaag), "inloggen");
  assert.equal(deelToegang({ publiek: true, verlooptOp: "2026-12-18" }, false, vandaag), "ok");
  // De verloopdatum zelf werkt nog; de dag erna niet meer.
  assert.equal(deelToegang({ publiek: true, verlooptOp: vandaag }, false, vandaag), "ok");
  assert.equal(deelToegang({ publiek: true, verlooptOp: "2026-11-17" }, false, vandaag), "verlopen");
  assert.equal(deelToegang({ publiek: false, verlooptOp: "2026-11-17" }, true, vandaag), "verlopen");
});

test("invoer: openbaar alleen met een verloopdatum binnen een jaar", () => {
  assert.deepEqual(leesDeelInvoer({}, vandaag), { publiek: false });
  assert.deepEqual(leesDeelInvoer({ publiek: false, verlooptOp: "2027-01-01" }, vandaag), { publiek: false, verlooptOp: "2027-01-01" });
  assert.deepEqual(leesDeelInvoer({ publiek: true, verlooptOp: "2026-12-18" }, vandaag), { publiek: true, verlooptOp: "2026-12-18" });
  assert.deepEqual(leesDeelInvoer({ publiek: true }, vandaag), { fout: "Een openbare link heeft een verloopdatum nodig." });
  assert.ok("fout" in leesDeelInvoer({ publiek: true, verlooptOp: "2026-11-17" }, vandaag));
  assert.ok("fout" in leesDeelInvoer({ publiek: true, verlooptOp: "2027-12-01" }, vandaag));
  assert.ok("fout" in leesDeelInvoer({ publiek: true, verlooptOp: "morgen" }, vandaag));
  // Alleen true telt als openbaar.
  assert.deepEqual(leesDeelInvoer({ publiek: "ja" }, vandaag), { publiek: false });
  assert.equal(standaardVerloopdatum(vandaag), "2026-12-18");
});
