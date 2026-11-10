import { test } from "node:test";
import assert from "node:assert/strict";
import { addAttendanceRow, describeBarcodeHistory, emptyAttendanceSummary } from "./check";

test("scans worden geteld per product, per jaar en per waarde", () => {
  const summary = emptyAttendanceSummary();
  addAttendanceRow(summary, { product_id: "A", scan_date: "2019-10-25T17:31:50", scan_succeeded: true, action: "Entry", scanner_name: "Scanner 3" });
  addAttendanceRow(summary, { product_id: "a", scan_date: "2019-10-25T17:10:00", scan_succeeded: "False", action: "Entry", area_name: "A" });
  addAttendanceRow(summary, { product_id: "b", scan_date: "2026-10-31T18:00:00", scan_succeeded: true, action: "Exit" });
  addAttendanceRow(summary, {});

  assert.equal(summary.rows, 4);
  assert.deepEqual(summary.years, { "2019": 2, "2026": 1, onbekend: 1 });
  assert.equal(summary.succeeded, 2);
  assert.equal(summary.withArea, 1);
  assert.deepEqual(summary.products.get("a"), {
    productId: "a",
    scans: 2,
    firstScan: "2019-10-25T17:10:00",
    lastScan: "2019-10-25T17:31:50",
  });
  assert.deepEqual(summary.values.action, { Entry: 2, Exit: 1, leeg: 1 });
  assert.deepEqual(summary.values.scanner_name, { "Scanner 3": 1, leeg: 3 });
});

test("van barcode_history komt alleen de vorm terug, nooit een barcode", () => {
  const history = JSON.stringify([
    {
      Barcode: "123456789012",
      BarcodeNumber: 123456789012,
      Status: "Used",
      UsedDate: "2026-10-31T18:12:05",
      IsActive: true,
      Id: "4b0a9d81-f1a2-e911-9414-005056842ae1",
      Note: "een lange vrije tekst die er niet toe doet en dus wegvalt",
    },
  ]);
  assert.deepEqual(describeBarcodeHistory(history), [
    {
      Barcode: "«gemaskeerd»",
      BarcodeNumber: "«gemaskeerd»",
      Status: "Used",
      UsedDate: "2026-10-31T18:12:05",
      IsActive: true,
      Id: "«tekst, 36 tekens»",
      Note: "«tekst, 57 tekens»",
    },
  ]);
  assert.ok(!JSON.stringify(describeBarcodeHistory(history)).includes("123456789012"));
});

test("leeg en onleesbaar geven geen vorm", () => {
  assert.equal(describeBarcodeHistory(null), null);
  assert.equal(describeBarcodeHistory("[]"), null);
  assert.equal(describeBarcodeHistory("geen json"), "«geen JSON, 9 tekens»");
});
