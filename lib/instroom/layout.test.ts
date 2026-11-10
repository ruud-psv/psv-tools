import { test } from "node:test";
import assert from "node:assert/strict";
import { SEAT_EXCLUDED, SEAT_GA, SEAT_SELLABLE, type EventSeatState } from "../ringside/seat-state";
import { layoutFromSeatState } from "./layout";

test("de stoelenkaart levert genummerde stoelen en de capaciteit van staanvakken", () => {
  const event: EventSeatState = {
    eventId: "e",
    name: "PSV - Go Ahead Eagles",
    eventDate: "2026-11-28T18:45:00+01:00",
    seats: {
      a: ["Vak A", "5", "12", SEAT_SELLABLE],
      geblokkeerd: ["A", "5", "13", 0],
      staan: ["U", "", "", SEAT_SELLABLE | SEAT_GA, 703],
      staan2: ["U", "", "", SEAT_GA, 20],
      buiten: ["A", "5", "14", SEAT_SELLABLE | SEAT_EXCLUDED],
      vreemd: ["A", "5A", "1", SEAT_SELLABLE],
    },
    tickets: {},
  };
  assert.deepEqual(layoutFromSeatState(event), {
    // Een geblokkeerde stoel is nog steeds een stoel.
    seats: [
      { area: "A", row: 5, seat: 12 },
      { area: "A", row: 5, seat: 13 },
    ],
    standing: { U: 723 },
    source: "PSV - Go Ahead Eagles",
  });
});
