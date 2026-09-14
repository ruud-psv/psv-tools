import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";
import { RingsideAuthError, isRingsideConfigured } from "@/lib/ringside/auth";
import { ringsidePages } from "@/lib/ringside/client";
import { getProductDisplayName } from "@/lib/ringside/products";
import { isSoldTicket } from "@/lib/ringside/sales";
import { categorizeProduct } from "@/lib/ringside/ticket-events";
import { seasonOf } from "@/lib/ringside/daily-sales";
import {
  mergeOffsets,
  readEventSales,
  isLocked,
  readState,
  totalOf,
  writeEventSales,
  writeState,
  type EventSales,
  type IngestState,
} from "@/lib/ringside/store";

/**
 * Leest de Ringside-verkoop in stappen in.
 *
 * De verkooptabel is niet op datum geordend maar op sleutel: in de eerste
 * 110.000 rijen zaten transacties van 2015 tot 2026 door elkaar. De rijen van
 * één wedstrijd liggen dus verspreid over de hele tabel, en compleet worden kan
 * alleen door hem één keer helemaal door te lopen. Met ruim 2.300 rijen per
 * seconde is dat werk van uren, niet van minuten — maar eenmalig, want daarna
 * blijft de cursor staan en volstaat bijhouden.
 *
 * Elke run werkt daarom binnen een tijdsbudget, bewaart waar hij gebleven is en
 * telt de verkoop op bij wat er al lag. Meerdere runs samen maken het af.
 *
 * Producten gaan eerst: zonder de wedstrijddatum is er geen "dagen tot de
 * wedstrijd" om verkoop op te boeken.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_BUDGET_SECONDS = 240;

/** Bovengrens op de ketting. Bij vier minuten per run is dit ruim een dag werk. */
const MAX_CHAIN = 400;

/** Hoeveel runs een aanroep standaard achter elkaar zet: ruim een uur werk. */
const DEFAULT_CHAIN = 20;

/**
 * Toegang: de cron met het gedeelde geheim, of een ingelogde gebruiker. Dat
 * tweede is er zodat de eerste vulling handmatig op gang geholpen kan worden.
 */
function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (req.headers.get("authorization") === `Bearer ${cronSecret}`) return true;
    if (req.headers.get("x-cron-secret") === cronSecret) return true;
  }
  const cookie = req.cookies.get("psv_session")?.value;
  return Boolean(cookie && verifySessionToken(cookie));
}

interface ProductRow {
  product_id?: unknown;
  product_type?: unknown;
  product_description?: unknown;
  product_details?: unknown;
  event_date?: unknown;
}

