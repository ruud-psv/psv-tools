import { test } from "node:test";
import assert from "node:assert/strict";
import { checkIds, ID_TYPES, IdListError, parseIdSheet, parseIdText } from "./ids";

test("relatienummers: cijfers, zonder voorloopnullen, dubbelen en fouten geteld", () => {
  assert.equal(ID_TYPES.relatienummer.normalize(" 00123 "), "123");
  assert.equal(ID_TYPES.relatienummer.normalize(123), "123");
  assert.equal(ID_TYPES.relatienummer.normalize("12a"), null);
  assert.equal(ID_TYPES.relatienummer.normalize("0"), null);
  assert.equal(ID_TYPES.relatienummer.normalize(1.5), null);

  const summary = parseIdText("123\n456, 789;123\n\nabc\n0456", "relatienummer");
  assert.deepEqual(summary.values, ["123", "456", "789"]);
  assert.equal(summary.read, 6);
  assert.equal(summary.duplicates, 2);
  assert.deepEqual(summary.invalid, { count: 1, examples: ['"abc"'] });
  assert.equal(summary.column, null);
});

test("SSO-ID en GroupID: letters en cijfers, minstens één cijfer, hoofdletters blijven", () => {
  assert.equal(ID_TYPES["sso-id"].normalize("a1B2-c3"), "a1B2-c3");
  assert.equal(ID_TYPES["sso-id"].normalize("3f2504e0-4f89-11d3-9a0c-0305e82c3301"), "3f2504e0-4f89-11d3-9a0c-0305e82c3301");
  assert.equal(ID_TYPES.groupid.normalize(98765), "98765");
  assert.equal(ID_TYPES.groupid.normalize("Jansen"), null);
  assert.equal(ID_TYPES.groupid.normalize("12 34"), null);
});

test("tekst met kopregel: de kolom op naam, regelnummers in meldingen", () => {
  const csv = "Naam;CRM ID;Plaats\nJan;123;Eindhoven\nPiet;x;Best\nKees;456;Son";
  const summary = parseIdText(csv, "relatienummer");
  assert.deepEqual(summary.values, ["123", "456"]);
  assert.equal(summary.column, "CRM ID");
  assert.deepEqual(summary.invalid, { count: 1, examples: ["regel 3"] });

  const pasted = "SSO ID\tGroupID\nabc1\t111\nabc2\t222";
  assert.deepEqual(parseIdText(pasted, "groupid").values, ["111", "222"]);
  assert.deepEqual(parseIdText(pasted, "sso-id").values, ["abc1", "abc2"]);
});

test("verkeerd soort ID gekozen: duidelijke melding", () => {
  assert.throws(() => parseIdText("SSO-ID\nabc1", "relatienummer"), /SSO-ID's.*Relatienummer/);
});

test("kolommen uit Excel zonder kopregel worden niet geraden", () => {
  assert.throws(() => parseIdText("123\tJan\n456\tPiet", "relatienummer"), IdListError);
});

test("geen enkele geldige waarde", () => {
  assert.throws(() => parseIdText("", "relatienummer"), /geen waarden/);
  assert.throws(() => parseIdText("abc\ndef", "relatienummer"), /Geen enkel geldig Relatienummer/);
});

test("werkblad: kolom op naam, of één kolom zonder kopregel", () => {
  const withHeader = [["Relatienummer", "Naam"], [123, "Jan"], [null, "leeg"], ["456", "Piet"]];
  const summary = parseIdSheet(withHeader, "relatienummer");
  assert.deepEqual(summary.values, ["123", "456"]);
  assert.equal(summary.read, 2);

  const single = [[null, 111], [null, 222], [null, "x"]];
  const plain = parseIdSheet(single, "groupid");
  assert.deepEqual(plain.values, ["111", "222"]);
  assert.deepEqual(plain.invalid, { count: 1, examples: ["regel 3"] });

  assert.throws(() => parseIdSheet([[1, 2], [3, 4]], "groupid"), /meerdere kolommen/);
  assert.throws(() => parseIdSheet([[null]], "groupid"), /leeg/);
});

test("server: elke waarde moet kloppen, dubbelen vallen weg", () => {
  assert.deepEqual(checkIds("relatienummer", ["123", "0123", 456]), { values: ["123", "456"] });
  assert.match((checkIds("relatienummer", ["123", "abc"]) as { error: string }).error, /1 waarden/);
  assert.ok("error" in checkIds("relatienummer", []));
  assert.ok("error" in checkIds("relatienummer", "123"));
});
