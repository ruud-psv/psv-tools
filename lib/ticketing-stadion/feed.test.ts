import { test } from "node:test";
import assert from "node:assert/strict";
import { toFeedEvents } from "./feed";
import type { StadionMatch } from "./summary";

const occ = (capacity: number, sold: number, free: number) => ({ capacity, sellable: capacity, sold, reserved: 0, resale: 0, free });

function match(eventId: string, name: string, eventDate: string, sold: number, free: number): StadionMatch {
  return { eventId, name, eventDate, total: occ(35000, sold, free), areas: [], otherTotal: occ(0, 0, 0) };
}

test("komende wedstrijden in de vorm van de oude feed, eerstvolgende eerst", () => {
  const events = toFeedEvents(
    [
      match("b", "PSV - AZ", "2026-11-29 16:45:00", 30000, 5000),
      match("a", "PSV - Ajax", "2026-11-08 14:30:00", 35000, 0),
      match("old", "PSV - NEC", "2026-10-01 20:00:00", 1, 1),
    ],
    "2026-11-02",
    "2026-11-02T10:00:00Z"
  );
  assert.deepEqual(
    events.map((e) => [e.eventId, e.eventName, e.eventDate, e.soldTickets, e.availableCapacity, e.saleStatus]),
    [
      ["a", "PSV - Ajax", "2026-11-08T14:30:00", 35000, 0, "Uitverkocht"],
      ["b", "PSV - AZ", "2026-11-29T16:45:00", 30000, 5000, "Open"],
    ]
  );
  assert.equal(events[0].category, "Wedstrijden");
  assert.equal(events[0].totalCapacity, 35000);
});