interface SalesRow {
  product_id?: unknown;
  product_item_id?: unknown;
  transaction_date?: unknown;
  item_type?: unknown;
  sale_type?: unknown;
  current_status?: unknown;
  forward_item_id?: unknown;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** `product_id` is uuid in `products` en tekst in `sales`; kleine letters maken ze gelijk. */
function productKey(value: unknown): string | null {
  const raw = text(value);
  return raw ? raw.toLowerCase() : null;
}

function dayStart(value: string): number | null {
  const key = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
  }
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** Verwerkt productpagina's tot lege eventrecords, klaar om verkoop op te boeken. */
async function ingestProducts(
  state: IngestState,
  events: Record<string, EventSales>,
  deadline: number
): Promise<number> {
  let read = 0;

  for await (const page of ringsidePages<ProductRow>("/v1/products", {
    cursor: state.productsCursor ?? undefined,
    maxPages: 100_000,
  })) {
    read += page.data.length;

    for (const row of page.data) {
      const id = productKey(row.product_id);
      const eventDate = text(row.event_date);
      if (!id || !eventDate) continue;

      const productType = text(row.product_type) ?? "";
      const name = getProductDisplayName(row) ?? "Onbekend";
      const existing = events[id];

      events[id] = {
        productId: id,
        name,
        eventDate,
        productType,
        category: categorizeProduct(productType || null, name),
        season: seasonOf(eventDate),
        // Al ingelezen verkoop behouden: een product kan opnieuw langskomen.
        perOffset: existing?.perOffset ?? {},
        total: existing?.total ?? 0,
      };
    }

    state.productsCursor = page.cursor ?? state.productsCursor;
    if (!page.has_more) {
      state.productsComplete = true;
      break;
    }
    if (Date.now() > deadline) break;
  }

  state.productsRead += read;
  return read;
}

/** Boekt verkooppagina's op de eventrecords, per dagen-tot-de-wedstrijd. */
async function ingestSales(
  state: IngestState,
  events: Record<string, EventSales>,
  deadline: number
): Promise<number> {
  let read = 0;

  for await (const page of ringsidePages<SalesRow>("/v1/sales", {
    cursor: state.salesCursor ?? undefined,
    maxPages: 100_000,
  })) {
    read += page.data.length;

    // Per pagina eerst groeperen, dan één keer samenvoegen. Scheelt duizenden
    // kopieën van dezelfde objecten.
    const perProduct = new Map<string, Map<number, number>>();
    const seen = new Map<string, Set<string>>();

    for (const row of page.data) {
      if (!isSoldTicket(row)) continue;
      const id = productKey(row.product_id);
      if (!id) continue;

      const event = events[id];
      if (!event) continue; // Geen product bekend: geen wedstrijddatum, geen offset.

      const transaction = text(row.transaction_date);
      const eventStart = dayStart(event.eventDate);
      const transactionStart = transaction ? dayStart(transaction) : null;
      if (eventStart === null || transactionStart === null) continue;

      const offset = Math.round((eventStart - transactionStart) / DAY_MS);

      // Binnen een pagina ontdubbelen op ticket. Over pagina's heen kan dat
      // niet zonder alle ids te bewaren; de filters op sale_type,
      // current_status en forward_item_id zouden dat overbodig moeten maken.
      const itemId = text(row.product_item_id);
      if (itemId) {
        const key = `${id}|${offset}`;
        let ids = seen.get(key);
        if (!ids) {
          ids = new Set();
          seen.set(key, ids);
        }
        if (ids.has(itemId)) continue;
        ids.add(itemId);
      }

      let offsets = perProduct.get(id);
      if (!offsets) {
        offsets = new Map();
        perProduct.set(id, offsets);
      }
      offsets.set(offset, (offsets.get(offset) ?? 0) + 1);
    }

    for (const [id, offsets] of perProduct) {
      const event = events[id];
      event.perOffset = mergeOffsets(event.perOffset, offsets);
      event.total = totalOf(event.perOffset);
    }

    state.salesCursor = page.cursor ?? state.salesCursor;
    if (!page.has_more) {
      state.salesComplete = true;
      break;
    }
    if (Date.now() > deadline) break;
  }

  state.rowsRead += read;
  return read;
}

/**
 * Start de volgende run.
 *
 * Een serverless functie mag maximaal 300 seconden draaien, dus één aanroep
 * kan de tabel nooit afmaken. In plaats van dat handmatig te herhalen laat een
 * run de volgende zichzelf aanroepen. `remaining` telt af, zodat een fout in de
 * afbreekconditie niet tot een eindeloze ketting leidt.
 *
 * Bewust niet op het antwoord wachten: die run duurt minuten en deze is dan al
 * lang afgesloten. We wachten alleen tot het verzoek de deur uit is.
 */
async function startNextRun(req: NextRequest, remaining: number): Promise<boolean> {
  const url = new URL(req.url);
  url.searchParams.set("chain", String(remaining));
  url.searchParams.delete("restart");

  const headers: Record<string, string> = {};
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) headers.authorization = `Bearer ${cronSecret}`;
  // Zonder cron-geheim loopt de ketting op dezelfde sessie verder.
  const cookie = req.headers.get("cookie");
  if (cookie) headers.cookie = cookie;

