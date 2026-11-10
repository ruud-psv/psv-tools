import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amsterdamDay,
  applySalesPage,
  categoryOf,
  daysToOffsets,
  isStandTicket,
  probeResale,
  summarizeResaleProbe,
  toEventSales,
  type ResaleProbe,
  type SalesSeriesRow,
  type StoredEvent,
} from "./sales-series";

const MATCH = "300e0601-0006-ad5f-dd90-08decd2c20fe";

function event(name = "PSV - Excelsior Rotterdam", eventDate = "2026-11-28 18:45:00"): StoredEvent {
  return { productId: MATCH, name, eventDate, productType: "Event", category: "Wedstrijden", season: "26/27", stand: {}, other: {} };
}

let counter = 0;
function ticket(extra: SalesSeriesRow = {}): SalesSeriesRow {
  counter++;
  return {
    sales_item_id: `item-${counter}`,
    product_id: MATCH,
    product_item_id: `ticket-${counter}`,
    transaction_date: "2026-11-10T09:00:00.000000",
    item_type: "Ticket",
    sale_type: "Sale",
    current_status: true,
    forward_item_id: null,
    is_venue_resale: false,
    subscription_instance_id: null,
    price_type: "Normaal",
    price_type_group: null,
    area: "HH",
    ...extra,
  };
}

test("indeling: resale, vrijkaart, seizoenkaart, vrije verkoop", () => {
  assert.equal(categoryOf(ticket()), "vrij");
  assert.equal(categoryOf(ticket({ subscription_instance_id: "17700301-0095-9e30-ed0d-08deb64933c4" })), "seizoenkaart");
  assert.equal(categoryOf(ticket({ price_type_group: "Vrijkaarten", price_type: "Vrijkaarten" })), "vrijkaart");
  assert.equal(categoryOf(ticket({ price_type: "Vrijkaart Afspraak bestuur" })), "vrijkaart");
  assert.equal(categoryOf(ticket({ is_venue_resale: true })), "resale");
  // De eerste regel die past, wint.
  assert.equal(categoryOf(ticket({ is_venue_resale: true, subscription_instance_id: "x" })), "resale");
  assert.equal(categoryOf(ticket({ price_type_group: "Vrijkaarten", subscription_instance_id: "x" })), "vrijkaart");
});

test("transaction_date staat in UTC; de dag is de Nederlandse", () => {
  assert.equal(amsterdamDay("2026-11-10T09:00:00.000000"), "2026-11-10");
  // 23:30 UTC in de winter is 00:30 de volgende dag in Nederland.
  assert.equal(amsterdamDay("2026-11-10T23:30:00.000000"), "2026-11-11");
  // In de zomer scheelt het twee uur.
  assert.equal(amsterdamDay("2026-08-04T22:10:00"), "2026-08-05");
  assert.equal(amsterdamDay("2026-08-04T21:59:00"), "2026-08-04");
  assert.equal(amsterdamDay("2026-08-04"), "2026-08-04");
  assert.equal(amsterdamDay(null), null);
  assert.equal(amsterdamDay("geen datum"), null);
});

test("dagen tot de wedstrijd", () => {
  assert.deepEqual(daysToOffsets({ "2026-11-28": 3, "2026-11-21": 5, "2026-11-29": 1 }, "2026-11-28 18:45:00"), {
    "0": 3,
    "7": 5,
    "-1": 1,
  });
  // Over de wintertijd heen blijft het hele dagen.
  assert.deepEqual(daysToOffsets({ "2026-10-20": 2 }, "2026-10-27T20:00:00+01:00"), { "7": 2 });
  assert.deepEqual(daysToOffsets({ "2026-10-20": 2 }, ""), {});
});

test("tribune of niet", () => {
  assert.equal(isStandTicket("PSV - Ajax", "HH"), true);
  assert.equal(isStandTicket("PSV - Ajax", "hh "), true);
  assert.equal(isStandTicket("PSV - Ajax", "Parkeren P1"), false);
  assert.equal(isStandTicket("Jong PSV - VVV-Venlo 25/26", "Vak A"), true);
  assert.equal(isStandTicket("Jong PSV - VVV-Venlo 25/26", "Parkeren"), false);
  // Geen plattegrond bekend: alles telt.
  assert.equal(isStandTicket("Open training", "Zuid"), true);
});

