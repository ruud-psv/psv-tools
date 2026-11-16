/**
 * Leest de wachtlijst in uit Ringside: één run binnen een tijdsbudget.
 *
 * Ringside kan niet op product filteren. Een run doet daarom drie dingen, elk
 * vanaf zijn eigen cursor:
 *
 * 1. **Producten** tot het eind: welk product is de wachtlijst?
 * 2. **Verkoop** (`/v1/sales`): alleen de regels van de wachtlijst blijven
 *    bewaard. De eerste keer is dat de hele stroom (ruim 15 miljoen regels, een
 *    paar uur in een ketting van runs); daarna alleen wat erbij kwam.
 * 3. **Klanten** (`/v1/clients`), voor geboortejaar en postcode van wie op de
 *    wachtlijst staat. Ook dat is de eerste keer de hele stroom. Daarna volgt
 *    een run de wijzigingen. Iemand die zich nieuw inschrijft maar al langer
 *    klant is, komt in die wijzigingen niet voor; daarvoor is af en toe een
 *    nieuwe volledige doorloop nodig (`needsClientsPass()`).
 *
 * Een HTTP 205 betekent dat SeatGeek de dataset ververst heeft: die stroom
 * begint dan opnieuw.
 */

import { readFeed } from "../ringside/feed";
import {
  applyClient,
  applyProducts,
  applySale,
  emptyWaitlistData,
  ownersToLookUp,
  waitlistOwners,
  type ClientFeedRow,
  type ProductFeedRow,
  type SalesFeedRow,
  type WaitlistData,
} from "./data";
import {
  isWaitlistLocked,
  readWaitlistData,
  readWaitlistState,
  writeWaitlistData,
  writeWaitlistState,
  type WaitlistState,
} from "./store";

/** Een volledige doorloop van de klanten hooguit eens per week, tenzij er veel ontbreken. */
const CLIENTS_PASS_INTERVAL_MS = 7 * 86_400_000;

/**
 * Of er een nieuwe volledige doorloop van `/v1/clients` nodig is: de eerste
 * keer, na een week, of als van meer dan 2% (en minstens 50 mensen) de
 * klantgegevens ontbreken.
 */
export function needsClientsPass(data: WaitlistData, missing: number, now: number): boolean {
  if (missing === 0) return false;
  if (!data.clientsPassDoneAt) return true;
  if (now - Date.parse(data.clientsPassDoneAt) > CLIENTS_PASS_INTERVAL_MS) return true;
  return missing >= Math.max(50, waitlistOwners(data, true).size * 0.02);
}

export interface WaitlistRunOptions {
  force?: boolean;
  /** `all`: alles opnieuw vanaf nul. `clients`: alleen de klanten opnieuw doorlopen. */
  restart?: "all" | "clients" | null;
  /** Kies de producten met de hand in plaats van op naam. Een lege lijst zet het terug op naam. */
  productIds?: string[] | null;
}

export interface WaitlistRunResult {
  productsRead: number;
  salesRead: number;
  clientsRead: number;
  /** Alles is bijgewerkt tot het eind van de stromen. */
  done: boolean;
  reset: boolean;
  /** Een fout onderweg; wat tot dan toe gelezen is, is wel opgeslagen. */
  error: string | null;
}

function sameSet(a: readonly string[] | null, b: readonly string[] | null): boolean {
  return JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());
}

function restartSales(data: WaitlistData): void {
  data.rows = {};
  data.salesCursor = null;
  data.salesRead = 0;
  data.salesComplete = false;
  data.salesCaughtUpAt = null;
}

function startClientsPass(data: WaitlistData, pending: string[]): void {
  data.clientsPass = "running";
  data.clientsCursor = null;
  data.clientsRead = 0;
  data.pending = pending;
  data.clientsPassStartedAt = new Date().toISOString();
}

/**
 * Eén run: laden, lezen tot de deadline, opslaan. Gooit alleen als de opslag
 * niet te lezen of te schrijven is; een fout van Ringside staat in `error`.
 */
