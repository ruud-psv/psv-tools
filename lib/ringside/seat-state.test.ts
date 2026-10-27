import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyManifestCapacity,
  applyManifestRow,
  applySalesReservation,
  applySalesRow,
  ownerFingerprint,
  prunePastEvents,
  SEAT_GA,
  SEAT_SELLABLE,
  todayInAmsterdam,
  toNeighborInput,
  type EventStates,
  type SalesFeedRow,
} from "./seat-state";

const EVENT = "ccc50001-0033-e4d4-c1cb-08decc725255";
const PAST = "10e304bc-3de8-fb92-725a-08ddb49076f4";
const CUTOFF = "2026-10-12";

function manifest(id: string, extra: Record<string, unknown> = {}) {
  return {
    _ringside_operation: "I",
    manifest_id: id,
    event_id: EVENT.toUpperCase(),
    event_name: "PSV - Willem II",
    event_date: "2026-10-31T18:45:00",
    product_type: "Event",
    area: "N",
    row: "15",
    seat: "12",
    is_ga: false,
    is_counted_as_available: true,
    ...extra,
  };
}

function sale(id: string, extra: Partial<SalesFeedRow> = {}): SalesFeedRow {
  return {
    _ringside_operation: "I",
    sales_item_id: id,
    product_id: EVENT,
    manifest_id: "m1",
    area: "N",
    row: "15",
    seat: "12",
    item_type: "Ticket",
    sale_type: "Sale",
    current_status: true,
    forward_item_id: null,
    resale_status: null,
    own_client_guid: "0000508F-E239-E611-9417-005056844CAF",
    ...extra,
  };
}

const neverPast = () => false;

test("stoelen van komende wedstrijden worden bewaard, oude en series niet", () => {
  const events: EventStates = new Map();
  assert.equal(applyManifestRow(events, manifest("m1"), CUTOFF), EVENT);
  assert.equal(applyManifestRow(events, manifest("m2", { event_date: "2026-10-01T18:45:00" }), CUTOFF), null);
  assert.equal(applyManifestRow(events, manifest("m3", { product_type: "Series" }), CUTOFF), null);
  assert.deepEqual(Object.keys(events.get(EVENT)!.seats), ["m1"]);
  assert.deepEqual(events.get(EVENT)!.seats.m1, ["N", "15", "12", 1]);
});

test("een update vervangt de stoel en een delete haalt hem weg", () => {
  const events: EventStates = new Map();
  applyManifestRow(events, manifest("m1"), CUTOFF);
  applyManifestRow(events, manifest("m1", { _ringside_operation: "U", is_counted_as_available: false }), CUTOFF);
  assert.equal(events.get(EVENT)!.seats.m1[3], 0);
  assert.equal(applyManifestRow(events, { _ringside_operation: "D", manifest_id: "M1" }, CUTOFF), EVENT);
  assert.deepEqual(events.get(EVENT)!.seats, {});
});

test("alleen geldige tickets houden een stoel bezet", () => {
  const events: EventStates = new Map();
  assert.equal(applySalesRow(events, sale("s1"), neverPast), EVENT);
  assert.equal(applySalesRow(events, sale("s2", { sale_type: "Return" }), neverPast), null);
  assert.equal(applySalesRow(events, sale("s3", { item_type: "Membership" }), neverPast), null);
  assert.equal(applySalesRow(events, sale("s4", { forward_item_id: "s5" }), neverPast), null);
  assert.equal(applySalesRow(events, sale("s6", { sale_type: "Reservation" }), neverPast), EVENT);
  assert.deepEqual(Object.keys(events.get(EVENT)!.tickets).sort(), ["s1", "s6"]);
});

test("resale: eerst aangeboden, daarna doorverkocht", () => {
  const events: EventStates = new Map();
  applySalesRow(events, sale("s1", { resale_status: "Posted" }), neverPast);
  assert.equal(events.get(EVENT)!.tickets.s1[4], 1);

  // Doorverkocht: het oude ticket vervalt en de koper krijgt een nieuw.
  applySalesRow(
    events,
    sale("s1", { _ringside_operation: "U", resale_status: "Resold - Refunded", current_status: false }),
    neverPast
  );
  applySalesRow(events, sale("s2", { own_client_guid: "andere-koper" }), neverPast);
  assert.deepEqual(Object.keys(events.get(EVENT)!.tickets), ["s2"]);
  assert.equal(events.get(EVENT)!.tickets.s2[4], 0);
});

test("verkoop van een gespeelde wedstrijd valt af", () => {
  const events: EventStates = new Map();
  const isPast = (productId: string) => productId === PAST;
  assert.equal(applySalesRow(events, sale("s1", { product_id: PAST }), isPast), null);
  assert.equal(events.size, 0);
});

