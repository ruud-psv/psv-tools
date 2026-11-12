/**
 * Leest de ticketregels van één wedstrijd in uit Ringside, voor het effect van
 * een mail over aangrenzende stoelen. Op verzoek: iemand kiest de wedstrijd op
 * de pagina Aangrenzende stoelen.
 *
 * Ringside kan niet op wedstrijd filteren, en de stoelstatus bewaart geen
 * verkoopmoment en wist een wedstrijd zodra hij gespeeld is. Dus wordt
 * `/v1/sales` één keer helemaal doorgelopen en blijven alleen de regels van
 * deze wedstrijd bewaard (`applyEffectSale()`). Dat is een paar uur werk, in
 * een ketting van runs, net als de instroom (`lib/instroom/ingest.ts`). Daarna
 * is bijwerken vanaf de cursor een kwestie van seconden.
 *
 * Een HTTP 205 betekent dat SeatGeek de dataset ververst heeft: de stroom
 * begint opnieuw en de data van deze wedstrijd ook. De cursor schuift pas op
 * nadat de data is opgeslagen.
 */

import { isPsvHomeMatch } from "./events";
import { applyEffectSale, emptyEffectData, type EffectSalesRow } from "./effect-data";
import {
  EMPTY_EFFECT_STATE,
  isEffectLocked,
  readEffectData,
  readEffectState,
  writeEffectData,
  writeEffectState,
  type EffectIngestState,
} from "./effect-store";
import { seasonOf } from "../ringside/daily-sales";
import { readFeed } from "../ringside/feed";
import { readKnownProducts } from "../ringside/store";

/** Het seizoen waaruit je kunt kiezen. */
export const EFFECT_SEASON = "26/27";

export interface EffectMatch {
  productId: string;
  name: string;
  eventDate: string;
}

/**
 * De thuiswedstrijden van PSV 1 in een seizoen, gespeeld en komend, de laatste
 * bovenaan. Uit de productenlijst van de verkoop per dag.
 */
export function effectMatches<T extends EffectMatch>(products: Iterable<T>, season: string = EFFECT_SEASON): EffectMatch[] {
  return [...products]
    .filter((product) => isPsvHomeMatch(product.name) && seasonOf(product.eventDate) === season)
    .map(({ productId, name, eventDate }) => ({ productId, name, eventDate }))
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate) || a.name.localeCompare(b.name));
}

/**
 * Zet de gekozen wedstrijd in de toestand. Zonder `productId` gaat het inlezen
 * verder met de wedstrijd die er al stond. Een andere wedstrijd begint opnieuw,
 * of gaat verder vanaf zijn eigen cursor als hij al eens helemaal is ingelezen.
 */
async function resolveTarget(state: EffectIngestState, productId: string | null): Promise<void> {
  if (!productId || productId === state.productId) {
    if (state.productId) return;
    throw new Error("Kies eerst een wedstrijd.");
  }

  const match = effectMatches(await readKnownProducts()).find((candidate) => candidate.productId === productId);
  if (!match) throw new Error("Deze wedstrijd staat niet in de lijst met thuiswedstrijden.");

  const ready = state.ready[match.productId];
  Object.assign(state, {
    productId: match.productId,
    name: match.name,
    eventDate: match.eventDate,
    salesCursor: ready?.cursor ?? null,
    salesComplete: Boolean(ready),
    salesRead: 0,
    tickets: ready?.tickets ?? 0,
  });
}

export interface EffectRunResult {
  salesRead: number;
  reset: boolean;
}

/**
 * Eén run: laden, de stroom lezen tot de deadline, opslaan.
 *
 * Past `state` aan maar slaat hem niet op; dat doet de aanroeper, die ook het
 * slot beheert.
 */