export async function runWaitlistIngest(deadline: number, options: WaitlistRunOptions = {}): Promise<WaitlistRunResult> {
  let data = (await readWaitlistData()) ?? emptyWaitlistData();
  if (options.restart === "all") data = { ...emptyWaitlistData(), chosen: data.chosen };

  if (options.productIds) {
    const chosen = options.productIds.length ? options.productIds : null;
    if (!sameSet(chosen, data.chosen)) {
      data.chosen = chosen;
      data.products = {};
      data.productsCursor = null;
      restartSales(data);
    }
  }

  const result: WaitlistRunResult = { productsRead: 0, salesRead: 0, clientsRead: 0, done: false, reset: false, error: null };
  const thisYear = new Date().getFullYear();

  try {
    // 1. Producten.
    const products = await readFeed<ProductFeedRow>(
      "/v1/products",
      data.productsCursor,
      deadline,
      (rows) => {
        result.productsRead += rows.length;
        applyProducts(data, rows);
      },
      (cursor) => (data.productsCursor = cursor)
    );
    data.productsRead += result.productsRead;
    if (products.reset) {
      data.productsCursor = null;
      data.productsRead = 0;
      result.reset = true;
    }

    // 2. Verkoop, zodra bekend is welk product de wachtlijst is.
    const hasProducts = Object.keys(data.products).length > 0;
    let salesAtEnd = false;
    if (products.reachedEnd && hasProducts && Date.now() < deadline) {
      const sales = await readFeed<SalesFeedRow>(
        "/v1/sales",
        data.salesCursor,
        deadline,
        (rows) => {
          result.salesRead += rows.length;
          data.salesRead += rows.length;
          for (const row of rows) applySale(data, row);
        },
        (cursor) => (data.salesCursor = cursor)
      );
      if (sales.reset) {
        restartSales(data);
        result.reset = true;
      } else if (sales.reachedEnd) {
        salesAtEnd = true;
        data.salesComplete = true;
        data.salesCaughtUpAt = new Date().toISOString();
      }
    }

    // 3. Klanten, zodra de wachtlijst zelf compleet is.
    let clientsAtEnd = false;
    if (salesAtEnd && Date.now() < deadline) {
      if (data.clientsPass === "idle") {
        const missing = ownersToLookUp(data);
        if (options.restart === "clients") {
          data.unmatched = [];
          startClientsPass(data, ownersToLookUp(data));
        } else if (needsClientsPass(data, missing.length, Date.now())) {
          startClientsPass(data, missing);
        }
      }

      const wanted = waitlistOwners(data);
      // Zonder cursor en zonder doorloop valt er niets te volgen.
      if (wanted.size > 0 && (data.clientsPass === "running" || data.clientsCursor)) {
        const clients = await readFeed<ClientFeedRow>(
          "/v1/clients",
          data.clientsCursor,
          deadline,
          (rows) => {
            result.clientsRead += rows.length;
            data.clientsRead += rows.length;
            for (const row of rows) applyClient(data, row, wanted, thisYear);
          },
          (cursor) => (data.clientsCursor = cursor)
        );
        if (clients.reset) {
          startClientsPass(data, [...new Set([...data.pending, ...ownersToLookUp(data)])]);
          result.reset = true;
        } else if (clients.reachedEnd) {
          if (data.clientsPass === "running") {
            data.unmatched = [...new Set([...data.unmatched, ...data.pending.filter((owner) => !data.clients[owner])])];
            data.pending = [];
            data.clientsPass = "idle";
            data.clientsPassDoneAt = new Date().toISOString();
          }
          clientsAtEnd = true;
        }
      } else {
        clientsAtEnd = true;
      }
    }

    result.done = salesAtEnd && clientsAtEnd;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  // Ook na een fout: de cursors staan in hetzelfde bestand, dus wat gelezen is, blijft.
  await writeWaitlistData(data);
  return result;
}

export type LockedWaitlistOutcome =
  | { ran: false; state: WaitlistState }
  | { ran: true; state: WaitlistState; result: WaitlistRunResult | null; error: string | null };

/** Doet één run onder het slot. */
export async function runLockedWaitlistIngest(
  budgetMs: number,
  options: WaitlistRunOptions = {}
): Promise<LockedWaitlistOutcome> {
  const state = await readWaitlistState();
  if (isWaitlistLocked(state) && !options.force) return { ran: false, state };

  const deadline = Date.now() + budgetMs;
  state.runningUntil = new Date(deadline + 60_000).toISOString();
  await writeWaitlistState(state);

  let result: WaitlistRunResult | null = null;
  let error: string | null = null;
  try {
    result = await runWaitlistIngest(deadline, options);
    error = result.error;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  if (error) console.error("[wachtlijst]", error);

  state.runs += 1;
  state.lastRunAt = new Date().toISOString();
  state.lastError = error;
  state.runningUntil = null;
  await writeWaitlistState(state);
  return { ran: true, state, result, error };
}
