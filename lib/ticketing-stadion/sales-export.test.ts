import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDailySalesExport, DAILY_SALES_COLUMNS } from "./sales-export";
import type { StoredEvent } from "../ringside/sales-series";

const event: StoredEvent = {
  productId: "p1",
  name: "PSV - AZ",
  eventDate: "2025-10-04T20:00:00+02:00",
  productType: "Event",
  category: "Wedstrijden",
  season: "25/26",
  stand: {
    vrij: { "2025-10-01": 120, "2025-10-04": 30 },
    resale: { "2025-10-03": 15 },
    seizoenkaart: { "2025-08-05": 22000 },
    vrijkaart: { "2025-10-01": 40 },
  },
  other: { vrij: { "2025-10-01": 999 } },
};

function rows(csv: string): string[][] {
  assert.ok(csv.startsWith("﻿"), "begint met een BOM voor Excel");
  return csv.slice(1).trimEnd().split("\r\n").map((line) => line.split(";"));
}

test("per kalenderdag een regel, met per soort ticket het aantal en het totaal", () => {
  const [header, ...lines] = rows(buildDailySalesExport(event));
  assert.deepEqual(header, [...DAILY_SALES_COLUMNS]);
  assert.deepEqual(lines, [
    ["PSV - AZ", "2025-10-04T20:00:00+02:00", "25/26", "2025-08-05", "60", "0", "0", "22000", "0", "22000"],
    ["PSV - AZ", "2025-10-04T20:00:00+02:00", "25/26", "2025-10-01", "3", "120", "0", "0", "40", "160"],
    ["PSV - AZ", "2025-10-04T20:00:00+02:00", "25/26", "2025-10-03", "1", "0", "15", "0", "0", "15"],
    ["PSV - AZ", "2025-10-04T20:00:00+02:00", "25/26", "2025-10-04", "0", "30", "0", "0", "0", "30"],
  ]);
});

test("parkeren telt niet mee, behalve als er niets op de plattegrond staat", () => {
  const elsewhere: StoredEvent = { ...event, stand: {}, other: { vrij: { "2025-10-01": 7 } } };
  const [, ...lines] = rows(buildDailySalesExport(elsewhere));
  assert.deepEqual(lines.map((line) => line.slice(3)), [["2025-10-01", "3", "7", "0", "0", "0", "7"]]);
});