test("een pagina optellen: alleen geldige tickets, per dag en reeks", () => {
  const events = { [MATCH]: event() };
  const result = applySalesPage(events, [
    ticket(),
    ticket({ transaction_date: "2026-11-11T10:00:00" }),
    ticket({ is_venue_resale: true }),
    ticket({ subscription_instance_id: "abc", transaction_date: "2026-08-04T08:54:24.517000" }),
    ticket({ area: "Parkeren P1" }),
    // Tellen niet: reservering, vervallen, doorgezet, geen ticket, onbekend product.
    ticket({ sale_type: "Reservation" }),
    ticket({ current_status: false, sale_type: "Return" }),
    ticket({ forward_item_id: "next" }),
    ticket({ item_type: "Membership" }),
    ticket({ product_id: "onbekend" }),
  ]);

  assert.equal(result.counted, 5);
  assert.equal(result.unknownProduct, 1);
  assert.equal(result.earliest, "2026-08-04T08:54:24.517000");
  assert.deepEqual(events[MATCH].stand, {
    vrij: { "2026-11-10": 1, "2026-11-11": 1 },
    resale: { "2026-11-10": 1 },
    seizoenkaart: { "2026-08-04": 1 },
  });
  assert.deepEqual(events[MATCH].other, { vrij: { "2026-11-10": 1 } });
});

test("hetzelfde ticket twee keer op een dag telt één keer", () => {
  const events = { [MATCH]: event() };
  const row = ticket();
  applySalesPage(events, [row, { ...row, sales_item_id: "andere-regel" }]);
  assert.deepEqual(events[MATCH].stand, { vrij: { "2026-11-10": 1 } });
});

test("product_id in hoofdletters hoort bij hetzelfde product", () => {
  const events = { [MATCH]: event() };
  applySalesPage(events, [ticket({ product_id: MATCH.toUpperCase() })]);
  assert.equal(toEventSales(events[MATCH]).total, 1);
});

test("voor de pagina's: reeksen tellen op tot het totaal, parkeren apart", () => {
  const stored = event();
  stored.stand = {
    vrij: { "2026-11-21": 10, "2026-11-28": 4 },
    resale: { "2026-11-21": 2 },
    seizoenkaart: { "2026-08-04": 20000 },
  };
  stored.other = { vrij: { "2026-11-21": 7 } };
  const sales = toEventSales(stored);

  assert.deepEqual(sales.series.vrij, { "7": 10, "0": 4 });
  assert.deepEqual(sales.series.resale, { "7": 2 });
  assert.deepEqual(sales.series.vrijkaart, {});
  assert.deepEqual(sales.perOffset, { "7": 12, "0": 4, "116": 20000 });
  assert.equal(sales.total, 20016);
  assert.equal(sales.otherTotal, 7);
});

test("past geen enkel vak op de plattegrond, dan telt alles", () => {
  const stored = event("Jong PSV - VVV-Venlo 25/26", "2025-09-19 20:00:00");
  stored.other = { vrijkaart: { "2025-09-18": 3 } };
  const sales = toEventSales(stored);
  assert.equal(sales.total, 3);
  assert.equal(sales.otherTotal, 0);
});

test("meting: houdt de kaart van de verkoper zijn oorspronkelijke datum?", () => {
  const probe: ResaleProbe = { sellers: {}, buyers: {} };
  probeResale(probe, [
    // Verkoper: vervallen kaart, oorspronkelijk gekocht op 1 november.
    ticket({ current_status: false, resale_status: "Resold - Refunded", primary_ticket_id: "AAAA-00", transaction_date: "2026-11-01T10:00:00" }),
    // Koper: via de resale op 9 november, wijst naar het ticket van de verkoper.
    ticket({ is_venue_resale: true, previous_ticket_id: "aaaa-00", transaction_date: "2026-11-09T10:00:00" }),
    // Buiten de steekproef.
    ticket({ is_venue_resale: true, previous_ticket_id: "bbbb-17" }),
  ]);
  const summary = summarizeResaleProbe(probe);
  assert.equal(summary.buyers, 1);
  assert.deepEqual(summary.matched, { primary_ticket_id: { pairs: 1, sellerEarlier: 1, sameDay: 0, sellerLater: 0 } });
});
