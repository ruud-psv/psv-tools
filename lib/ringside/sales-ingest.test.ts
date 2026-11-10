import { test } from "node:test";
import assert from "node:assert/strict";
import { applyProducts, runSalesIngest, type SalesIngestDeps } from "./sales-ingest";
import { toEventSales, type StoredEvent } from "./sales-series";
import {
  CorruptStoreError,
  EMPTY_STATE,
  decodeSalesData,
  emptySalesData,
  encodeSalesData,
  type IngestState,
  type SalesData,
  type SalesDataKind,
} from "./store";

const MATCH = "300e0601-0006-ad5f-dd90-08decd2c20fe";
const FAR = Date.now() + 60_000;

const PRODUCT = {
  product_id: MATCH.toUpperCase(),
  product_type: "Event",
  product_description: "PSV - Excelsior Rotterdam",
  event_date: "2026-11-28 18:45:00",
};

function sale(n: number, extra: Record<string, unknown> = {}) {
  return {
    sales_item_id: `0000${n}`,
    product_id: MATCH,
    product_item_id: `ticket-${n}`,
    transaction_date: "2026-11-10T09:00:00",
    item_type: "Ticket",
    sale_type: "Sale",
    current_status: true,
    forward_item_id: null,
    area: "HH",
    ...extra,
  };
}

type Step = { rows?: unknown[]; cursor?: string; end?: boolean; reset?: boolean; fail?: string };

/** Een opslag en een stroom in het geheugen. */
function harness(feeds: Record<string, Step[]>, stored: Partial<Record<SalesDataKind, SalesData | "corrupt">> = {}) {
  const store = new Map<SalesDataKind, SalesData | "corrupt">(Object.entries(stored) as [SalesDataKind, SalesData][]);
  const cursors: Record<string, (string | null)[]> = {};
  const deps: SalesIngestDeps = {
    async readFeed(path, cursor, _deadline, onRows, onCursor) {
      (cursors[path] ??= []).push(cursor);
      let rows = 0;
      for (const step of feeds[path] ?? [{ end: true }]) {
        if (step.fail) throw new Error(step.fail);
        if (step.reset) return { rows, reachedEnd: false, reset: true };
        onRows((step.rows ?? []) as never[]);
        rows += step.rows?.length ?? 0;
        if (step.cursor) onCursor(step.cursor);
        if (step.end) return { rows, reachedEnd: true, reset: false };
      }
      return { rows, reachedEnd: false, reset: false };
    },
    async readSalesData(kind) {
      const value = store.get(kind);
      if (value === "corrupt") throw new CorruptStoreError(kind, new Error("kapot"));
      return value ? structuredClone(value) : null;
    },
    async writeSalesData(kind, data) {
      store.set(kind, structuredClone(data));
    },
  };
  return { deps, store, cursors };
}

function state(extra: Partial<IngestState> = {}): IngestState {
  return { ...structuredClone(EMPTY_STATE), ...extra };
}

function total(data: SalesData | "corrupt" | undefined): number {
  assert.ok(data && data !== "corrupt");
  return toEventSales(data.events[MATCH]).total;
}

test("producten: naam en datum bijwerken, tellingen blijven staan", () => {
  const events: Record<string, StoredEvent> = {};
  applyProducts(events, [PRODUCT, { product_id: "zonder-datum", product_type: "Merchandise" }]);
  assert.deepEqual(Object.keys(events), [MATCH]);
  assert.equal(events[MATCH].season, "26/27");

  events[MATCH].stand = { vrij: { "2026-11-10": 4 } };
  applyProducts(events, [{ ...PRODUCT, event_date: "2026-11-29 14:30:00" }]);
  assert.equal(events[MATCH].eventDate, "2026-11-29 14:30:00");
  assert.deepEqual(events[MATCH].stand, { vrij: { "2026-11-10": 4 } });
});

test("eerste vulling: bouwt op in work en zet pas aan het eind live", async () => {
  const s = state();
  const first = harness({
    "/v1/products": [{ rows: [PRODUCT], cursor: "p1", end: true }],
    "/v1/sales": [{ rows: [sale(1), sale(2)], cursor: "s1" }],
  });
  const one = await runSalesIngest(s, FAR, {}, first.deps);
  assert.deepEqual([one.salesRead, one.caughtUp, one.published], [2, false, false]);
  assert.equal(first.store.has("live"), false);
  assert.equal(total(first.store.get("work")), 2);
  assert.equal(s.salesComplete, false);

  const second = harness(
    { "/v1/products": [{ end: true }], "/v1/sales": [{ rows: [sale(3)], cursor: "s2", end: true }] },
    { work: first.store.get("work") as SalesData }
  );
  const two = await runSalesIngest(s, FAR, {}, second.deps);
  assert.deepEqual([two.caughtUp, two.published], [true, true]);
  // Verder vanaf de cursor die bij de tellingen is opgeslagen.
  assert.deepEqual(second.cursors["/v1/sales"], ["s1"]);
  assert.equal(total(second.store.get("live")), 3);
  assert.deepEqual([s.mode, s.salesComplete, s.rowsRead], ["live", true, 3]);
  assert.equal(s.check.outOfOrder, 0);
});

