import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contactFilterBody,
  defaultDmid,
  maileonName,
  parseTargetGroup,
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
  const body = contactFilterBody("Naam", ["300", " 100", "200", "100", ""], "includein");
  assert.deepEqual(body, {
    name: "Naam",
    rules: [
      {
        startset: "empty",
        operation: "add",
        selection: {
          selection_base: "contactfield",
          criterion: { field_name: RELATION_NUMBER_FIELD, operation: "includein", value: ["100", "200", "300"] },
        },
      },
    ],
  });
});

test("status van een doelgroep uit de XML van Maileon", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<targetgroup>
  <id>13</id>
  <name><![CDATA[2026.10.12 PSV Kaartverkoop - Aangrenzende stoelen PSV - Willem II - DMID-XXX]]></name>
  <author>api@example.com</author>
  <state>uptodate</state>
  <type>regular</type>
  <contact_filter_name>Filter</contact_filter_name>
  <contact_filter_id>2765</contact_filter_id>
  <evaluated>2026-10-12 18:01:02</evaluated>
  <created>2026-10-12 18:00:00</created>
  <updated>2026-10-12 18:00:00</updated>
  <count_active_contacts>310</count_active_contacts>
  <count_contacts>342</count_contacts>
</targetgroup>`;
  assert.deepEqual(parseTargetGroup(xml), {
    id: 13,
    name: "2026.10.12 PSV Kaartverkoop - Aangrenzende stoelen PSV - Willem II - DMID-XXX",
    state: "uptodate",
    countContacts: 342,
    countActiveContacts: 310,
    evaluated: "2026-10-12 18:01:02",
  });
});
