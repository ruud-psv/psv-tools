import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contactFilterBody,
  createTicketingContactFilter,
  defaultDmid,
  maileonMessage,
  maileonName,
  MAX_RELATION_NUMBERS,
  parseTargetGroup,
  RELATION_NUMBER_FIELD,
  targetGroupXml,
  ticketingFromFilterBody,
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

const ticketing = (criterion: object) => ({
  selection_base: "contactpreference",
  criterion: { category_name: "Email", preference_name: "Ticketing", ...criterion },
});

const relationRule = (value: string[]) => ({
  startset: "empty",
  operation: "add",
  selection: {
    selection_base: "contactfield",
    criterion: { field_name: RELATION_NUMBER_FIELD, operation: "includedin", value },
  },
});

type RelationRule = { startset?: string; operation: string; selection: { criterion: { value: string[] } } };

test("filter: leeg beginnen, relatienummers uit de lijst toevoegen, zonder dubbelen, dan doorsnede met Ticketing", () => {
  assert.deepEqual(contactFilterBody("Naam", ["300", " 100", "200", "100", ""], "intersection"), {
    name: "Naam",
    rules: [
      relationRule(["100", "200", "300"]),
      { operation: "intersection", selection: ticketing({ operation: "equals", value: true }) },
    ],
  });
});

test("filter in de vorm remove: wie Ticketing op nee of niet ingevuld heeft eruit", () => {
  assert.deepEqual(contactFilterBody("Naam", ["100"], "remove").rules, [
    relationRule(["100"]),
    { operation: "remove", selection: ticketing({ operation: "equals", value: false }) },
    { operation: "remove", selection: ticketing({ operation: "undefined" }) },
  ]);
});

test("hulpfilter: alleen de relatienummers", () => {
  assert.deepEqual(contactFilterBody("Naam", ["100"], null).rules, [relationRule(["100"])]);
});

test("twee filters: iedereen met Ticketing = ja, min wie niet in het hulpfilter zit", () => {
  assert.deepEqual(ticketingFromFilterBody("Naam", 6310), {
    name: "Naam",
    rules: [
      { startset: "empty", operation: "add", selection: ticketing({ operation: "equals", value: true }) },
      {
        operation: "remove",
        selection: {
          selection_base: "list_or_filter_affiliation",
          criterion: { type: "contactfilter", operation: "notequals", value: 6310 },
        },
      },
    ],
  });
});

test("filter: hooguit 100 relatienummers per regel, alleen de eerste regel met startset", () => {
  const numbers = Array.from({ length: 250 }, (_, i) => String(100000 + i));
  const rules = contactFilterBody("Naam", numbers, null).rules as RelationRule[];
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

test("filter: met de Ticketing-regels erbij nooit meer dan 100 regels", () => {
  const numbers = Array.from({ length: MAX_RELATION_NUMBERS }, (_, i) => String(i + 1));
  assert.equal(contactFilterBody("Naam", numbers, "remove").rules.length, 100);
});

test("filter: geen lege lijst en niet meer dan Maileon aankan", () => {
  assert.throws(() => contactFilterBody("Naam", [], "intersection"), /geen relatienummers/);
  const tooMany = Array.from({ length: MAX_RELATION_NUMBERS + 1 }, (_, i) => String(i + 1));
  assert.throws(() => contactFilterBody("Naam", tooMany, "intersection"), /hooguit/);
});

/**
 * Laat `fetch` antwoorden zoals Maileon: per aanroep de volgende status. Bij
 * 201 krijgt het filter een oplopend ID. Geeft de verstuurde filters terug.
 */
function fakeMaileon(statuses: number[]) {
  const sent: { name: string; rules: { operation: string; selection: { selection_base: string } }[] }[] = [];
  let nextId = 7000;
  process.env.MAILEON_API_KEY = "test";
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    const status = statuses.shift() ?? 500;
    const body =
      status === 201
        ? { contact_filter_id: nextId++ }
        : { error: { message: "Unable to create the contact filter", status } };
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return sent;
}

const usesTicketing = (filter: { rules: { selection: { selection_base: string } }[] }) =>
  filter.rules.some((rule) => rule.selection.selection_base === "contactpreference");

test("Ticketing-filter: de eerste vorm die Maileon accepteert", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  fakeMaileon([201]);
  assert.deepEqual(await createTicketingContactFilter("Naam", ["1"]), {
    contactFilterId: 7000,
    form: "intersection",
    relationFilterId: null,
    rejected: [],
  });

  const sent = fakeMaileon([400, 201]);
  const remove = await createTicketingContactFilter("Naam", ["1"]);
  assert.equal(remove.form, "remove");
  assert.equal(remove.contactFilterId, 7000);
  assert.match(remove.rejected[0], /^intersection: Maileon 400: Unable to create the contact filter$/);
  assert.ok(sent.every(usesTicketing));

  const twoSent = fakeMaileon([400, 400, 201, 201]);
  const two = await createTicketingContactFilter("Naam", ["1"]);
  assert.deepEqual(
    { form: two.form, relationFilterId: two.relationFilterId, contactFilterId: two.contactFilterId },
    { form: "twee filters", relationFilterId: 7000, contactFilterId: 7001 }
  );
  assert.equal(twoSent[2].name, "Naam - hulpfilter relatienummers");
  assert.ok(!usesTicketing(twoSent[2]), "het hulpfilter heeft alleen relatienummers");
  assert.ok(usesTicketing(twoSent[3]), "het echte filter, waar de doelgroep op komt, heeft Ticketing");
});

test("Ticketing-filter: alles afgewezen is een fout, en een andere fout stopt meteen", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  fakeMaileon([400, 400, 201, 400]);
  await assert.rejects(
    createTicketingContactFilter("Naam", ["1"]),
    /elke vorm.*hulpfilter 7000.*intersection: .*remove: .*twee filters: /
  );

  const sent = fakeMaileon([401]);
  await assert.rejects(createTicketingContactFilter("Naam", ["1"]), /maakte het filter niet\. Maileon 401/);
  assert.equal(sent.length, 1);
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
