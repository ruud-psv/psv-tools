import { test } from "node:test";
import assert from "node:assert/strict";
import { occupancyByArea } from "./occupancy";
import type { EventSeatState, SeatTuple, TicketTuple } from "../ringside/seat-state";

function event(seats: Record<string, SeatTuple>, tickets: Record<string, TicketTuple>): EventSeatState {
  return { eventId: "e", name: "Jong PSV - FC Den Bosch", eventDate: "2026-11-07 14:00", seats, tickets };
}

function tickets(manifestId: string, area: string, count: number, posted = 0, prefix = manifestId) {
  const result: Record<string, TicketTuple> = {};
  for (let i = 0; i < count; i++) result[`${prefix}-${i}`] = [manifestId, area, "", "", i < posted ? 1 : 0, ""];
  return result;
}

test("staanvak: capaciteit uit één rij, tickets tellen af", () => {
  const result = occupancyByArea(
    event({ m1: ["Noord", "", "", 1 | 2, 700] }, { ...tickets("m1", "Noord", 250, 10) })
  );
  assert.deepEqual(result.areas, [
    { area: "NOORD", standing: true, capacity: 700, sellable: 700, sold: 250, resale: 10, free: 450 },
  ]);
  assert.equal(result.total.free, 450);
});

test("geblokkeerd vak telt niet als vrij, uitgesloten rij telt nergens", () => {
  const result = occupancyByArea(
    event(
      {
        m1: ["Oost", "", "", 2, 300],
        m2: ["Oost", "", "", 1 | 2 | 4, 50],
      },
      {}
    )
  );
  assert.deepEqual(result.areas[0], { area: "OOST", standing: true, capacity: 300, sellable: 0, sold: 0, resale: 0, free: 0 });
});

test("genummerde stoelen: capaciteit 1, vrij per stoel", () => {
  const result = occupancyByArea(
    event(
      { s1: ["A", "1", "1", 1], s2: ["A", "1", "2", 1], s3: ["A", "1", "3", 0] },
      { t1: ["s1", "A", "1", "1", 0, ""] }
    )
  );
  assert.deepEqual(result.areas[0], { area: "A", standing: false, capacity: 3, sellable: 2, sold: 1, resale: 0, free: 1 });
});

test("ticket zonder bekende rij telt mee bij zijn eigen vak", () => {
  const result = occupancyByArea(event({ m1: ["Zuid", "", "", 3, 100] }, { t1: ["onbekend", "zuid", "", "", 0, ""] }));
  assert.equal(result.areas[0].sold, 1);
  assert.equal(result.areas[0].free, 100);
  assert.equal(result.ticketsWithoutManifest, 1);
});

test("meer tickets dan capaciteit geeft geen negatief aantal vrij", () => {
  const result = occupancyByArea(event({ m1: ["West", "", "", 3, 5] }, tickets("m1", "West", 7)));
  assert.equal(result.areas[0].free, 0);
  assert.equal(result.areas[0].sold, 7);
});
