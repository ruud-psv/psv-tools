import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contactFilterBody,
  defaultDmid,
  filterName,
  maileonMessage,
  MAX_FILTER_VALUES,
  parseTargetGroup,
  parseTargetGroupId,
  targetGroupXml,
  validateNameInput,
} from "./contact-filters";

test("naam: datum, titel en DMID", () => {
  assert.equal(
    filterName({ sendDate: "2026-10-31", title: " PSV  Kaartverkoop - Uitverkocht ", dmid: " DMID26-12345 " }),
    "2026.10.31 PSV Kaartverkoop - Uitverkocht - DMID26-12345"
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

test("filter: leeg beginnen, waarden uit de lijst toevoegen, zonder dubbelen", () => {
  const body = contactFilterBody("Naam", "MEMBERNUMBERPRIOR", ["300", " 100", "200", "100", ""]);
  assert.deepEqual(body, {
    name: "Naam",
    rules: [
      {
        startset: "empty",
        operation: "add",
        selection: {
          selection_base: "contactfield",
          criterion: { field_name: "MEMBERNUMBERPRIOR", operation: "includedin", value: ["100", "200", "300"] },
        },
      },
    ],
  });
});

test("filter: hooguit 100 waarden per regel, alleen de eerste regel met startset", () => {
  const numbers = Array.from({ length: 250 }, (_, i) => String(100000 + i));
  const { rules } = contactFilterBody("Naam", "VELD", numbers);
  assert.deepEqual(
    rules.map((rule) => rule.selection.criterion.value.length),
    [100, 100, 50]
  );
  assert.equal(rules[0].startset, "empty");
  assert.ok(rules.slice(1).every((rule) => !("startset" in rule) && rule.operation === "add"));
  assert.ok(rules.every((rule) => rule.selection.criterion.field_name === "VELD"));
  assert.deepEqual(
    rules.flatMap((rule) => rule.selection.criterion.value),
    numbers
  );
});

test("filter: één regel blijft vrij voor een preference-regel in Maileon", () => {
  const numbers = Array.from({ length: MAX_FILTER_VALUES }, (_, i) => String(i + 1));
  assert.equal(contactFilterBody("Naam", "VELD", numbers).rules.length, 99);
});

test("filter: geen lege lijst en niet meer dan Maileon aankan", () => {
  assert.throws(() => contactFilterBody("Naam", "VELD", []), /geen waarden/);
  const tooMany = Array.from({ length: MAX_FILTER_VALUES + 1 }, (_, i) => String(i + 1));
  assert.throws(() => contactFilterBody("Naam", "VELD", tooMany), /hooguit/);
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

test("doelgroep: XML met naam en filter, tekens in de naam ontsnapt", () => {
  assert.equal(
    targetGroupXml("2026.10.31 A & B <test> - DMID26-1", 6303),
    '<?xml version="1.0" encoding="UTF-8"?><targetgroup><name>2026.10.31 A &amp; B &lt;test&gt; - DMID26-1</name>' +
      "<type>regular</type><contact_filter_id>6303</contact_filter_id></targetgroup>"
  );
});

test("doelgroep: ID uit het antwoord, als XML of als getal", () => {
  assert.equal(parseTargetGroupId('<?xml version="1.0"?><id>812</id>'), 812);
  assert.equal(parseTargetGroupId("812\n"), 812);
  assert.equal(parseTargetGroupId("<result>ok</result>"), null);
  assert.equal(parseTargetGroupId("<id>0</id>"), null);
});

test("doelgroep: stand en aantallen", () => {
  const xml =
    "<targetgroup><id>812</id><name><![CDATA[Naam]]></name><state>uptodate</state>" +
    "<count_active_contacts>950</count_active_contacts><count_contacts>1000</count_contacts></targetgroup>";
  assert.deepEqual(parseTargetGroup(xml), { state: "uptodate", countContacts: 1000, countActiveContacts: 950 });
  assert.deepEqual(parseTargetGroup("<targetgroup><state>updating</state></targetgroup>"), {
    state: "updating",
    countContacts: null,
    countActiveContacts: null,
  });
});
