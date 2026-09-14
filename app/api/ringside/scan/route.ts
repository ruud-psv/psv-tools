import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { RingsideAuthError, isRingsideConfigured } from "@/lib/ringside/auth";
import { ringsidePages } from "@/lib/ringside/client";

/**
 * Meet hoe diep een Ringside-tabel gaat en waar je in de tijd zit.
 *
 * De change-feed begint bij het begin van de historie: de eerste pagina's zijn
 * de oudste rijen. Voor Ticket Inzichten hebben we juist de laatste nodig. Voor
 * het ontwerp is dus de vraag hoe ver dat lopen is — een paar honderd pagina's
 * of een paar honderdduizend. Dat bepaalt of een cron er een nacht of een maand
 * over doet, en of dit überhaupt de goede aanpak is.
 *
 * Deze route loopt daarom zo ver als hij binnen een tijdsbudget komt, en
 * rapporteert waar hij bleef. Geef `cursor` mee om verder te gaan waar de
 * vorige aanroep stopte; zo is de tabel in stappen uit te meten zonder in een
 * timeout te lopen.
 *
 * Bewust géén aggregatie: dit is een liniaal, geen rekenmachine.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Standaard tijdsbudget. Ruim binnen de limiet van de functie. */
const DEFAULT_BUDGET_SECONDS = 45;
const MAX_BUDGET_SECONDS = 240;

interface DatedRow {
  event_date?: unknown;
  transaction_date?: unknown;
  last_touched_at?: unknown;
  event_name?: unknown;
  product_description?: unknown;
}

/** De datum waarop we de positie in de tijd afmeten. */
function rowDate(row: DatedRow): string | null {
  for (const value of [row.event_date, row.transaction_date, row.last_touched_at]) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function rowName(row: DatedRow): string | null {
  for (const value of [row.event_name, row.product_description]) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const authError = authorize(req.cookies.get("psv_session")?.value);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  if (!isRingsideConfigured()) {
    return NextResponse.json({ error: "Ringside is niet geconfigureerd." }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path") ?? "/v1/manifests";
  const budgetSeconds = Math.min(
    Math.max(Number(searchParams.get("seconds")) || DEFAULT_BUDGET_SECONDS, 5),
    MAX_BUDGET_SECONDS
  );
  const limit = Number(searchParams.get("limit")) || undefined;
  const startCursor = searchParams.get("cursor") ?? undefined;

  const startedAt = Date.now();
  const deadline = startedAt + budgetSeconds * 1000;

  let pages = 0;
  let rows = 0;
  let cursor: string | null = startCursor ?? null;
  let hasMore = true;
  let earliest: string | null = null;
  let latest: string | null = null;
  let latestName: string | null = null;

  try {
    for await (const page of ringsidePages<DatedRow>(path, {
      cursor: startCursor,
      // Hoog genoeg dat de tijd de begrenzing is en niet het aantal pagina's.
      maxPages: 100_000,
      searchParams: limit ? { limit } : undefined,
    })) {
      pages++;
      rows += page.data.length;
      cursor = page.cursor ?? cursor;
      hasMore = Boolean(page.has_more);

      for (const row of page.data) {
        const date = rowDate(row);
        if (!date) continue;
        if (!earliest || date < earliest) earliest = date;
        if (!latest || date > latest) {
          latest = date;
          latestName = rowName(row);
        }
      }

      if (!hasMore || Date.now() > deadline) break;
    }

    const seconds = (Date.now() - startedAt) / 1000;

    return NextResponse.json(
      {
        path,
        reachedEnd: !hasMore,
        pages,
        rows,
        seconds: Math.round(seconds * 10) / 10,
        rowsPerSecond: seconds > 0 ? Math.round(rows / seconds) : null,
        dateRange: { earliest, latest, latestName },
        nextCursor: hasMore ? cursor : null,
        note: hasMore
          ? "Tijdsbudget op. Geef nextCursor mee als ?cursor= om hier verder te gaan."
          : "Einde van de tabel bereikt.",
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    if (error instanceof RingsideAuthError) {
      console.error("[ringside/scan]", error.message);
      return NextResponse.json({ error: "Ringside-authenticatie mislukt." }, { status: 502 });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Scan mislukt.",
        // Ook bij een fout is de voortgang bruikbaar: dan hoef je niet opnieuw
        // vanaf het begin van de historie te beginnen.
        pages,
        rows,
        nextCursor: cursor,
      },
      { status: 502 }
    );
  }
}
