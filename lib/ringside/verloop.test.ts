import { test } from "node:test";
import assert from "node:assert/strict";
import { applySalesPage, toEventSales, type StoredEvent } from "./sales-series";
import { hourKey, seriesFromSeatState, timelinePoint } from "./seat-series";
import { applySalesDay, applySalesReservation, applySalesRow, type EventSeatState, type EventStates, type SalesFeedRow } from "./seat-state";
import { updateVerloop, type VerloopDeps } from "./verloop-refresh";
import type { EventTimeline, SeatSeriesFile } from "./verloop-store";

const MATCH = "300e0601-0006-ad5f-dd90-08decd2c20fe";
const never = () => false;

function row(n: number, extra: SalesFeedRow = {}): SalesFeedRow {
  return {
    sales_item_id: `item-${n}`,
    product_id: MATCH,
    manifest_id: `seat-${n}`,
    area: "HH",
    row: "1",
    seat: String(n),
    item_type: "Ticket",
    sale_type: "Sale",
    current_status: true,
    forward_item_id: null,
    transaction_date: "2026-11-10T09:00:00",
    ...extra,
  };
}

function match(rows: SalesFeedRow[], name = "PSV - Ajax"): { events: EventStates; event: EventSeatState } {
  const events: EventStates = new Map();
  for (const r of rows) applySalesRow(events, r, never);
  const event = events.get(MATCH)!;
  event.name = name;
  event.eventDate = "2026-11-28T18:45:00+01:00";
  return { events, event };
}

test("ticket bewaart dag en reeks; een reservering telt niet als verkoop", () => {
  const { event } = match([
    row(1),
    row(2, { subscription_instance_id: "abc", transaction_date: "2026-08-04T08:00:00" }),
    row(3, { is_venue_resale: true, transaction_date: "2026-11-11T23:30:00" }),
    row(4, { sale_type: "Reservation" }),
    row(5, { area: "Parkeren P1" }),
  ]);
  assert.deepEqual(event.tickets["item-1"].slice(6), [0, "2026-11-10", 0]);
  assert.deepEqual(event.tickets["item-4"].slice(6), [1, "2026-11-10", 0]);
  assert.deepEqual(seriesFromSeatState(event), {
    stand: { vrij: { "2026-11-10": 1 }, seizoenkaart: { "2026-08-04": 1 }, resale: { "2026-11-12": 1 } },
    other: { vrij: { "2026-11-10": 1 } },
  });
});

test("laatste versie wint: een gewijzigd ticket telt één keer, een retour gaat eraf", () => {
  const { events, event } = match([row(1), row(2)]);
  applySalesRow(events, row(1, { resale_status: "Posted" }), never);
  applySalesRow(events, row(2, { current_status: false, sale_type: "Return" }), never);
  assert.deepEqual(seriesFromSeatState(event), { stand: { vrij: { "2026-11-10": 1 } }, other: {} });
});

test("doorverkocht: verkoper op de oorspronkelijke dag, koper op de resaledag", () => {
  const { events, event } = match([row(1, { transaction_date: "2026-11-01T10:00:00" })]);
  applySalesRow(events, row(1, { transaction_date: "2026-11-01T10:00:00", current_status: false, resale_status: "Resold - Refunded" }), never);
  applySalesRow(events, row(9, { manifest_id: "seat-1", is_venue_resale: true, transaction_date: "2026-11-09T10:00:00" }), never);

  assert.deepEqual(Object.keys(event.tickets), ["item-9"]);
  assert.deepEqual(event.resold, { "item-1": ["2026-11-01", 0, "HH"] });
  assert.deepEqual(seriesFromSeatState(event), {
    stand: { resale: { "2026-11-09": 1 }, vrij: { "2026-11-01": 1 } },
    other: {},
  });

  // De verkoop-ingest telt hetzelfde.
  const stored: Record<string, StoredEvent> = {
    [MATCH]: { productId: MATCH, name: "PSV - Ajax", eventDate: "2026-11-28 18:45:00", productType: "Event", category: "Wedstrijden", season: "26/27", stand: {}, other: {} },
  };
  applySalesPage(stored, [
    { ...row(1, { transaction_date: "2026-11-01T10:00:00", current_status: false, resale_status: "Resold - Refunded" }), product_item_id: "a" },
    { ...row(1, { sale_type: "Return", current_status: false, resale_status: "Resold - Refunded" }), product_item_id: "a" },
    { ...row(9, { is_venue_resale: true, transaction_date: "2026-11-09T10:00:00" }), product_item_id: "b" },
  ]);
  assert.deepEqual(stored[MATCH].stand, seriesFromSeatState(event)!.stand);
});

