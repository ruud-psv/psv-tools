import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyInstroomSale,
  applyInstroomScan,
  emptyInstroomData,
  idHash,
  parseScanDate,
  SCAN_ENTRY,
  SCAN_OK,
} from "./state";

const PRODUCT = "8e609b50-f1a2-e911-9414-005056842ae1";

const sale = (overrides: Record<string, unknown> = {}) => ({
  sales_item_id: "S1",
  product_id: PRODUCT.toUpperCase(),
  item_type: "Ticket",
  sale_type: "Sale",
  current_status: true,
  forward_item_id: null,
  primary_ticket_id: "P1",
  product_item_id: "I1",
  area: "A",
  row: "5",
  seat: "12",
  ...overrides,
});

const scan = (overrides: Record<string, unknown> = {}) => ({
  barcode_usage_id: "B1",
  product_id: PRODUCT,
  primary_ticket_id: "P1",
  scanned_item_id: "C1",
  scan_date: "2026-10-31T18:12:05",
  scan_succeeded: true,
  action: "Entry",
  area_name: null,
  row_name: null,
  seat: null,
  ...overrides,
});

test("scan_date is UTC op de seconde", () => {
  assert.equal(parseScanDate("2019-10-25T17:31:50"), Date.UTC(2019, 9, 25, 17, 31, 50) / 1000);
  // Fracties van een seconde vallen weg.
  assert.equal(parseScanDate("2019-10-25 17:31:50.917000"), Date.UTC(2019, 9, 25, 17, 31, 50) / 1000);
  assert.equal(parseScanDate("2019-10-25T19:31:50+02:00"), Date.UTC(2019, 9, 25, 17, 31, 50) / 1000);
  assert.equal(parseScanDate("gisteren"), null);
  assert.equal(parseScanDate(null), null);
});

test("ids gaan er alleen gehasht in, ongeacht hoofdletters", () => {
  assert.equal(idHash("ABC-1"), idHash(" abc-1 "));
  assert.equal(idHash("ABC-1").length, 16);
  assert.notEqual(idHash("ABC-1"), "abc-1");
  assert.equal(idHash(null), "");
});

test("een ticket van de wedstrijd wordt bewaard met zijn stoel", () => {
  const data = emptyInstroomData(PRODUCT);
  assert.equal(applyInstroomSale(data, sale()), true);
  assert.deepEqual(data.tickets[idHash("S1")], ["A", "5", "12", 1, idHash("P1"), idHash("I1")]);
});

test("tickets van een andere wedstrijd en andere producten vallen af", () => {
  const data = emptyInstroomData(PRODUCT);
  assert.equal(applyInstroomSale(data, sale({ product_id: "ander" })), false);
  assert.equal(applyInstroomSale(data, sale({ item_type: "Membership" })), false);
  assert.deepEqual(data.tickets, {});
});

test("een vervallen ticket blijft staan, maar is niet meer geldig", () => {
  const data = emptyInstroomData(PRODUCT);
  applyInstroomSale(data, sale());
  applyInstroomSale(data, sale({ current_status: false }));
  assert.equal(data.tickets[idHash("S1")][3], 0);
  applyInstroomSale(data, sale({ sales_item_id: "S2", sale_type: "Reservation" }));
  assert.equal(data.tickets[idHash("S2")][3], 0);
});

test("een verwijderde regel verdwijnt, ook met alleen de sleutel", () => {
  const data = emptyInstroomData(PRODUCT);
  applyInstroomSale(data, sale());
  assert.equal(applyInstroomSale(data, { _ringside_operation: "D", sales_item_id: "S1" }), true);
  assert.deepEqual(data.tickets, {});

  applyInstroomScan(data, scan());
  assert.equal(applyInstroomScan(data, { _ringside_operation: "D", barcode_usage_id: "B1" }), true);
  assert.deepEqual(data.scans, {});
});

test("een scan bewaart tijdstip, uitkomst en naar welk ticket hij wijst", () => {
  const data = emptyInstroomData(PRODUCT);
  assert.equal(applyInstroomScan(data, scan()), true);
  assert.deepEqual(data.scans[idHash("B1")], [
    Date.UTC(2026, 9, 31, 18, 12, 5) / 1000,
    SCAN_OK | SCAN_ENTRY,
    idHash("P1"),
    idHash("C1"),
  ]);
});

test("een mislukte scan en een scan naar buiten krijgen andere vlaggen", () => {
  const data = emptyInstroomData(PRODUCT);
  applyInstroomScan(data, scan({ scan_succeeded: false }));
  assert.equal(data.scans[idHash("B1")][1], SCAN_ENTRY);
  applyInstroomScan(data, scan({ barcode_usage_id: "B2", action: "Exit" }));
  assert.equal(data.scans[idHash("B2")][1], SCAN_OK);
  applyInstroomScan(data, scan({ barcode_usage_id: "B3", action: "Re-Entry" }));
  assert.equal(data.scans[idHash("B3")][1], SCAN_OK | SCAN_ENTRY);
});

test("staat de plek op de scan zelf, dan gaat hij mee", () => {
  const data = emptyInstroomData(PRODUCT);
  applyInstroomScan(data, scan({ area_name: "A", row_name: "5", seat: "12" }));
  assert.deepEqual(data.scans[idHash("B1")].slice(4), ["A", "5", "12"]);
});

test("scans van een andere wedstrijd of zonder tijdstip vallen af", () => {
  const data = emptyInstroomData(PRODUCT);
  assert.equal(applyInstroomScan(data, scan({ product_id: "ander" })), false);
  assert.equal(applyInstroomScan(data, scan({ scan_date: null })), false);
  assert.deepEqual(data.scans, {});
});

test("een doorgezet of doorverkocht ticket geeft wel de stoel, maar telt niet als verkocht", () => {
  const data = emptyInstroomData(PRODUCT);
  applyInstroomSale(data, sale({ sales_item_id: "S3", item_type: "Transfer" }));
  assert.deepEqual(data.tickets[idHash("S3")].slice(0, 4), ["A", "5", "12", 0]);
});