  try {
    await fetch(url.toString(), {
      headers,
      // Het antwoord interesseert ons niet; afbreken zodra het verzoek staat.
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    return true;
  } catch (error) {
    // Een timeout is hier het verwachte geval en betekent dat de volgende run
    // is begonnen. Alleen een echte verbindingsfout is een probleem.
    return error instanceof Error && error.name === "TimeoutError";
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isRingsideConfigured()) {
    return NextResponse.json({ error: "Ringside is niet geconfigureerd." }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const budget = Math.min(
    Math.max(Number(searchParams.get("seconds")) || DEFAULT_BUDGET_SECONDS, 10),
    290
  );
  const startedAt = Date.now();
  const deadline = startedAt + budget * 1000;

  const state = searchParams.get("restart") === "1" ? { ...(await readState()), salesCursor: null, productsCursor: null, salesComplete: false, productsComplete: false, rowsRead: 0, productsRead: 0 } : await readState();
  const events = searchParams.get("restart") === "1" ? {} : await readEventSales();

  if (isLocked(state) && searchParams.get("force") !== "1") {
    return NextResponse.json(
      {
        skipped: true,
        reason: "Er loopt al een run.",
        runningUntil: state.runningUntil,
        note: "Twee runs tegelijk zouden dezelfde rijen lezen en dubbel optellen. Gebruik ?force=1 als je zeker weet dat de vorige run vastligt.",
      },
      { status: 409, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  // Slot meteen zetten, vóór het eerste leeswerk: anders glipt een gelijktijdige
  // run er alsnog tussendoor. Iets ruimer dan het budget, zodat het opslaan aan
  // het eind er nog binnen valt.
  state.runningUntil = new Date(deadline + 30_000).toISOString();
  await writeState(state);

  let productsRead = 0;
  let salesRead = 0;

  try {
    // Producten eerst: zonder wedstrijddatum is er geen as om verkoop op te
    // boeken, en verkoop van een onbekend product zou stilletjes wegvallen.
    if (!state.productsComplete) {
      productsRead = await ingestProducts(state, events, deadline);
    }
    if (state.productsComplete && Date.now() < deadline) {
      salesRead = await ingestSales(state, events, deadline);
    }
    state.lastError = null;
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error);
    if (error instanceof RingsideAuthError) console.error("[ringside/ingest]", state.lastError);
  }

  state.runs += 1;
  // Slot vrijgeven: de volgende run mag meteen door.
  state.runningUntil = null;

  // Ook na een fout opslaan: de voortgang tot dat punt is bruikbaar en scheelt
  // een volgende run het werk opnieuw te doen.
  await writeEventSales(events);
  await writeState(state);

  const done = state.productsComplete && state.salesComplete;

  // Alleen doorpakken zolang er vooruitgang is: een run die niets las en geen
  // fout gaf, zou de ketting anders laten doorlopen zonder iets te bereiken.
  const progressed = productsRead > 0 || salesRead > 0;
  // Standaard doorpakken: één aanroep hoort het karwei af te maken. `chain=0`
  // zet dat uit — niet op falsy testen, anders valt juist die stand terug op de
  // standaard.
  const rawChain = searchParams.get("chain");
  const requestedChain = rawChain === null ? DEFAULT_CHAIN : Number(rawChain);
  const chainRemaining = Number.isFinite(requestedChain)
    ? Math.min(Math.max(requestedChain, 0), MAX_CHAIN)
    : DEFAULT_CHAIN;
  const chainNext = !done && chainRemaining > 0 && progressed && !state.lastError;
  const chained = chainNext ? await startNextRun(req, chainRemaining - 1) : false;

  return NextResponse.json(
    {
      done,
      chained,
      chainRemaining: chained ? chainRemaining - 1 : 0,
      phase: state.productsComplete ? "sales" : "products",
      thisRun: {
        seconds: Math.round(((Date.now() - startedAt) / 1000) * 10) / 10,
        productsRead,
        salesRead,
      },
      totals: {
        productsRead: state.productsRead,
        salesRowsRead: state.rowsRead,
        events: Object.keys(events).length,
        runs: state.runs,
      },
      lastError: state.lastError,
      note: done
        ? "Alles ingelezen. Vanaf nu houdt de cron alleen nieuwe mutaties bij."
        : chained
          ? `Nog niet klaar, maar de volgende run is gestart. Nog ${chainRemaining - 1} in de ketting.`
          : "Nog niet klaar — roep deze route opnieuw aan, of geef ?chain=50 mee om hem zichzelf te laten doorzetten.",
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
