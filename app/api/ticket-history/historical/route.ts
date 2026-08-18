import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import {
  readDataset,
  removeSeason,
  replaceSeason,
  toIndex,
  lastOffsetOf,
  type StoredEvent,
} from "@/lib/historical-ticket-sales";
import {
  MAX_TICKET_TYPES,
  type AggregatedEvent,
  type TypeSeries,
} from "@/lib/ticket-sales-aggregate";

/**
 * Historische verkoopcijfers per wedstrijd.
 *
 * `GET` is publiek: de share-pagina heeft de cijfers nodig en die kent geen
 * sessie — net als `/api/ticket-history` vandaag. `POST` en `DELETE` schrijven
 * en checken daarom zélf de sessie: `middleware.ts` laat `/api/*` ongemoeid
 * door, dus daarop vertrouwen zou de route openzetten.
 *
 * Het aggregeren gebeurt in de browser (zie
 * `app/dashboard/ticket-inzichten/upload/page.tsx`): een export van ~450.000
 * regels is 60-90 MB en past niet in de ~4,5 MB request body van een
 * serverless function. Wat hier binnenkomt is de samenvatting — gemeten enkele
 * tientallen kB, ook met de uitsplitsing per prijstype erbij.
 */

/** Bovengrenzen zodat één request de dataset niet kan laten ontploffen. */
const MAX_EVENTS = 500;
const MAX_SERIES_LENGTH = 800;
/** Maximale lengte van een tickettype-naam; gelijk aan `normalizeTicketType`. */
const MAX_TYPE_NAME = 40;

function isValidSeason(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 20;
}

function parseEvent(value: unknown): AggregatedEvent | null {
  if (!value || typeof value !== "object") return null;
  const e = value as Record<string, unknown>;

  if (typeof e.id !== "string" || !e.id || e.id.length > 120) return null;
  if (typeof e.name !== "string" || !e.name || e.name.length > 300) return null;
  if (typeof e.date !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(e.date)) return null;
  if (typeof e.season !== "string") return null;
  if (typeof e.firstOffset !== "number" || !Number.isFinite(e.firstOffset)) return null;

  const numbers = (v: unknown): number[] | null => {
    if (!Array.isArray(v) || v.length === 0 || v.length > MAX_SERIES_LENGTH) return null;
    if (!v.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0)) return null;
    return v as number[];
  };

  const tickets = numbers(e.tickets);
  if (!tickets) return null;
  // `orders` is bijzaak; bij een afwijkende lengte vullen we hem met nullen
  // zodat de indexering met `tickets` blijft kloppen.
  const orders = numbers(e.orders);

  // De uitsplitsing per tickettype is waar het filteren op leunt, dus die wordt
  // strikt gecontroleerd: een half kloppende reeks zou stille rekenfouten geven.
  const series: Record<string, TypeSeries> = {};
  if (e.series !== undefined) {
    if (!e.series || typeof e.series !== "object" || Array.isArray(e.series)) return null;
    const entries = Object.entries(e.series as Record<string, unknown>);
    if (entries.length > MAX_TICKET_TYPES + 1) return null;
    for (const [type, raw] of entries) {
      if (!type || type.length > MAX_TYPE_NAME) return null;
      if (!raw || typeof raw !== "object") return null;
      const candidate = raw as Record<string, unknown>;
      if (typeof candidate.first !== "number" || !Number.isFinite(candidate.first)) return null;
      const v = numbers(candidate.v);
      if (!v) return null;
      series[type] = { first: Math.round(candidate.first), v };
    }
  }

  return {
    id: e.id,
    name: e.name,
    date: e.date,
    season: e.season,
    opponent: typeof e.opponent === "string" ? e.opponent.slice(0, 120) : "",
    totalTickets: tickets.reduce((a, b) => a + b, 0),
    totalOrders:
      orders && orders.length === tickets.length ? orders.reduce((a, b) => a + b, 0) : 0,
    firstOffset: Math.round(e.firstOffset),
    tickets,
    orders: orders && orders.length === tickets.length ? orders : tickets.map(() => 0),
    series,
  };
}

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids");

  try {
    const dataset = await readDataset();

    // Zonder `ids` alleen de index: dat is een paar kB voor de dropdown, in
    // plaats van alle dagreeksen van twee seizoenen.
    if (!idsParam) {
      return NextResponse.json(
        { events: toIndex(dataset), seasons: dataset.seasons, updatedAt: dataset.updatedAt },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } }
      );
    }

    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10);
    const events: (StoredEvent & { lastOffset: number })[] = [];
    for (const id of ids) {
      const event = dataset.events[id];
      if (event) events.push({ ...event, lastOffset: lastOffsetOf(event) });
    }

    return NextResponse.json(
      { events },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Zonder blob-token draait dit lokaal nog steeds; dan is er simpelweg niets.
    if (msg.includes("BLOB_READ_WRITE_TOKEN") || msg.includes("token")) {
      return NextResponse.json({ events: [], seasons: {}, updatedAt: "" });
    }
    console.error("[historical-sales] GET mislukt:", msg);
    return NextResponse.json({ error: "Ophalen van historische data mislukt." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  const payload = body as Record<string, unknown> | null;
  if (!payload || !isValidSeason(payload.season)) {
    return NextResponse.json({ error: "Seizoen ontbreekt of is ongeldig." }, { status: 400 });
  }
  if (!Array.isArray(payload.events) || payload.events.length === 0) {
    return NextResponse.json({ error: "Geen events om op te slaan." }, { status: 400 });
  }
  if (payload.events.length > MAX_EVENTS) {
    return NextResponse.json(
      { error: `Te veel events in één keer (max ${MAX_EVENTS}).` },
      { status: 400 }
    );
  }

  const season = payload.season.trim();
  const events: AggregatedEvent[] = [];
  for (const raw of payload.events) {
    const parsed = parseEvent(raw);
    if (!parsed) {
      return NextResponse.json({ error: "Een van de events is ongeldig." }, { status: 400 });
    }
    // Het seizoen van de payload is leidend, zodat de events niet onder een
    // ander seizoen kunnen belanden dan het seizoen dat wordt vervangen.
    events.push({ ...parsed, season });
  }

  try {
    const result = await replaceSeason(season, events, {
      rowsRead: typeof payload.rowsRead === "number" ? payload.rowsRead : 0,
      rowsSkipped: typeof payload.rowsSkipped === "number" ? payload.rowsSkipped : 0,
    });
    return NextResponse.json({ saved: true, season, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[historical-sales] POST mislukt:", msg);
    return NextResponse.json({ error: "Opslaan mislukt." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  const season = req.nextUrl.searchParams.get("season");
  if (!isValidSeason(season)) {
    return NextResponse.json({ error: "Seizoen ontbreekt of is ongeldig." }, { status: 400 });
  }

  try {
    const { removed } = await removeSeason(season.trim());
    return NextResponse.json({ deleted: true, season: season.trim(), removed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[historical-sales] DELETE mislukt:", msg);
    return NextResponse.json({ error: "Verwijderen mislukt." }, { status: 500 });
  }
}
