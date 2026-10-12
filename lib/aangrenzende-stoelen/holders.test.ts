import { test } from "node:test";
import assert from "node:assert/strict";
import { HolderListError, parseCsvTable, parseHolderTable } from "./holders";

test("leest de kolommen op naam, met extra kolommen en Excel-getallen", () => {
  const summary = parseHolderTable([
    ["SCC Abonnement", "Stoel", "Rij", "Vak", "CRM ID"],
    ["Seizoen Club Card 26/27", 39, 2, "*n", 4420995],
    ["Seizoen Club Card 26/27", "40", "2", " *N ", "04420995"],
  ]);
  assert.equal(summary.rowsRead, 2);
  assert.equal(summary.relations, 1);
  assert.deepEqual(summary.holders, [
    { relationNumber: "4420995", area: "*N", row: 2, seat: 39 },
    { relationNumber: "4420995", area: "*N", row: 2, seat: 40 },
  ]);
});

test("meldt ongeldige regels en dubbele stoelen met regelnummer", () => {
  const summary = parseHolderTable([
    ["CRM ID", "Vak", "Rij", "Stoel"],
    [1000001, "A", 4, 7],
    [null, "A", 4, 8],
    [1000002, "A", "vier", 9],
    [1000003, "A", 4, 7],
    [null, null, null, null],
    [1000004, "RSA", 1, 1],
  ]);
  assert.equal(summary.holders.length, 2);
  assert.deepEqual(summary.invalidRows, { count: 2, examples: [3, 4] });
  assert.deepEqual(summary.duplicateSeats, { count: 1, examples: [5] });
  assert.equal(summary.excludedAreaSeats, 1);
  assert.equal(summary.rowsRead, 5);
});

test("weigert een bestand zonder verplichte kolom", () => {
  assert.throws(
    () => parseHolderTable([["CRM ID", "Vak", "Rij"], [1, "A", 1]]),
    (error: unknown) => error instanceof HolderListError && /"Stoel"/.test(error.message)
  );
  assert.throws(() => parseHolderTable([]), HolderListError);
  assert.throws(() => parseHolderTable([["CRM ID", "Vak", "Rij", "Stoel"]]), HolderListError);
});

test("CSV met puntkomma, BOM en aanhalingstekens", () => {
  const rows = parseCsvTable('﻿CRM ID;Vak;Rij;Stoel\r\n123;"*N";2;39\r\n"4;56";A;1;1\n');
  assert.deepEqual(rows, [
    ["CRM ID", "Vak", "Rij", "Stoel"],
    ["123", "*N", "2", "39"],
    ["4;56", "A", "1", "1"],
  ]);
  const summary = parseHolderTable(rows);
  assert.equal(summary.holders.length, 1);
  assert.equal(summary.invalidRows.count, 1);
});

test("CSV met komma of tab", () => {
  assert.deepEqual(parseCsvTable("CRM ID,Vak,Rij,Stoel\n1,A,2,3"), [
    ["CRM ID", "Vak", "Rij", "Stoel"],
    ["1", "A", "2", "3"],
  ]);
  assert.deepEqual(parseCsvTable("CRM ID\tVak\tRij\tStoel\n1\tA\t2\t3\n"), [
    ["CRM ID", "Vak", "Rij", "Stoel"],
    ["1", "A", "2", "3"],
  ]);
});
