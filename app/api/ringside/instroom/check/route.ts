import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import {
  addAttendanceRow,
  describeBarcodeHistory,
  emptyAttendanceSummary,
  type AttendanceCheckRow,
} from "@/lib/instroom/check";
import { readInstroomState } from "@/lib/instroom/store";
import { isRingsideConfigured } from "@/lib/ringside/auth";
import { readFeed } from "@/lib/ringside/feed";
import { readKnownProducts } from "@/lib/ringside/store";

/**
 * Controle voor de instroom: wat staat er werkelijk in Ringside? Zie
 * `lib/instroom/check.ts`.
 *
 * - `scans`: de hele stroom `/v1/attendance` (klein: enkele tienduizenden rijen),
 *   geteld per evenement en per jaar.
 * - `barcodeHistory`: de vorm van `sales.barcode_history`, van een paar tickets.
 *   Leest een stuk van `/v1/sales` vanaf waar het inlezen van de instroom is
 *   gebleven, zodat het recente verkoop is. Barcodes komen niet terug.
 *
 * Bewaart niets en verandert niets. Alleen met een login.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ATTENDANCE_SECONDS = 150;
const SALES_SECONDS = 60;
const SAMPLES = 5;

interface SalesCheckRow {
  product_id?: unknown;
  item_type?: unknown;
  sale_type?: unknown;
  barcode_history?: unknown;
}

function top(counts: Record<string, number>, limit = 30): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
  );
}

export async function GET(req: NextRequest) {
  const authError = authorize(req.cookies.get("psv_session")?.value);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });
  if (!isRingsideConfigured()) {
    return NextResponse.json({ error: "Ringside is niet geconfigureerd." }, { status: 503 });
  }

  const [state, products] = await Promise.all([readInstroomState(), readKnownProducts()]);
  const names = new Map(products.map((product) => [product.productId, product]));
  const chosen = state.productId;

  /* ---------- Scans ---------- */

  const summary = emptyAttendanceSummary();
  let scansComplete = false;
  let scansError: string | null = null;
  try {
    const result = await readFeed<AttendanceCheckRow>(
      "/v1/attendance",
      null,
      Date.now() + ATTENDANCE_SECONDS * 1000,
      (rows) => {
        for (const row of rows) addAttendanceRow(summary, row);
      },
      () => undefined
    );
    scansComplete = result.reachedEnd;
  } catch (error) {
    scansError = error instanceof Error ? error.message : String(error);
  }

  const events = [...summary.products.values()]
    .sort((a, b) => (b.lastScan ?? "").localeCompare(a.lastScan ?? ""))
    .map((product) => ({
      ...product,
      name: names.get(product.productId)?.name ?? null,
      eventDate: names.get(product.productId)?.eventDate ?? null,
    }));

  /* ---------- barcode_history ---------- */

  const samples: { ofChosenMatch: boolean; item_type: unknown; sale_type: unknown; shape: unknown }[] = [];
  let salesRows = 0;
  let withHistory = 0;
  let salesError: string | null = null;
  try {
    const deadline = Date.now() + SALES_SECONDS * 1000;
    await readFeed<SalesCheckRow>(
      "/v1/sales",
      state.salesCursor,
      deadline,
      (rows) => {
        for (const row of rows) {
          salesRows++;
          const shape = describeBarcodeHistory(row.barcode_history);
          if (shape === null) continue;
          withHistory++;
          const ofChosenMatch = Boolean(chosen) && String(row.product_id ?? "").toLowerCase() === chosen;
          // Tickets van de gekozen wedstrijd gaan voor; anders de eerste paar.
          if (ofChosenMatch || samples.length < SAMPLES) {
            samples.push({ ofChosenMatch, item_type: row.item_type, sale_type: row.sale_type, shape });
          }
        }
      },
      () => undefined
    );
  } catch (error) {
    salesError = error instanceof Error ? error.message : String(error);
  }
  samples.sort((a, b) => Number(b.ofChosenMatch) - Number(a.ofChosenMatch));

  return NextResponse.json(
    {
      chosenMatch: chosen ? { productId: chosen, name: state.name, eventDate: state.eventDate } : null,
      scans: {
        rows: summary.rows,
        complete: scansComplete,
        error: scansError,
        succeeded: summary.succeeded,
        withSeatOnScan: summary.withArea,
        ofChosenMatch: chosen ? (summary.products.get(chosen)?.scans ?? 0) : null,
        perYear: summary.years,
        events: events.length,
        // De laatst gescande evenementen eerst.
        perEvent: events.slice(0, 60),
        action: top(summary.values.action),
        scannedItem: top(summary.values.scanned_item),
        scannerName: top(summary.values.scanner_name),
        turnstileName: top(summary.values.turnstile_name),
      },
      barcodeHistory: {
        salesRowsRead: salesRows,
        rowsWithHistory: withHistory,
        error: salesError,
        samples: samples.slice(0, SAMPLES),
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
