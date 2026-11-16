import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWaitlistAnalysis } from "./analysis";
import {
  applyClient,
  applyProducts,
  applySale,
  birthYear,
  emptyWaitlistData,
  ownersToLookUp,
  postcodeCode,
  waitlistOwners,
  type SalesFeedRow,
} from "./data";
import { needsClientsPass } from "./ingest";

const PRODUCT = "11111111-1111-4111-8111-111111111111";

function withProduct() {
  const data = emptyWaitlistData();
  applyProducts(data, [
    { product_id: PRODUCT.toUpperCase(), product_type: "Memberships", product_description: "Wachtlijst seizoenkaart" },
    { product_id: "22222222-2222-4222-8222-222222222222", product_type: "Memberships", product_description: "PSV Fanclub" },
    { product_id: "33333333-3333-4333-8333-333333333333", product_type: "Event", product_description: "PSV - Ajax" },
  ]);
  return data;
}

function sale(id: string, client: string, date: string, extra: Partial<SalesFeedRow> = {}): SalesFeedRow {
  return {
    sales_item_id: id,
    product_id: PRODUCT,
    product_item_id: `item-${id}`,
    own_client_guid: client,
    transaction_date: `${date}T10:00:00`,
    last_touched_at: `${date}T10:00:00`,
    sale_type: "Sale",
    current_status: true,
    forward_item_id: null,
    ...extra,
  };
}

test("producten: de wachtlijst op naam, Memberships als kandidaat", () => {
  const data = withProduct();
  assert.deepEqual(Object.keys(data.products), [PRODUCT]);
  assert.equal(Object.keys(data.candidates).length, 2);
});

test("producten: met de hand gekozen gaat voor de naam", () => {
  const data = emptyWaitlistData();
  data.chosen = ["22222222-2222-4222-8222-222222222222"];
  applyProducts(data, [
    { product_id: PRODUCT, product_type: "Memberships", product_description: "Wachtlijst" },
    { product_id: "22222222-2222-4222-8222-222222222222", product_type: "Memberships", product_description: "SCC Lijst" },
  ]);
  assert.deepEqual(Object.keys(data.products), ["22222222-2222-4222-8222-222222222222"]);
});

test("verkoop: alleen het wachtlijst-product, latere versie vervangt, delete verwijdert", () => {
  const data = withProduct();
  assert.equal(applySale(data, sale("a", "c1", "2025-01-10", { product_id: "33333333-3333-4333-8333-333333333333" })), false);
  assert.equal(applySale(data, sale("a", "c1", "2025-01-10")), true);
  applySale(data, sale("a", "c1", "2025-01-10", { current_status: false }));
  assert.equal(Object.keys(data.rows).length, 1);
  assert.equal(waitlistOwners(data, true).size, 0);
  applySale(data, { sales_item_id: "a", _ringside_operation: "D" });
  assert.equal(Object.keys(data.rows).length, 0);
  assert.equal(data.columns.salesOwner, "own_client_guid");
});

test("geboortejaar en postcode", () => {
  assert.equal(birthYear("1988-04-02", 2026), 1988);
  assert.equal(birthYear("02-04-1988", 2026), 1988);
  assert.equal(birthYear("1900-01-01", 2026), null);
  assert.equal(birthYear("2030-01-01", 2026), null);
  assert.equal(postcodeCode("5616 nh", ""), "5616");
  assert.equal(postcodeCode("NL-5616NH", "Nederland"), "5616");
  assert.equal(postcodeCode("5616", "NL"), "5616");
  assert.equal(postcodeCode("3920", "België"), "BE");
  assert.equal(postcodeCode("3920", ""), "XX");
  assert.equal(postcodeCode("47533", "DE"), "DE");
  assert.equal(postcodeCode("", "NL"), "");
});

test("klanten: sleutelkolom wordt gevonden, alleen wie op de wachtlijst staat", () => {
  const data = withProduct();
  applySale(data, sale("a", "GUID-1", "2025-01-10"));
  const wanted = waitlistOwners(data);
  assert.equal(applyClient(data, { id: 5, client_guid: "guid-9", birth_date: "1990-01-01" }, wanted, 2026), false);
  assert.equal(
    applyClient(data, { id: 7, client_guid: "guid-1", date_of_birth: "1990-06-01", billing_postcode: "1011AB", postcode: "5616NH", country: "NL" }, wanted, 2026),
    true
  );
  assert.equal(data.columns.clientKey, "client_guid");
  assert.equal(data.columns.postcode, "postcode");
  assert.deepEqual(Object.values(data.clients), [[1990, "5616"]]);
  assert.deepEqual(ownersToLookUp(data), []);
});