test("de eigenaar wordt gehasht en nooit zelf bewaard", () => {
  const events: EventStates = new Map();
  const guid = "0000508F-E239-E611-9417-005056844CAF";
  applySalesRow(events, sale("s1", { own_client_guid: guid }), neverPast);
  const owner = events.get(EVENT)!.tickets.s1[5];
  assert.equal(owner, ownerFingerprint(guid.toLowerCase()));
  assert.equal(owner.length, 16);
  assert.ok(!JSON.stringify(events.get(EVENT)).toLowerCase().includes(guid.toLowerCase()));
});

test("voorbije wedstrijden worden opgeruimd", () => {
  const events: EventStates = new Map();
  applyManifestRow(events, manifest("m1"), CUTOFF);
  applySalesRow(events, sale("s1", { product_id: PAST }), neverPast);
  const removed = prunePastEvents(events, "2026-11-01", new Map([[PAST, "2025-11-03 20:00:00"]]));
  assert.deepEqual(removed.sort(), [EVENT, PAST].sort());
});

test("toNeighborInput gebruikt de stoel uit de stoelenkaart en slaat staanvakken over", () => {
  const events: EventStates = new Map();
  applyManifestRow(events, manifest("m1"), CUTOFF);
  applyManifestRow(events, manifest("m2", { area: "U", row: "", seat: "", is_ga: true }), CUTOFF);
  // Het ticket zelf noemt een andere plek; de stoelenkaart wint.
  applySalesRow(events, sale("s1", { area: "X", row: "1", seat: "1" }), neverPast);
  // Een ticket zonder bekende stoelenkaart valt terug op zijn eigen velden.
  applySalesRow(events, sale("s2", { manifest_id: "onbekend", area: "n", row: "15", seat: "13" }), neverPast);

  const { seats, tickets } = toNeighborInput(events.get(EVENT)!);
  assert.deepEqual(seats, [{ area: "N", row: 15, seat: 12, sellable: true }]);
  assert.deepEqual(
    tickets.map((t) => t.key),
    ["N|15|12", "N|15|13"]
  );
});

test("vandaag in Nederland", () => {
  // 23:30 UTC op 12 oktober is al 13 oktober in Amsterdam.
  assert.equal(todayInAmsterdam(new Date("2026-10-12T23:30:00Z")), "2026-10-13");
});

test("staanvak: capaciteit wordt bewaard en later aangevuld", () => {
  const events: EventStates = new Map();
  applyManifestRow(events, manifest("ga", { area: "Noord", row: "", seat: "", is_ga: true, capacity: 703 }), CUTOFF);
  const event = events.get(EVENT)!;
  assert.deepEqual(event.seats.ga, ["Noord", "", "", SEAT_SELLABLE | SEAT_GA, 703]);

  // Een gewone stoel krijgt geen capaciteit mee.
  applyManifestRow(events, manifest("m9"), CUTOFF);
  assert.equal(event.seats.m9.length, 4);

  // Tweede ronde: alleen capaciteit en "telt niet mee", niet of hij te koop is.
  event.seats.ga = ["Noord", "", "", SEAT_GA];
  const changed = applyManifestCapacity(
    events,
    manifest("ga", { area: "Noord", row: "", seat: "", is_ga: true, capacity: 650, is_counted_as_available: true })
  );
  assert.equal(changed, EVENT);
  assert.deepEqual(event.seats.ga, ["Noord", "", "", SEAT_GA, 650]);
  assert.equal(applyManifestCapacity(events, manifest("onbekend", { capacity: 5 })), null);
});

test("openstaande reservering wordt bewaard en later aangevuld", () => {
  const events: EventStates = new Map();
  applySalesRow(events, sale("r1", { sale_type: "Reservation" }), neverPast);
  applySalesRow(events, sale("s1"), neverPast);
  const event = events.get(EVENT)!;
  assert.equal(event.tickets.r1[6], 1);
  assert.equal(event.tickets.s1.length, 6);

  // Bevestigd: geen reservering meer.
  applySalesRow(events, sale("r1", { _ringside_operation: "U", sale_type: "Reservation Confirmation" }), neverPast);
  assert.equal(event.tickets.r1.length, 6);

  // Tweede ronde: alleen de vlag, en alleen op een ticket dat al bekend is.
  assert.equal(applySalesReservation(events, sale("s1", { sale_type: "Reservation" })), EVENT);
  assert.equal(event.tickets.s1[6], 1);
  assert.equal(applySalesReservation(events, sale("s1", { sale_type: "Reservation" })), null);
  assert.equal(applySalesReservation(events, sale("onbekend", { sale_type: "Reservation" })), null);
});
