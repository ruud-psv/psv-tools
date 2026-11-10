import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";
import { isRingsideConfigured } from "@/lib/ringside/auth";
import { runSalesIngest, type SalesIngestResult } from "@/lib/ringside/sales-ingest";
import { summarizeResaleProbe } from "@/lib/ringside/sales-series";
import { isLocked, readState, writeState } from "@/lib/ringside/store";

/**
 * Leest de verkoop per dag in uit Ringside (zie `lib/ringside/sales-ingest.ts`).
 *
 * Draait als cron elk uur, en is met een ingelogde sessie ook handmatig te
 * starten. De eerste vulling is meer dan één serverless run aankan (maximaal
 * 300 seconden); een run start daarom zelf de volgende, tot alles binnen is.
 *
 * - `?restart=1` begint een nieuwe doorloop. De pagina's houden de oude cijfers
 *   tot de nieuwe compleet is.
 * - `?chain=50` maakt de ketting langer, `?chain=0` zet hem uit.
 * - `?force=1` negeert het slot van een run die vastligt.
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
  const budget = Math.min(Math.max(Number(searchParams.get("seconds")) || DEFAULT_BUDGET_SECONDS, 10), 280);
  const startedAt = Date.now();
  const deadline = startedAt + budget * 1000;
  const noStore = { "Cache-Control": "no-store, max-age=0" };

  const state = await readState();
  if (isLocked(state) && searchParams.get("force") !== "1") {
    return NextResponse.json(
      {
        skipped: true,
        reason: "Er loopt al een run.",
        runningUntil: state.runningUntil,
        note: "Twee runs tegelijk zouden dezelfde regels lezen en dubbel optellen. Gebruik ?force=1 als je zeker weet dat de vorige run vastligt.",
      },
      { status: 409, headers: noStore }
    );
  }

  // Slot meteen zetten, vóór het eerste leeswerk: anders glipt een gelijktijdige
  // run er alsnog tussendoor. Ruimer dan het budget, zodat het opslaan aan het
  // eind er nog binnen valt.
  state.runningUntil = new Date(deadline + 60_000).toISOString();
  await writeState(state);

  let result: SalesIngestResult | null = null;
  try {
    result = await runSalesIngest(state, deadline, { restart: searchParams.get("restart") === "1" });
    state.lastError = result.error;
  } catch (error) {
    // De opslag was niet te lezen of te schrijven. Er is niets veranderd.
    state.lastError = error instanceof Error ? error.message : String(error);
  }
  if (state.lastError) console.error("[ringside/ingest]", state.lastError);

  state.runs += 1;
  state.runningUntil = null;
  await writeState(state);

  const done = Boolean(result?.caughtUp);
  // Alleen doorpakken zolang er vooruitgang is: een run die niets las en geen
  // fout gaf, zou de ketting anders laten doorlopen zonder iets te bereiken.
  const progressed = Boolean(result && (result.productsRead > 0 || result.salesRead > 0 || result.reset));
  // `chain=0` zet de ketting uit; niet op falsy testen, anders valt juist die
  // stand terug op de standaard.
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
      mode: state.mode,
      // Of de pagina's cijfers hebben: een complete doorloop staat klaar.
      live: state.salesComplete,
      published: Boolean(result?.published),
      reset: Boolean(result?.reset),
      chained,
      chainRemaining: chained ? chainRemaining - 1 : 0,
      thisRun: {
        seconds: Math.round(((Date.now() - startedAt) / 1000) * 10) / 10,
        productsRead: result?.productsRead ?? 0,
        salesRead: result?.salesRead ?? 0,
      },
      totals: {
        productsRead: state.productsRead,
        salesRowsRead: state.rowsRead,
        runs: state.runs,
        resets: state.resets,
        lastResetAt: state.lastResetAt,
        caughtUpAt: state.caughtUpAt,
      },
      salesDateSeen: state.salesDateSeen,
      // Controles op de aannames achter het optellen; zie `docs/ticketing-verloop.md`.
      check: {
        outOfOrder: state.check.outOfOrder,
        unknownProduct: state.check.unknownProduct,
        resale: state.mode === "live" && state.resaleSummary ? state.resaleSummary : summarizeResaleProbe(state.resaleProbe),
      },
      lastError: state.lastError,
      note: result?.reset
        ? "SeatGeek heeft de dataset ververst. De doorloop begint opnieuw; de pagina's houden de oude cijfers tot hij klaar is."
        : done
          ? "Alles ingelezen. De cron houdt het bij."
          : chained
            ? `Nog niet klaar, maar de volgende run is gestart. Nog ${chainRemaining - 1} in de ketting.`
            : "Nog niet klaar. Roep deze route opnieuw aan, of geef ?chain=50 mee om hem zichzelf te laten doorzetten.",
    },
    { headers: noStore }
  );
}
