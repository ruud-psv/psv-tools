import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contactFilterBody,
  defaultDmid,
  maileonMessage,
  maileonName,
  MAX_RELATION_NUMBERS,
  RELATION_NUMBER_FIELD,
  validateNameInput,
} from "./maileon";

test("naam volgens de conventie van Digital Marketing", () => {
  assert.equal(
    maileonName({ sendDate: "2026-10-12", eventName: "PSV - Willem II", dmid: "DMID-XXX" }),
    "2026.10.12 PSV Kaartverkoop - Aangrenzende stoelen PSV - Willem II - DMID-XXX"
  );
  assert.equal(
    maileonName({ sendDate: "2026-10-31", eventName: "  PSV  -  Ajax ", dmid: " DMID26-12345 " }),
    "2026.10.31 PSV Kaartverkoop - Aangrenzende stoelen PSV - Ajax - DMID26-12345"
  );
});

test("standaard-DMID volgt het jaar van de verzenddatum", () => {
  assert.equal(defaultDmid("2026-10-12"), "DMID26-XXXX");
  assert.equal(defaultDmid("2027-01-05"), "DMID27-XXXX");
});

test("verzenddatum en DMID worden gecontroleerd", () => {
  assert.equal(validateNameInput("2026-10-12", "DMID26-12345"), null);
  assert.equal(validateNameInput("2026-10-12", "DMID-XXX"), null);
  assert.match(validateNameInput("12-10-2026", "DMID26-1") ?? "", /verzenddatum/);
  assert.match(validateNameInput("2026-13-45", "DMID26-1") ?? "", /verzenddatum/);
  assert.match(validateNameInput("2026-10-12", "") ?? "", /DMID/);
  assert.match(validateNameInput("2026-10-12", "DMID 26 / 1") ?? "", /DMID/);
  assert.match(validateNameInput(undefined, undefined) ?? "", /verzenddatum/);
});

test("filter: leeg beginnen, relatienummers uit de lijst toevoegen, zonder dubbelen", () => {
  const body = contactFilterBody("Naam", ["300", " 100", "200", "100", ""]);
  assert.deepEqual(body, {
    name: "Naam",
    rules: [
      {
        startset: "empty",
        operation: "add",
        selection: {
          selection_base: "contactfield",
          criterion: { field_name: RELATION_NUMBER_FIELD, operation: "includedin", value: ["100", "200", "300"] },
        },
      },
    ],
  });
});

test("filter: hooguit 100 relatienummers per regel, alleen de eerste regel met startset", () => {
  const numbers = Array.from({ length: 250 }, (_, i) => String(100000 + i));
  const { rules } = contactFilterBody("Naam", numbers);
  assert.deepEqual(
    rules.map((rule) => rule.selection.criterion.value.length),
    [100, 100, 50]
  );
  assert.equal(rules[0].startset, "empty");
  assert.ok(rules.slice(1).every((rule) => !("startset" in rule) && rule.operation === "add"));
  assert.deepEqual(
    rules.flatMap((rule) => rule.selection.criterion.value),
    numbers
  );
});

test("filter: één regel blijft vrij voor de Ticketing-regel in Maileon", () => {
  const numbers = Array.from({ length: MAX_RELATION_NUMBERS }, (_, i) => String(i + 1));
  assert.equal(contactFilterBody("Naam", numbers).rules.length, 99);
});

test("filter: geen lege lijst en niet meer dan Maileon aankan", () => {
  assert.throws(() => contactFilterBody("Naam", []), /geen relatienummers/);
  const tooMany = Array.from({ length: MAX_RELATION_NUMBERS + 1 }, (_, i) => String(i + 1));
  assert.throws(() => contactFilterBody("Naam", tooMany), /hooguit/);
});

test("foutmeldingen van Maileon in alle vormen", () => {
  assert.equal(
    maileonMessage('{"error":{"message":"Unable to create the contact filter","status":400}}'),
    "Unable to create the contact filter"
  );
  assert.equal(maileonMessage('{"message":"kapot"}'), "kapot");
  assert.equal(maileonMessage("<error><message>no such api key</message></error>"), "no such api key");
  assert.equal(maileonMessage(" iets anders "), "iets anders");
});
