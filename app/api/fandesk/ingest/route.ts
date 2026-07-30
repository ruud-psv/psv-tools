import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { isBatchTooLarge, MAX_ITEMS_PER_BATCH, parseIngestPayload } from "@/lib/fandesk";
import { appendTickets, readSummary } from "@/lib/fandesk-store";

/**
 * Ingest-endpoint voor de n8n workflow die support tickets ophaalt en
 * categoriseert. Verwacht elk uur een batch items met `id`, `category` en
 * `created_at`. Beveiligd met FANDESK_INGEST_SECRET — middleware.ts laat alle
 * /api/* routes ongeauthenticeerd door, dus de check zit hier.
 */

export const dynamic = "force-dynamic";

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.FANDESK_INGEST_SECRET;
  if (!secret) {
    console.error("[fandesk/ingest] FANDESK_INGEST_SECRET niet geconfigureerd — endpoint geweigerd.");
    return false;
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ") && secretsMatch(authHeader.slice(7), secret)) {
    return true;
  }
  const custom = request.headers.get("x-fandesk-secret");
  return custom ? secretsMatch(custom, secret) : false;
}

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
    if (result.unknownCategories.length) {
      console.warn(
        "[fandesk/ingest] onbekende categorieën geteld als Overig:",
        result.unknownCategories.join(", ")
      );
    }
    return NextResponse.json({
      ok: true,
      received: parsed.items.length,
      skipped: parsed.skipped,
      added: result.added,
      duplicates: result.duplicates,
      unknownCategories: result.unknownCategories,
      byCategory: result.byCategory,
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
