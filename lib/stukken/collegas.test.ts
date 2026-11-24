import { test } from "node:test";
import assert from "node:assert/strict";

import { collegaSuggesties, haalCollegaWeg, leesCollegaInvoer, magLezen, voegCollegaToe } from "./collegas";

const op = "2026-11-24T10:00:00.000Z";

test("invoer: geldig e-mailadres, niet jezelf", () => {
  assert.deepEqual(leesCollegaInvoer({ email: " Jan@PSV.nl ", naam: "Jan" }, "ik@psv.nl"), { email: "jan@psv.nl", naam: "Jan" });
  assert.ok("fout" in leesCollegaInvoer({ email: "geen-mail" }, "ik@psv.nl"));
  assert.ok("fout" in leesCollegaInvoer({ email: "IK@psv.nl" }, "ik@psv.nl"));
  assert.ok("fout" in leesCollegaInvoer(null, "ik@psv.nl"));
});

test("toevoegen is idempotent, weghalen op e-mail", () => {
  const een = voegCollegaToe(undefined, { email: "jan@psv.nl", gedeeldOp: op });
  assert.equal(voegCollegaToe(een, { email: "jan@psv.nl", gedeeldOp: "later" }), een);
  const twee = voegCollegaToe(een, { email: "piet@psv.nl", gedeeldOp: op });
  assert.deepEqual(haalCollegaWeg(twee, "JAN@psv.nl").map((c) => c.email), ["piet@psv.nl"]);
});

test("lezen: de maker en wie erin staat", () => {
  const stuk = { eigenaar: "ik@psv.nl", gedeeldMet: [{ email: "jan@psv.nl", gedeeldOp: op }] };
  assert.ok(magLezen(stuk, "Ik@psv.nl"));
  assert.ok(magLezen(stuk, "jan@psv.nl"));
  assert.ok(!magLezen(stuk, "piet@psv.nl"));
  assert.ok(!magLezen({ eigenaar: "ik@psv.nl" }, "jan@psv.nl"));
});

test("suggesties: zonder dubbelen en jezelf, naam wint, zoeken op naam of e-mail", () => {
  const bronnen = [
    [{ email: "jan@psv.nl" }, { email: "ik@psv.nl", naam: "Ik" }],
    [{ email: "JAN@psv.nl", naam: "Jan Jansen" }, { email: "piet@psv.nl", naam: "Piet de Vries" }],
  ];
  assert.deepEqual(collegaSuggesties(bronnen, "ik@psv.nl"), [
    { email: "jan@psv.nl", naam: "Jan Jansen" },
    { email: "piet@psv.nl", naam: "Piet de Vries" },
  ]);
  assert.deepEqual(collegaSuggesties(bronnen, "ik@psv.nl", "de vries").map((c) => c.email), ["piet@psv.nl"]);
  assert.deepEqual(collegaSuggesties(bronnen, "ik@psv.nl", "jan@").map((c) => c.email), ["jan@psv.nl"]);
});
