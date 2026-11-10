/**
 * Leest de tickets en scans van één gespeelde wedstrijd in uit Ringside.
 *
 * Ringside kan niet op wedstrijd filteren, en de stoelstatus bewaart een
 * wedstrijd niet meer zodra hij gespeeld is. Wie achteraf wil weten welke stoel
 * wanneer is gescand, moet dus `/v1/sales` en `/v1/attendance` één keer helemaal
 * doorlopen en alleen de rijen van die wedstrijd bewaren. Dat is uren werk, in
 * een ketting van runs: elke run werkt binnen een tijdsbudget en gaat verder
 * waar de vorige stopte. Daarna is een run binnen seconden bij.
 *
 * Zelfde afspraken als de stoelstatus (`lib/ringside/seat-ingest.ts`): een
 * HTTP 205 betekent dat SeatGeek de dataset ververst heeft en die stroom
 * opnieuw begint, en de cursors schuiven pas op nadat de data is opgeslagen.
 */

import { readFeed, type FeedResult } from "../ringside/feed";
import { readEventSales } from "../ringside/store";
import { describeTarget, findInstroomMatch } from "./match";
import {
  applyInstroomSale,
  applyInstroomScan,
  emptyInstroomData,
  type AttendanceFeedRow,
  type InstroomSalesRow,
} from "./state";
import {
  EMPTY_INSTROOM_STATE,
  isInstroomLocked,
  readInstroomData,
  readInstroomState,
  writeInstroomData,
  writeInstroomState,
  type InstroomState,
} from "./store";

export interface InstroomRunResult {
  salesRead: number;
  attendanceRead: number;
  resets: string[];
}

/**
 * Zoekt de wedstrijd op en zet hem in de toestand. Met een `productId` wordt
 * dat de wedstrijd; is het een andere dan er stond, dan begint het inlezen
 * opnieuw.
 */
async function resolveTarget(state: InstroomState, productId: string | null): Promise<void> {
  if (state.productId && (!productId || productId === state.productId)) return;

  const sales = await readEventSales();
  const event = productId ? sales[productId] : findInstroomMatch(sales);
  if (!event && !productId) {
    throw new Error(
      `${describeTarget()} staat niet in de productenlijst uit Ringside. Is de verkoop-ingest (/api/ringside/ingest) al klaar?`
    );
  }

  Object.assign(state, EMPTY_INSTROOM_STATE, {
    productId: event?.productId ?? productId,
    name: event?.name ?? null,
    eventDate: event?.eventDate ?? null,
    runs: state.runs,
  });
}

/**
 * Eén run: laden, beide stromen lezen tot de deadline, opslaan.
 *
 * Past `state` aan maar slaat hem niet op; dat doet de aanroeper, die ook het
 * slot beheert en de wedstrijd opzoekt.
 */
