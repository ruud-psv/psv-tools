import { NextRequest, NextResponse } from "next/server";
import { isRingsideConfigured } from "@/lib/ringside/auth";
import { chainRemaining, isCronOrSession, startNextRun } from "@/lib/ringside/chain";
import { EVENT_ID } from "@/lib/ticketing-stadion/load";
import { runLockedWaitlistIngest } from "@/lib/wachtlijst/ingest";
import { readWaitlistData } from "@/lib/wachtlijst/store";
import { waitlistStatus } from "@/lib/wachtlijst/status";

/**
 * Leest de wachtlijst in uit Ringside (zie `lib/wachtlijst/ingest.ts`). Cron
 * elke nacht, en met een login ook met de hand te starten.
 *
 * De eerste keer moet de hele stroom `/v1/sales` en daarna `/v1/clients`
 * worden doorgelopen. Dat past niet in één serverless run; een run start
 * daarom zelf de volgende, tot alles binnen is.
 *
 * - `?restart=1` begint helemaal opnieuw; `?restart=clients` loopt alleen de
 *   klantgegevens opnieuw door.
 * - `?productId=<id>[,<id>]` kiest het product met de hand als de naam niet op
 *   "wachtlijst" past. `?productId=auto` zet het terug op naam.
 * - `?chain=0` doet één run; `?force=1` negeert het slot.
 * - `?seconds=` is het budget van de eerste run. De knop op de pagina vraagt
 *   een korte run, zodat hij snel antwoord krijgt. De vervolgruns van de
 *   ketting krijgen altijd het volle budget: de parameter gaat in de ketting
 *   wel mee, en met twintig seconden per run komt de eerste vulling niet af.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_BUDGET_SECONDS = 240;
const MAX_CHAIN = 400;
const DEFAULT_CHAIN = 150;

export async function GET(req: NextRequest) {
  if (!isCronOrSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isRingsideConfigured()) {
    return NextResponse.json({ error: "Ringside is niet geconfigureerd." }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const rawProducts = searchParams.get("productId")?.trim().toLowerCase() ?? "";
  const productIds = rawProducts === "auto" ? [] : rawProducts ? rawProducts.split(",").map((id) => id.trim()) : null;
  if (productIds?.some((id) => !EVENT_ID.test(id))) {
    return NextResponse.json({ error: "Onbekend product." }, { status: 400 });
  }
  const restartParam = searchParams.get("restart");
  const restart = restartParam === "1" ? "all" : restartParam === "clients" ? "clients" : null;
  // Een vervolgrun herken je aan `chain` boven nul; `chain=0` is een losse run met de hand.
  const chainedRun = Number(searchParams.get("chain")) > 0;
  const requestedSeconds = chainedRun ? 0 : Number(searchParams.get("seconds"));
  const budget = Math.min(Math.max(requestedSeconds || DEFAULT_BUDGET_SECONDS, 10), 280);
  const startedAt = Date.now();

  const outcome = await runLockedWaitlistIngest(budget * 1000, {
    force: searchParams.get("force") === "1",
    restart,
    productIds,
  });
  if (!outcome.ran) {
    return NextResponse.json(
      { skipped: true, reason: "Er loopt al een run.", runningUntil: outcome.state.runningUntil },
      { status: 409, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const { state, result, error } = outcome;
  const progressed = Boolean(result && result.productsRead + result.salesRead + result.clientsRead > 0);
  // Doorpakken zolang er vooruitgang is. Een run die niets las, stopt de
  // ketting, zodat een blijvende fout niet eindeloos herhaald wordt.
  const remaining = chainRemaining(searchParams.get("chain"), DEFAULT_CHAIN, MAX_CHAIN);
  const data = await readWaitlistData().catch(() => null);
  const status = waitlistStatus(data, state);
  const chained =
    !result?.done && status.phase !== "geen-product" && remaining > 0 && progressed
      ? await startNextRun(req, remaining - 1, "wachtlijst")
      : false;

  return NextResponse.json(
    {
      done: result?.done ?? false,
      chained,
      chainRemaining: chained ? remaining - 1 : 0,
      thisRun: { seconds: Math.round(((Date.now() - startedAt) / 1000) * 10) / 10, ...result },
      status,
      lastError: error,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