test("bijhouden: leest en schrijft live, en volgt nieuwe producten", async () => {
  const live: SalesData = { productsCursor: "p1", salesCursor: "s2", events: {} };
  const h = harness(
    {
      "/v1/products": [{ rows: [PRODUCT], cursor: "p2", end: true }],
      "/v1/sales": [{ rows: [sale(9)], cursor: "s3", end: true }],
    },
    { live }
  );
  const s = state({ mode: "live", salesComplete: true, productsComplete: true });
  const result = await runSalesIngest(s, FAR, {}, h.deps);
  assert.deepEqual([result.caughtUp, result.published], [true, false]);
  assert.deepEqual(h.cursors["/v1/products"], ["p1"]);
  assert.equal(total(h.store.get("live")), 1);
  assert.equal(h.store.has("work"), false);
});

test("ververste dataset (205): opnieuw beginnen, live blijft staan", async () => {
  const events: Record<string, StoredEvent> = {};
  applyProducts(events, [PRODUCT]);
  events[MATCH].stand = { vrij: { "2026-11-01": 500 } };
  const live: SalesData = { productsCursor: "p1", salesCursor: "oud", events };
  const h = harness({ "/v1/sales": [{ reset: true }] }, { live });
  const s = state({ mode: "live", salesComplete: true, productsComplete: true, rowsRead: 15_000_000 });

  const result = await runSalesIngest(s, FAR, {}, h.deps);
  assert.equal(result.reset, true);
  assert.equal(total(h.store.get("live")), 500);
  const work = h.store.get("work") as SalesData;
  assert.equal(work.salesCursor, null);
  assert.equal(work.productsCursor, "p1");
  assert.equal(total(work), 0);
  assert.deepEqual([s.mode, s.salesComplete, s.rowsRead, s.resets], ["backfill", true, 0, 1]);
});

test("een onleesbaar bestand is een fout en wordt niet leeg overschreven", async () => {
  const h = harness({ "/v1/sales": [{ rows: [sale(1)], end: true }] }, { live: "corrupt" });
  const s = state({ mode: "live", salesComplete: true });
  await assert.rejects(runSalesIngest(s, FAR, {}, h.deps), CorruptStoreError);
  assert.equal(h.store.get("live"), "corrupt");
  assert.equal(h.store.has("work"), false);
});

test("live is weg: opnieuw opbouwen", async () => {
  const h = harness({
    "/v1/products": [{ rows: [PRODUCT], cursor: "p1", end: true }],
    "/v1/sales": [{ rows: [sale(1)], cursor: "s1" }],
  });
  const s = state({ mode: "live", salesComplete: true, rowsRead: 99 });
  await runSalesIngest(s, FAR, {}, h.deps);
  assert.deepEqual([s.mode, s.salesComplete, s.rowsRead], ["backfill", false, 1]);
  assert.equal(total(h.store.get("work")), 1);
});

test("fout halverwege: wat gelezen is blijft, met de cursor erbij", async () => {
  const h = harness({
    "/v1/products": [{ rows: [PRODUCT], cursor: "p1", end: true }],
    "/v1/sales": [{ rows: [sale(1)], cursor: "s1" }, { fail: "Ringside /v1/sales gaf 503" }],
  });
  const s = state();
  const result = await runSalesIngest(s, FAR, {}, h.deps);
  assert.equal(result.error, "Ringside /v1/sales gaf 503");
  const work = h.store.get("work") as SalesData;
  assert.equal(work.salesCursor, "s1");
  assert.equal(total(work), 1);
});

test("verkoop wacht tot de productenlijst bij is", async () => {
  const h = harness({ "/v1/products": [{ rows: [PRODUCT], cursor: "p1" }], "/v1/sales": [{ rows: [sale(1)], end: true }] });
  const result = await runSalesIngest(state(), FAR, {}, h.deps);
  assert.equal(result.salesRead, 0);
  assert.equal(h.cursors["/v1/sales"], undefined);
});

test("herstart: nieuwe doorloop, live blijft staan tot hij klaar is", async () => {
  const events: Record<string, StoredEvent> = {};
  applyProducts(events, [PRODUCT]);
  events[MATCH].stand = { vrij: { "2026-11-01": 500 } };
  const h = harness(
    { "/v1/products": [{ rows: [PRODUCT], cursor: "p1", end: true }], "/v1/sales": [{ rows: [sale(1)], cursor: "s1" }] },
    { live: { productsCursor: "p9", salesCursor: "s9", events } }
  );
  const s = state({ mode: "live", salesComplete: true });
  await runSalesIngest(s, FAR, { restart: true }, h.deps);
  assert.deepEqual(h.cursors["/v1/products"], [null]);
  assert.equal(total(h.store.get("live")), 500);
  assert.equal(total(h.store.get("work")), 1);
  assert.deepEqual([s.mode, s.salesComplete], ["backfill", true]);
});

test("volgorde: een regel die niet oploopt wordt geteld als afwijking", async () => {
  const h = harness({
    "/v1/products": [{ rows: [PRODUCT], end: true }],
    "/v1/sales": [{ rows: [sale(1), sale(3), sale(2), sale(3)], cursor: "s1" }],
  });
  const s = state();
  await runSalesIngest(s, FAR, {}, h.deps);
  assert.equal(s.check.outOfOrder, 1);
});

test("opslag: gecomprimeerd heen en terug, en onzin wordt geweigerd", () => {
  const data = emptySalesData();
  applyProducts(data.events, [PRODUCT]);
  data.salesCursor = "s1";
  assert.deepEqual(decodeSalesData(encodeSalesData(data)), data);
  assert.throws(() => decodeSalesData(Buffer.from("geen gzip")));
  assert.throws(() => decodeSalesData(encodeSalesData({} as SalesData)));
});