export async function runEffectIngest(state: EffectIngestState, deadline: number): Promise<EffectRunResult> {
  const target = state.productId;
  if (!target) throw new Error("Er is nog geen wedstrijd gekozen om in te lezen.");
  // Een verse start begint leeg: wat er nog van een eerdere ronde lag, zou
  // anders blijven staan als het inmiddels uit de stroom is.
  const fresh = !state.salesCursor && state.salesRead === 0;
  const data = (fresh ? null : await readEffectData(target)) ?? emptyEffectData(target);

  let cursor = state.salesCursor;
  let changed = fresh;
  let rows = 0;
  let failure: unknown = null;
  let reachedEnd = false;
  let reset = false;
  try {
    const result = await readFeed<EffectSalesRow>(
      "/v1/sales",
      cursor,
      deadline,
      (page) => {
        rows += page.length;
        for (const row of page) if (applyEffectSale(data, row)) changed = true;
      },
      (next) => (cursor = next)
    );
    reachedEnd = result.reachedEnd;
    reset = result.reset;
  } catch (error) {
    failure = error;
  }

  if (reset) {
    cursor = null;
    data.tickets = {};
    changed = true;
  }
  if (changed) await writeEffectData(data);

  // Pas nu de data veilig staat, mag de voortgang mee.
  state.salesCursor = cursor;
  state.salesRead += rows;
  state.tickets = Object.keys(data.tickets).length;
  if (reset) {
    state.salesComplete = false;
    delete state.ready[target];
  } else if (reachedEnd) {
    state.salesComplete = true;
    state.ready[target] = {
      name: state.name ?? "",
      eventDate: state.eventDate ?? "",
      tickets: state.tickets,
      caughtUpAt: new Date().toISOString(),
      cursor,
    };
  } else if (state.ready[target]) {
    // Bijwerken van een wedstrijd die al klaar was: de cursor schuift mee.
    state.ready[target] = { ...state.ready[target], tickets: state.tickets, cursor };
  }

  if (failure) throw failure;
  return { salesRead: rows, reset };
}

export type LockedEffectOutcome =
  | { ran: false; state: EffectIngestState }
  | {
      ran: true;
      state: EffectIngestState;
      result: EffectRunResult | null;
      error: string | null;
      /** Of deze run rijen heeft gelezen, ook als hij daarna een fout gaf. */
      progressed: boolean;
    };

export interface EffectRunOptions {
  force?: boolean;
  /** Begin voor deze wedstrijd opnieuw vanaf het begin van de stroom. */
  restart?: boolean;
  productId?: string | null;
}

/** Doet één run onder het slot en slaat de toestand op. */
export async function runLockedEffectIngest(
  budgetMs: number,
  { force = false, restart = false, productId = null }: EffectRunOptions = {}
): Promise<LockedEffectOutcome> {
  const state = await readEffectState();
  if (isEffectLocked(state) && !force) return { ran: false, state };

  try {
    await resolveTarget(state, productId);
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : String(caught);
    console.error("[aangrenzende-stoelen/effect]", error);
    state.runs += 1;
    state.lastError = error;
    await writeEffectState(state);
    return { ran: true, state, result: null, error, progressed: false };
  }

  if (restart && state.productId) {
    delete state.ready[state.productId];
    Object.assign(state, {
      salesCursor: EMPTY_EFFECT_STATE.salesCursor,
      salesComplete: false,
      salesRead: 0,
      tickets: 0,
    });
  }

  const deadline = Date.now() + budgetMs;
  // Slot meteen zetten, vóór het eerste leeswerk; ruim genoeg dat het opslaan
  // aan het eind er nog binnen valt.
  state.runningUntil = new Date(deadline + 60_000).toISOString();
  await writeEffectState(state);

  const readBefore = state.salesRead;
  let result: EffectRunResult | null = null;
  let error: string | null = null;
  try {
    result = await runEffectIngest(state, deadline);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
    console.error("[aangrenzende-stoelen/effect]", error);
  }

  state.runs += 1;
  state.lastError = error;
  state.runningUntil = null;
  await writeEffectState(state);
  return { ran: true, state, result, error, progressed: state.salesRead > readBefore };
}
