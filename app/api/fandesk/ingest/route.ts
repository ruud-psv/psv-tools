import { NextResponse, after } from "next/server";
import { isFandeskRequestAuthorized } from "@/lib/fandesk-auth";
import {
  isBatchTooLarge,
  MAX_ITEMS_PER_BATCH,
  parseIngestPayload,
  toAmsterdamParts,
} from "@/lib/fandesk";
import { appendTickets, readSummary } from "@/lib/fandesk-store";
import { refreshDaySummaries } from "@/lib/fandesk-summarize";

/**
 * Ingest-endpoint voor de n8n workflow die support tickets ophaalt en
 * categoriseert. Verwacht elk uur een batch items met `id`, `created_at`, de
 * Freshdesk-taxonomie (`soort`/`type`/`subtype`) en een onderwerpregel. Beveiligd met FANDESK_INGEST_SECRET — middleware.ts laat alle
 * /api/* routes ongeauthenticeerd door, dus de check zit hier.
 */

export const dynamic = "force-dynamic";

const isAuthorized = (request: Request) =>
  isFandeskRequestAuthorized(request, "fandesk/ingest");

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  const parsed = parseIngestPayload(body);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          "Ongeldige FANdesk payload. Verwacht een array met items of een object met een 'items' veld.",
      },
      { status: 400 }
    );
  }

  if (isBatchTooLarge(parsed.items.length)) {
    return NextResponse.json(
      { error: `Batch te groot: maximaal ${MAX_ITEMS_PER_BATCH} items per request.` },
      { status: 413 }
    );
  }

  const batchAt = new Date().toISOString();

  try {
    const result = await appendTickets(parsed.items, batchAt);
    if (result.withoutSoort) {
      console.warn(
        `[fandesk/ingest] ${result.withoutSoort} van ${result.added} toegevoegde tickets zonder soort — Freshdesk liet het veld leeg en het model vulde niets in.`
      );
    }

    // Samenvattingen bijwerken voor de dagen die deze batch raakt — normaal
    // alleen vandaag, bij een backfill meerdere. Dit draait via `after()` ná het
    // versturen van de response: de ingest wordt er niet langzamer van, en een
    // AI-storing kan het opslaan van tickets niet laten mislukken.
    if (result.added > 0) {
      const days = [
        ...new Set(
          parsed.items
            .map((item) => toAmsterdamParts(item.at ?? batchAt)?.dayKey)
            .filter((day): day is string => Boolean(day))
        ),
      ];
      after(async () => {
        const outcomes = await refreshDaySummaries(days);
        const done = outcomes.filter((o) => o.status === "geanalyseerd").length;
        if (done) console.log(`[fandesk/ingest] ${done} dagsamenvatting(en) bijgewerkt.`);
      });
    }

    return NextResponse.json({
      ok: true,
      received: parsed.items.length,
      skipped: parsed.skipped,
      added: result.added,
      duplicates: result.duplicates,
      bySoort: result.bySoort,
      inferred: result.inferred,
      withoutSoort: result.withoutSoort,
      batchAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Opslaan mislukt";
    console.error("[fandesk/ingest] POST mislukt:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Health check: bevestigt dat de token klopt en laat zien wat er is opgeslagen. */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await readSummary();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ophalen mislukt";
    console.error("[fandesk/ingest] GET mislukt:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
