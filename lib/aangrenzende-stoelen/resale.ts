import { seatKey, type Holder, type TicketInfo } from "./neighbors";

/**
 * De resale van één wedstrijd als lijst: welke kaarten nu in de resale staan
 * en welke al zijn doorverkocht. Bedoeld om naast Unify te leggen, dus per
 * ticket één regel, ook in de vakken die Aangrenzende stoelen verder
 * uitsluit.
 *
 * - **aangeboden**: `resale_status = 'Posted'`, het ticket is nog geldig.
 * - **doorverkocht**: het ticket van de koper (`is_venue_resale = true`). De
 *   kaart van de verkoper bestaat dan niet meer als geldig ticket.
 * - **doorverkocht, opnieuw aangeboden**: de koper biedt hem zelf weer aan.
 *
 * Het relatienummer komt uit de lijst seizoenkaarthouders, op de stoel. Bij
 * een doorverkochte stoel is dat dus de verkoper, niet de koper. Een stoel die
 * niet op die lijst staat, heeft geen relatienummer.
 */

export type ResaleStatus = "aangeboden" | "doorverkocht" | "doorverkocht, opnieuw aangeboden";

export interface ResaleRow {
  area: string;
  row: number;
  seat: number;
  status: ResaleStatus;
  salesItemId: string;
  relationNumber: string | null;
}

function statusOf(ticket: TicketInfo): ResaleStatus | null {
  if (ticket.resaleBought) return ticket.resalePosted ? "doorverkocht, opnieuw aangeboden" : "doorverkocht";
  return ticket.resalePosted ? "aangeboden" : null;
}

export function resaleRows(tickets: Iterable<TicketInfo>, holders: readonly Holder[]): ResaleRow[] {
  const holderByKey = new Map<string, Holder>();
  for (const holder of holders) {
    const key = seatKey(holder.area, holder.row, holder.seat);
    if (key) holderByKey.set(key, holder);
  }

  const rows: ResaleRow[] = [];
  for (const ticket of tickets) {
    const status = statusOf(ticket);
    if (!status) continue;
    const [area, row, seat] = ticket.key.split("|");
    rows.push({
      area,
      row: Number(row),
      seat: Number(seat),
      status,
      salesItemId: ticket.salesItemId ?? "",
      relationNumber: holderByKey.get(ticket.key)?.relationNumber ?? null,
    });
  }
  return rows.sort(
    (a, b) => a.area.localeCompare(b.area) || a.row - b.row || a.seat - b.seat || a.salesItemId.localeCompare(b.salesItemId)
  );
}

/** CSV voor Excel, net als `toCsv()`: puntkomma, BOM en Windows-regeleinden. */
export function toResaleCsv(rows: readonly ResaleRow[]): string {
  const header = ["vak", "rij", "stoel", "status", "sales_item_id", "relatienummer"];
  const lines = rows.map((row) =>
    [row.area, row.row, row.seat, row.status, row.salesItemId, row.relationNumber ?? ""].join(";")
  );
  return `﻿${[header.join(";"), ...lines].join("\r\n")}\r\n`;
}