export async function runInstroomIngest(state: InstroomState, deadline: number): Promise<InstroomRunResult> {
  const target = state.productId;
  if (!target) throw new Error("Er is nog geen wedstrijd gekozen om in te lezen.");
  // Een verse start (ook na `?restart=1`) begint leeg: wat er nog van een eerdere
  // ronde lag, zou anders blijven staan als het inmiddels uit de stroom is.
  const fresh = !state.salesCursor && !state.attendanceCursor && state.salesRead + state.attendanceRead === 0;
  const data = (fresh ? null : await readInstroomData(target)) ?? emptyInstroomData(target);

  const cursors = { sales: state.salesCursor, attendance: state.attendanceCursor };
  const empty: FeedResult = { rows: 0, reachedEnd: false, reset: false };
  let changed = false;

  // `allSettled` en niet `all`: faalt de ene stroom, dan moet de andere eerst
  // stoppen voordat we opslaan.
  const [salesResult, attendanceResult] = await Promise.allSettled([
    readFeed<InstroomSalesRow>(
      "/v1/sales",
      cursors.sales,
      deadline,
      (rows) => {
        for (const row of rows) if (applyInstroomSale(data, row)) changed = true;
      },
      (cursor) => (cursors.sales = cursor)
    ),
    readFeed<AttendanceFeedRow>(
      "/v1/attendance",
      cursors.attendance,
      deadline,
      (rows) => {
        for (const row of rows) if (applyInstroomScan(data, row)) changed = true;
      },
      (cursor) => (cursors.attendance = cursor)
    ),
  ]);
  const sales = salesResult.status === "fulfilled" ? salesResult.value : empty;
  const attendance = attendanceResult.status === "fulfilled" ? attendanceResult.value : empty;

  const resets: string[] = [];
  if (sales.reset) {
    resets.push("sales");
    cursors.sales = null;
    data.tickets = {};
    changed = true;
  }
  if (attendance.reset) {
    resets.push("attendance");
    cursors.attendance = null;
    data.scans = {};
    changed = true;
  }

  if (changed) await writeInstroomData(data);

  // Pas nu de data veilig staat, mag de voortgang mee.
  state.salesCursor = cursors.sales;
  state.attendanceCursor = cursors.attendance;
  if (sales.reset) state.salesComplete = false;
  else if (sales.reachedEnd) state.salesComplete = true;
  if (attendance.reset) state.attendanceComplete = false;
  else if (attendance.reachedEnd) state.attendanceComplete = true;
  state.salesRead += sales.rows;
  state.attendanceRead += attendance.rows;
  state.tickets = Object.keys(data.tickets).length;
  state.scans = Object.keys(data.scans).length;

  // Een fout in één van de stromen pas melden nu het gelezen werk bewaard is.
  for (const result of [salesResult, attendanceResult]) {
    if (result.status === "rejected") throw result.reason;
  }

  return { salesRead: sales.rows, attendanceRead: attendance.rows, resets };
}

export type LockedInstroomOutcome =
  | { ran: false; state: InstroomState }
  | {
      ran: true;
      state: InstroomState;
      result: InstroomRunResult | null;
      error: string | null;
      /** Of deze run rijen heeft verwerkt, ook als één van de stromen een fout gaf. */
      progressed: boolean;
    };

export interface InstroomRunOptions {
  force?: boolean;
  /** Begin opnieuw vanaf het begin van beide stromen. */
  restart?: boolean;
  /** Een andere wedstrijd dan de vaste. */
  productId?: string | null;
}

/** Doet één run onder het slot en slaat de toestand op. */
export async function runLockedInstroomIngest(
  budgetMs: number,
  { force = false, restart = false, productId = null }: InstroomRunOptions = {}
): Promise<LockedInstroomOutcome> {
  const state = await readInstroomState();
  if (isInstroomLocked(state) && !force) return { ran: false, state };

  if (restart) Object.assign(state, EMPTY_INSTROOM_STATE, { runs: state.runs });

  // De wedstrijd opzoeken vóór het slot: dan staat hij er meteen in, en ziet de
  // pagina vanaf de eerste seconde dat het inlezen loopt.
  try {
    await resolveTarget(state, productId);
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : String(caught);
    console.error("[ringside/instroom]", error);
    state.runs += 1;
    state.lastError = error;
    await writeInstroomState(state);
    return { ran: true, state, result: null, error, progressed: false };
  }

  const deadline = Date.now() + budgetMs;
  // Slot meteen zetten, vóór het eerste leeswerk; ruim genoeg dat het opslaan
  // aan het eind er nog binnen valt.
  state.runningUntil = new Date(deadline + 60_000).toISOString();
  await writeInstroomState(state);

  const readBefore = state.salesRead + state.attendanceRead;
  let result: InstroomRunResult | null = null;
  let error: string | null = null;
  try {
    result = await runInstroomIngest(state, deadline);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
    console.error("[ringside/instroom]", error);
  }

  state.runs += 1;
  state.lastError = error;
  state.runningUntil = null;
  await writeInstroomState(state);
  return { ran: true, state, result, error, progressed: state.salesRead + state.attendanceRead > readBefore };
}
