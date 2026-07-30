import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import {
  amsterdamDayBounds,
  dayCount,
  emptyCategoryCounts,
  FandeskCategory,
  isValidDayKey,
  shiftDayKey,
  toAmsterdamParts,
} from "@/lib/fandesk";
import { readRange } from "@/lib/fandesk-store";

/**
 * Leesroute voor het FANdesk dashboard. Aggregeert de opgeslagen tickets naar
 * uur-buckets, zodat de client vrij kan herbucketen naar dag/week/weekdag/uur
 * zonder opnieuw te fetchen.
 */

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 30;

export interface FandeskBucket {
  /** Begin van het uur, ISO-8601 in UTC. */
  ts: string;
  counts: Record<FandeskCategory, number>;
}

export interface FandeskData {
  from: string;
  to: string;
  buckets: FandeskBucket[];
  totals: { total: number; byCategory: Record<FandeskCategory, number> };
  previous: {
    from: string;
    to: string;
    total: number;
    byCategory: Record<FandeskCategory, number>;
  };
  lastTicketAt: string | null;
  generatedAt: string;
}

function todayKey(): string {
  return toAmsterdamParts(new Date().toISOString())?.dayKey ?? new Date().toISOString().slice(0, 10);
}

function aggregate(
  tickets: Array<{ category: FandeskCategory; at: string }>
): { buckets: FandeskBucket[]; byCategory: Record<FandeskCategory, number>; total: number } {
  const byHour = new Map<string, Record<FandeskCategory, number>>();
  const byCategory = emptyCategoryCounts();

  for (const ticket of tickets) {
    // Uur-bucket in UTC; de client rekent voor weergave om naar Amsterdam.
    const ts = `${ticket.at.slice(0, 13)}:00:00.000Z`;
    let counts = byHour.get(ts);
    if (!counts) {
      counts = emptyCategoryCounts();
      byHour.set(ts, counts);
    }
    counts[ticket.category]++;
    byCategory[ticket.category]++;
  }

  const buckets = [...byHour.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ts, counts]) => ({ ts, counts }));

  return { buckets, byCategory, total: tickets.length };
}

export async function GET(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  const params = req.nextUrl.searchParams;
  const rawFrom = params.get("from");
  const rawTo = params.get("to");

  const to = isValidDayKey(rawTo) ? rawTo : todayKey();
  const from = isValidDayKey(rawFrom) ? rawFrom : shiftDayKey(to, -(DEFAULT_DAYS - 1));

  if (from > to) {
    return NextResponse.json(
      { error: "Ongeldige periode: 'from' ligt na 'to'." },
      { status: 400 }
    );
  }

  const span = dayCount(from, to);
  const prevTo = shiftDayKey(from, -1);
  const prevFrom = shiftDayKey(prevTo, -(span - 1));

  try {
    const current = amsterdamDayBounds(from, to);
    const previous = amsterdamDayBounds(prevFrom, prevTo);

    const [currentTickets, previousTickets] = await Promise.all([
      readRange(current.fromInstant, current.toInstant),
      readRange(previous.fromInstant, previous.toInstant),
    ]);

    const now = aggregate(currentTickets);
    const before = aggregate(previousTickets);

    const data: FandeskData = {
      from,
      to,
      buckets: now.buckets,
      totals: { total: now.total, byCategory: now.byCategory },
      previous: {
        from: prevFrom,
        to: prevTo,
        total: before.total,
        byCategory: before.byCategory,
      },
      lastTicketAt: currentTickets.length ? currentTickets[currentTickets.length - 1].at : null,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ophalen mislukt";
    console.error("[fandesk] GET mislukt:", message);
    // Zonder blob-token is er simpelweg nog geen data — geef een lege set terug
    // in plaats van een foutmelding waar de gebruiker niets mee kan.
    if (message.includes("BLOB_READ_WRITE_TOKEN")) {
      return NextResponse.json({
        from,
        to,
        buckets: [],
        totals: { total: 0, byCategory: emptyCategoryCounts() },
        previous: { from: prevFrom, to: prevTo, total: 0, byCategory: emptyCategoryCounts() },
        lastTicketAt: null,
        generatedAt: new Date().toISOString(),
      } satisfies FandeskData);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
