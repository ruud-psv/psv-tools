import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";
import { isRingsideConfigured } from "@/lib/ringside/auth";
import { runLockedSeatIngest } from "@/lib/ringside/seat-ingest";

/**
 * Houdt de stoelstatus van komende wedstrijden bij (zie `lib/ringside/seat-ingest.ts`).
 *
 * Draait als cron, en is met een ingelogde sessie ook handmatig te starten — zo
 * kan de eerste vulling direct na een deploy op gang geholpen worden. Die eerste
 * vulling leest de hele historie van stoelen en verkoop, en dat is meer dan één
 * serverless run aankan. Een run start daarom zelf de volgende, net als
 * `/api/ringside/ingest`, tot alles binnen is.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_BUDGET_SECONDS = 240;
const MAX_CHAIN = 400;
const DEFAULT_CHAIN = 20;

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
 * Waar de volgende run heen moet.
 *
 * Niet per se het adres waarop dit verzoek binnenkwam: de cron van Vercel roept
 * het eigen adres van de deployment aan (`psv-tools-<hash>.vercel.app`), en dat
 * zit achter Vercel-login. Een vervolgaanroep daarheen wordt doorgestuurd naar
 * de inlogpagina en start niets. In productie gaat hij daarom naar het vaste
 * productiedomein.
 */
function nextRunUrl(req: NextRequest, remaining: number): URL {
  const url = new URL(req.url);
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL_ENV === "production" && productionHost) {
    url.protocol = "https:";
    url.host = productionHost;
  }
  url.searchParams.set("chain", String(remaining));
  url.searchParams.delete("force");
  return url;
}

/**
 * Start de volgende run en wacht alleen tot het verzoek de deur uit is.
 *
 * Een run duurt minuten, dus een timeout is hier het verwachte geval. Komt er
 * binnen twee seconden wél een antwoord, dan is de run niet gestart — behalve
 * bij 409: dan loopt er al een, en dat is ook goed.
 */
async function startNextRun(req: NextRequest, remaining: number): Promise<boolean> {
  const url = nextRunUrl(req, remaining);

  const headers: Record<string, string> = {};
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) headers.authorization = `Bearer ${cronSecret}`;
  const cookie = req.headers.get("cookie");
  if (cookie) headers.cookie = cookie;

  try {
    const res = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
      redirect: "manual",
    });
    if (res.status === 409) return true;
    console.error(`[ringside/stoelen] volgende run niet gestart: ${url.host} gaf ${res.status}`);
    return false;
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") return true;
    console.error("[ringside/stoelen] volgende run niet gestart:", error instanceof Error ? error.message : error);
    return false;
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

  const outcome = await runLockedSeatIngest(budget * 1000, searchParams.get("force") === "1");
  if (!outcome.ran) {
    return NextResponse.json(
      {
        skipped: true,
        reason: "Er loopt al een run.",
        runningUntil: outcome.state.runningUntil,
      },
      { status: 409, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const { state, result, error, progressed } = outcome;
  const done = state.manifestsComplete && state.salesComplete;

  // `chain=0` zet de ketting uit; niet op falsy testen, anders valt juist die
  // stand terug op de standaard.
  const rawChain = searchParams.get("chain");
  const requested = rawChain === null ? DEFAULT_CHAIN : Number(rawChain);
  const chainRemaining = Number.isFinite(requested) ? Math.min(Math.max(requested, 0), MAX_CHAIN) : DEFAULT_CHAIN;
  // Doorpakken zolang er vooruitgang is, ook na een fout in één van de stromen:
  // die krijgt in de volgende run een nieuwe kans. Een run die niets las, stopt
  // de ketting, zodat een blijvende fout niet eindeloos herhaald wordt.
  const chained = !done && chainRemaining > 0 && progressed ? await startNextRun(req, chainRemaining - 1) : false;

  return NextResponse.json(
    {
      done,
      chained,
      chainRemaining: chained ? chainRemaining - 1 : 0,
      thisRun: {
        seconds: Math.round(((Date.now() - startedAt) / 1000) * 10) / 10,
        manifestsRead: result?.manifestsRead ?? 0,
        salesRead: result?.salesRead ?? 0,
        eventsChanged: result?.eventsChanged ?? 0,
        resets: result?.resets ?? [],
      },
      totals: {
        manifestsRead: state.manifestsRead,
        salesRead: state.salesRead,
        manifestsComplete: state.manifestsComplete,
        salesComplete: state.salesComplete,
        events: result?.events ?? null,
        runs: state.runs,
      },
      caughtUpAt: state.caughtUpAt,
      lastError: error,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
