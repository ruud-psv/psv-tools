import { test } from "node:test";
import assert from "node:assert/strict";
import { seatKey, type Holder, type TicketInfo } from "./neighbors";
import { resaleRows, toResaleCsv } from "./resale";

function ticket(area: string, row: number, seat: number, extra: Partial<TicketInfo> = {}): TicketInfo {
  return { key: seatKey(area, row, seat)!, resalePosted: false, owner: null, ...extra };
}

test("alleen aangeboden en doorverkochte kaarten, gesorteerd, met relatienummer van de stoel", () => {
  const holders: Holder[] = [
    { relationNumber: "111", area: "C", row: 8, seat: 2 },
    { relationNumber: "222", area: "A", row: 1, seat: 5 },
  ];
  const tickets = [
    ticket("C", 8, 1),
    ticket("C", 8, 2, { resalePosted: true, salesItemId: "s2" }),
    ticket("A", 1, 5, { resaleBought: true, salesItemId: "s3" }),
    ticket("RSA", 1, 1, { resaleBought: true, resalePosted: true, salesItemId: "s4" }),
  ];
  assert.deepEqual(resaleRows(tickets, holders), [
    { area: "A", row: 1, seat: 5, status: "doorverkocht", salesItemId: "s3", relationNumber: "222" },
    { area: "C", row: 8, seat: 2, status: "aangeboden", salesItemId: "s2", relationNumber: "111" },
    // Ook uitgesloten vakken: de export is om naast Unify te leggen.
    {
      area: "RSA",
      row: 1,
      seat: 1,
      status: "doorverkocht, opnieuw aangeboden",
      salesItemId: "s4",
      relationNumber: null,
    },
  ]);
});

test("CSV voor Excel", () => {
  const csv = toResaleCsv([
    { area: "C", row: 8, seat: 2, status: "aangeboden", salesItemId: "s2", relationNumber: "111" },
    { area: "D", row: 1, seat: 3, status: "doorverkocht", salesItemId: "s3", relationNumber: null },
  ]);
  assert.equal(
    csv,
    "﻿vak;rij;stoel;status;sales_item_id;relatienummer\r\nC;8;2;aangeboden;s2;111\r\nD;1;3;doorverkocht;s3;\r\n"
  );
});