test("inhaalronde: vult dag en reeks aan en houdt de reservering", () => {
  const { events, event } = match([row(1, { transaction_date: undefined }), row(2, { transaction_date: undefined, sale_type: "Reservation" })]);
  assert.equal(seriesFromSeatState(event), null);

  assert.equal(applySalesDay(events, row(1)), MATCH);
  assert.equal(applySalesDay(events, row(2, { sale_type: "Reservation" })), MATCH);
  assert.equal(applySalesDay(events, row(1)), null);
  assert.equal(applySalesDay(events, row(7)), null);
  assert.deepEqual(event.tickets["item-2"].slice(6), [1, "2026-11-10", 0]);

  // Een bevestigde reservering houdt zijn dag.
  applySalesReservation(events, row(2, { sale_type: "Reservation Confirmation" }));
  assert.deepEqual(event.tickets["item-2"].slice(6), [0, "2026-11-10", 0]);

  assert.equal(applySalesDay(events, row(8, { current_status: false, resale_status: "Resold - Refunded" })), MATCH);
  assert.deepEqual(event.resold, { "item-8": ["2026-11-10", 0, "HH"] });
});

function memory(file: SeatSeriesFile | null = null) {
  const timelines = new Map<string, EventTimeline>();
  const state = { file };
  const deps: VerloopDeps = {
    readSeatSeries: async () => (state.file ? structuredClone(state.file) : null),
    writeSeatSeries: async (next) => void (state.file = structuredClone(next)),
    readTimeline: async (id) => structuredClone(timelines.get(id) ?? null),
    writeTimeline: async (timeline) => void timelines.set(timeline.eventId, structuredClone(timeline)),
  };
  return { deps, state, timelines };
}

test("verloop: reeksen van komende wedstrijden en één meting per uur", async () => {
  const { events } = match([row(1), row(2, { resale_status: "Posted" })]);
  const m = memory();
  const at = (time: string) => ({ events, leaving: [], complete: true, now: new Date(time) });

  assert.deepEqual(await updateVerloop(at("2026-11-11T14:05:00Z"), m.deps), { frozen: 0, upcoming: 1, measured: 1 });
  assert.deepEqual(await updateVerloop(at("2026-11-11T14:20:00Z"), m.deps), { frozen: 0, upcoming: 1, measured: 0 });
  assert.deepEqual(await updateVerloop(at("2026-11-11T15:05:00Z"), m.deps), { frozen: 0, upcoming: 1, measured: 1 });

  assert.deepEqual(m.timelines.get(MATCH)!.points.map((point) => point[0]), ["2026-11-11T14", "2026-11-11T15"]);
  // [uur, capaciteit, verkocht, gereserveerd, vrij, aangeboden]
  assert.deepEqual(timelinePoint(events.get(MATCH)!, new Date("2026-11-11T14:05:00Z")), ["2026-11-11T14", 0, 2, 0, 0, 1]);
  assert.equal(hourKey(new Date("2026-11-11T14:59:59Z")), "2026-11-11T14");
  assert.deepEqual(m.state.file!.upcoming[MATCH].stand, { vrij: { "2026-11-10": 2 } });
});

test("verloop: onvolledige stoelstatus houdt de vorige reeksen en meet niet", async () => {
  const { events } = match([row(1)]);
  const m = memory();
  await updateVerloop({ events, leaving: [], complete: true, now: new Date("2026-11-11T14:05:00Z") }, m.deps);

  events.get(MATCH)!.tickets = {};
  const result = await updateVerloop({ events, leaving: [], complete: false, now: new Date("2026-11-11T16:05:00Z") }, m.deps);
  assert.deepEqual(result, { frozen: 0, upcoming: 1, measured: 0 });
  assert.deepEqual(m.state.file!.upcoming[MATCH].stand, { vrij: { "2026-11-10": 1 } });
  assert.equal(m.timelines.get(MATCH)!.points.length, 1);
});

test("verloop: gespeelde wedstrijd wordt bevroren, een stadiontour niet", async () => {
  const { events, event } = match([row(1)]);
  const m = memory();
  await updateVerloop({ events, leaving: [], complete: true, now: new Date("2026-11-28T14:05:00Z") }, m.deps);

  const tour: EventSeatState = { eventId: "tour", name: "Stadiontour", eventDate: "2026-11-28", seats: {}, tickets: {} };
  const result = await updateVerloop({ events: new Map(), leaving: [event, tour], complete: true, now: new Date("2026-11-29T02:05:00Z") }, m.deps);
  assert.deepEqual(result, { frozen: 1, upcoming: 0, measured: 0 });
  assert.deepEqual(Object.keys(m.state.file!.frozen), [MATCH]);
  assert.deepEqual(m.state.file!.upcoming, {});
});

test("pagina's lezen de reeks uit de stoelstatus over de opgetelde heen", () => {
  const stored: StoredEvent = {
    productId: MATCH, name: "PSV - Ajax", eventDate: "2026-11-28 18:45:00", productType: "Event", category: "Wedstrijden", season: "26/27",
    stand: { vrij: { "2026-11-10": 5 } }, other: {},
  };
  const fromSeats = { stand: { vrij: { "2026-11-10": 3 } }, other: {} };
  assert.equal(toEventSales({ ...stored, ...fromSeats }).total, 3);
});
