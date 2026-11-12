import { NextRequest, NextResponse } from "next/server";
import { runLockedEffectIngest } from "@/lib/aangrenzende-stoelen/effect-ingest";
import { isRingsideConfigured } from "@/lib/ringside/auth";
import { chainRemaining, isCronOrSession, startNextRun } from "@/lib/ringside/chain";
import { EVENT_ID } from "@/lib/ticketing-stadion/load";

/**
 * Leest de ticketregels van één thuiswedstrijd in, voor het effect van een mail
 * over aangrenzende stoelen (zie `lib/aangrenzende-stoelen/effect-ingest.ts`).
 *
 * Geen cron: dit gebeurt alleen op verzoek. Iemand met een login kiest op de
 * pagina een wedstrijd en start het. De hele stroom `/v1/sales` moet worden
 * doorgelopen, en dat is meer dan één serverless run aankan; een run start
 * daarom zelf de volgende, tot alles binnen is.
 *
 * - `?productId=<id>` kiest de wedstrijd (verplicht bij de eerste keer). Een
 *   andere dan er stond, vervangt hem.
 * - `?restart=1` begint voor deze wedstrijd opnieuw.
 * - `?chain=0` doet één run; `?force=1` negeert het slot.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_BUDGET_SECONDS = 240;
const MAX_CHAIN = 400;
/** Ruim: bij vier minuten per run is dit een kleine zeven uur, en de ketting stopt zelf als alles binnen is. */
const DEFAULT_CHAIN = 100;

export async function GET(req: NextRequest) {
  if (!isCronOrSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isRingsideConfigured()) {
    return NextResponse.json({ error: "Ringside is niet geconfigureerd." }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId")?.trim().toLowerCase() || null;
  if (productId && !EVENT_ID.test(productId)) {
    return NextResponse.json({ error: "Onbekende wedstrijd." }, { status: 400 });
  }
  const budget = Math.min(Math.max(Number(searchParams.get("seconds")) || DEFAULT_BUDGET_SECONDS, 10), 280);
  const startedAt = Date.now();

  const outcome = await runLockedEffectIngest(budget * 1000, {
    force: searchParams.get("force") === "1",
    restart: searchParams.get("restart") === "1",
    productId,
  });
  if (!outcome.ran) {
    return NextResponse.json(
      { skipped: true, reason: "Er loopt al een run.", runningUntil: outcome.state.runningUntil },
      { status: 409, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const { state, result, error, progressed } = outcome;
  // Doorpakken zolang er vooruitgang is. Een run die niets las, stopt de
  // ketting, zodat een blijvende fout niet eindeloos herhaald wordt.
  const remaining = chainRemaining(searchParams.get("chain"), DEFAULT_CHAIN, MAX_CHAIN);
  const chained =
    !state.salesComplete && remaining > 0 && progressed
      ? await startNextRun(req, remaining - 1, "aangrenzende-stoelen/effect")
      : false;

  return NextResponse.json(
    {
      done: state.salesComplete,
      chained,
      chainRemaining: chained ? remaining - 1 : 0,
      match: { productId: state.productId, name: state.name, eventDate: state.eventDate },
      thisRun: {
        seconds: Math.round(((Date.now() - startedAt) / 1000) * 10) / 10,
        salesRead: result?.salesRead ?? 0,
        reset: result?.reset ?? false,
      },
      totals: { salesRead: state.salesRead, salesComplete: state.salesComplete, tickets: state.tickets, runs: state.runs },
      lastError: error,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
