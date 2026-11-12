import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { buildMailEffect, EffectError, parseEffectRequest } from "@/lib/aangrenzende-stoelen/effect-build";
import { EFFECT_SEASON, effectMatches } from "@/lib/aangrenzende-stoelen/effect-ingest";
import { isEffectLocked, readEffectState } from "@/lib/aangrenzende-stoelen/effect-store";
import { readHolderListMeta } from "@/lib/aangrenzende-stoelen/store";
import { BlobReadError } from "@/lib/blob/read";
import { readKnownProducts } from "@/lib/ringside/store";

/**
 * Het effect van een mail over aangrenzende stoelen (zie
 * `lib/aangrenzende-stoelen/effect.ts`).
 *
 * - `GET`: waaruit je kunt kiezen en hoe ver het inlezen is. Geen
 *   relatienummers.
 * - `POST` met `productId`, `mailMoment` (`2026-11-03T20:00`, Nederlandse tijd)
 *   en `relationNumbers` (geplakte tekst): de uitkomst per relatienummer en als
 *   CSV. Leest alleen wat al is ingelezen; het inlezen zelf loopt via
 *   `/api/aangrenzende-stoelen/effect/inlezen`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  try {
    const [state, products, list] = await Promise.all([readEffectState(), readKnownProducts(), readHolderListMeta()]);
    const ready = Object.fromEntries(
      Object.entries(state.ready).map(([productId, { name, eventDate, tickets, caughtUpAt }]) => [
        productId,
        { name, eventDate, tickets, caughtUpAt },
      ])
    );

    return NextResponse.json(
      {
        matches: effectMatches(products),
        season: EFFECT_SEASON,
        known: products.length,
        target: state.productId
          ? { productId: state.productId, name: state.name, eventDate: state.eventDate }
          : null,
        ingest: {
          running: isEffectLocked(state),
          salesComplete: state.salesComplete,
          salesRead: state.salesRead,
          tickets: state.tickets,
          runs: state.runs,
          updatedAt: state.updatedAt || null,
          lastError: state.lastError,
        },
        ready,
        hasList: Boolean(list),
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  try {
    const request = parseEffectRequest(await req.json().catch(() => ({})));
    const built = await buildMailEffect(request);
    return NextResponse.json(built, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof EffectError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[aangrenzende-stoelen/effect] berekenen mislukt:", message);
    const retry = error instanceof BlobReadError ? " Probeer het over een minuut opnieuw." : "";
    return NextResponse.json({ error: `Het effect kon niet worden berekend. ${message}${retry}` }, { status: 500 });
  }
}
