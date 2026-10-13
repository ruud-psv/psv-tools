import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contactFilterBody,
  defaultDmid,
  maileonMessage,
  maileonName,
  MAX_RELATION_NUMBERS,
  parseTargetGroup,
  RELATION_NUMBER_FIELD,
  targetGroupXml,
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

const ticketingRule = {
  operation: "intersection",
  selection: {
    selection_base: "contactpreference",
    criterion: { category_name: "Email", preference_name: "Ticketing", operation: "equals", value: true },
  },
};

type RelationRule = { startset?: string; operation: string; selection: { criterion: { value: string[] } } };

test("filter: leeg beginnen, relatienummers uit de lijst toevoegen, zonder dubbelen, alleen met Ticketing", () => {
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
      ticketingRule,
    ],
  });
});

test("filter: hooguit 100 relatienummers per regel, alleen de eerste regel met startset", () => {
  const numbers = Array.from({ length: 250 }, (_, i) => String(100000 + i));
  const { rules } = contactFilterBody("Naam", numbers);
  assert.deepEqual(rules.at(-1), ticketingRule);
  const relationRules = rules.slice(0, -1) as RelationRule[];
  assert.deepEqual(
    relationRules.map((rule) => rule.selection.criterion.value.length),
    [100, 100, 50]
  );
  assert.equal(relationRules[0].startset, "empty");
  assert.ok(relationRules.slice(1).every((rule) => !("startset" in rule) && rule.operation === "add"));
  assert.deepEqual(
    relationRules.flatMap((rule) => rule.selection.criterion.value),
    numbers
  );
});

test("filter: met de Ticketing-regel erbij nooit meer dan 100 regels", () => {
  const numbers = Array.from({ length: MAX_RELATION_NUMBERS }, (_, i) => String(i + 1));
  assert.equal(contactFilterBody("Naam", numbers).rules.length, 100);
});

test("filter: geen lege lijst en niet meer dan Maileon aankan", () => {
  assert.throws(() => contactFilterBody("Naam", []), /geen relatienummers/);
  const tooMany = Array.from({ length: MAX_RELATION_NUMBERS + 1 }, (_, i) => String(i + 1));
  assert.throws(() => contactFilterBody("Naam", tooMany), /hooguit/);
});

test("doelgroep als XML, met de naam veilig ge-escapet", () => {
  assert.equal(
    targetGroupXml("A & B <test>", 2765),
    '<?xml version="1.0" encoding="UTF-8"?><targetgroup><name>A &amp; B &lt;test&gt;</name>' +
      "<type>regular</type><contact_filter_id>2765</contact_filter_id></targetgroup>"
  );
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