test("analyse: omvang, verloop, leeftijd en postcode", () => {
  const data = withProduct();
  // c1: staat erop sinds januari 2025.
  applySale(data, sale("a", "c1", "2025-01-10"));
  // c2: ingeschreven in maart 2025, in juni 2026 eraf met een retourregel.
  applySale(data, sale("b", "c2", "2025-03-05", { current_status: false }));
  applySale(data, sale("b2", "c2", "2026-06-20", { product_item_id: "item-b", sale_type: "Return" }));
  // c3: doorgezet op dezelfde dag; telt als één doorlopende periode.
  applySale(data, sale("c", "c3", "2026-02-01", { forward_item_id: "x", last_touched_at: "2026-09-01T08:00:00" }));
  applySale(data, sale("c2", "c3", "2026-09-01", { sale_type: "Update - New" }));
  // c4: vervallen zonder retourregel; de uitstroom valt op last_touched_at.
  applySale(data, sale("d", "c4", "2026-10-01", { current_status: false, last_touched_at: "2026-10-20T08:00:00" }));
  // c5: twee geldende inschrijvingen, één persoon.
  applySale(data, sale("e", "c5", "2026-11-01"));
  applySale(data, sale("f", "c5", "2026-11-02"));

  const wanted = waitlistOwners(data);
  applyClient(data, { client_guid: "c1", birth_date: "1980-01-01", postcode: "5616 NH" }, wanted, 2026);
  applyClient(data, { client_guid: "c3", birth_date: "2010-01-01", postcode: "5701 AA" }, wanted, 2026);
  applyClient(data, { client_guid: "c5", birth_date: null, postcode: "3920", country: "BE" }, wanted, 2026);

  const analysis = buildWaitlistAnalysis(data, "2026-11-16");
  assert.equal(analysis.size.people, 3);
  assert.equal(analysis.size.signups, 4);
  assert.equal(analysis.size.everPeople, 5);

  assert.equal(analysis.flow.leftTotal, 2);
  assert.equal(analysis.flow.leftDateEstimated, 1);
  assert.equal(analysis.flow.firstSignup, "2025-01-10");
  assert.deepEqual(analysis.flow.last30, { joined: 1, left: 1 });
  const last = analysis.flow.months[analysis.flow.months.length - 1];
  assert.deepEqual(last, { month: "2026-11", joined: 1, left: 0, size: 3 });
  const june = analysis.flow.months.find((month) => month.month === "2026-06");
  assert.deepEqual(june, { month: "2026-06", joined: 0, left: 1, size: 2 });
  // c3 geeft geen uitstroom in september.
  assert.equal(analysis.flow.months.find((month) => month.month === "2026-09")?.left, 0);
  assert.equal(analysis.flow.sizeYearAgo, 2);

  assert.equal(analysis.age.known, 2);
  assert.equal(analysis.age.unknown, 1);
  assert.equal(analysis.age.average, 31);
  assert.equal(analysis.age.buckets.find((bucket) => bucket.label === "12-17")?.count, 1);

  assert.equal(analysis.postcode.netherlands, 2);
  assert.equal(analysis.postcode.belgium, 1);
  assert.deepEqual(analysis.postcode.regions, [
    { code: "56", count: 1 },
    { code: "57", count: 1 },
  ]);
  assert.equal(analysis.quality.peopleWithoutClient, 0);
});

test("een nieuwe doorloop van de klanten: eerste keer, na een week of bij veel ontbrekenden", () => {
  const data = withProduct();
  const now = Date.parse("2026-11-16T12:00:00Z");
  assert.equal(needsClientsPass(data, 0, now), false);
  assert.equal(needsClientsPass(data, 3, now), true);
  data.clientsPassDoneAt = "2026-11-14T12:00:00Z";
  assert.equal(needsClientsPass(data, 3, now), false);
  assert.equal(needsClientsPass(data, 60, now), true);
  data.clientsPassDoneAt = "2026-11-01T12:00:00Z";
  assert.equal(needsClientsPass(data, 3, now), true);
});
