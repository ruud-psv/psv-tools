import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import {
  RingsideAuthError,
  RingsideConfigError,
  getRingsideTokenInfo,
  isRingsideConfigured,
  resetRingsideToken,
} from "@/lib/ringside/auth";
import { buildRingsideUrl, getRingsideBaseUrl, ringsideFetch } from "@/lib/ringside/client";

/**
 * Diagnose-endpoint voor de Ringside-koppeling. Twee functies:
 *
 * 1. Zonder `path`: controleert of de Locksmith-credentials werken en toont de
 *    tokengeldigheid — de snelste manier om te zien of de environment
 *    variables in Vercel goed staan.
 * 2. Met `path`: doet een geauthenticeerde GET naar dat Ringside-pad en geeft
 *    het antwoord terug. Daarmee brengen we de echte tabellen en kolommen in
 *    kaart, zodat `/api/ticket-feed` daarna van de XML-feed af kan.
 *
 * Alleen bereikbaar met een geldige sessie, en alleen GET — het is een
 * leeshulpmiddel, geen doorgeefluik. Het access token verlaat de server niet.
 *
 * Let op: Ringside-tabellen bevatten persoonsgegevens (namen, CRM-nummers,
 * kaartgegevens). Dit endpoint toont daarom standaard een handvol rijen met
 * gemaskeerde persoonsvelden; zie `maskRow`.
 */

/** Laatste vangnet op de responsgrootte. */
const MAX_BODY_CHARS = 20_000;

/** Aantal rijen dat we standaard tonen — genoeg om de vorm te zien. */
const DEFAULT_ROWS = 3;
const MAX_ROWS = 50;

/**
 * Kolommen waarvan de waarde een persoonsgegeven is. Ticket Inzichten werkt op
 * aantallen, niet op personen, dus voor het verkennen van de tabelvorm is de
 * naam van de kolom genoeg en hoeft de waarde er niet bij. Wie de echte waarde
 * moet zien, vraagt expliciet `?unmasked=1`.
 */
const PERSONAL_COLUMN_PATTERN = new RegExp(
  [
    // Persoonsnamen. Anker op het achtervoegsel, niet op het begin: dezelfde
    // gegevens heten per tabel anders — `fname` in payments,
    // `primary_first_name` in attendance, `own_lname_or_accnt_name` in sales.
    // Bewust niet elk veld dat op `_name` eindigt: `product_name` draagt de
    // wedstrijd en `section_name` het vak, en daar draait Ticket Inzichten op.
    "(^|_)(first_name|last_name|middle_name|full_name)$",
    "(^|_)(fname|lname)($|_)",
    "^name$",
    // Contact- en adresgegevens.
    "(^|_)(email|phone|mobile|address|street|city|zip|postcode|country|birth|iban|bsn)($|_)",
    // Pseudonieme klantidentificatie: onder de AVG nog steeds persoonsgegeven.
    // Zowel `_id` als `_guid`, met en zonder prefix.
    "(^|_)(crm|client)_(id|guid)$",
    // Medewerkers zijn ook personen: wie de verkoop deed of bevestigde.
    "(^|_)(sales_rep|confirmed_by)$",
    "^user$",
    // Betaalgegevens.
    "credit_card",
    "payment_item_ref",
    "gateway_transaction",
    // Codes die toegang of korting geven — geen persoonsgegeven, wel iets dat
    // je niet in een browser of chat wil laten rondslingeren.
    "(^|_)barcode",
    "(^|_)(coupon_code|presale_access_code|access_code)$",
    // Vrije tekstvelden: daar kan van alles in staan, inclusief wat een
    // medewerker over een klant noteerde.
    "^(notes|extra_data|sales_details|user_acknowledgements)$",
  ].join("|"),
  "i"
);

/**
 * Kolommen die het patroon hierboven ten onrechte zou raken. De adresregel
 * reageert op `city` en `country`, maar in `Catalog` gaan die over het stadion
 * en niet over een persoon.
 */
const NON_PERSONAL_COLUMNS = new Set([
  "venue",
  "venue_city",
  "venue_country",
  "venue_marquee_city",
  "venue_state",
  "venue_timezone",
]);

/**
 * Toetst een kolomnaam aan het patroon. `sales` heeft een kolom die letterlijk
 * `"user"` heet — inclusief aanhalingstekens — dus die strippen we eerst.
 */
function isPersonalColumn(column: string): boolean {
  const name = column.replace(/^"+|"+$/g, "").toLowerCase();
  if (NON_PERSONAL_COLUMNS.has(name)) return false;
  return PERSONAL_COLUMN_PATTERN.test(name);
}

function maskRow(row: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const isPersonal = isPersonalColumn(key);
    // `null` blijft staan: dat een veld leeg is, is zelf geen persoonsgegeven
    // en juist nuttig om te zien bij het in kaart brengen van een tabel.
    masked[key] = isPersonal && value !== null ? "«gemaskeerd»" : value;
  }
  return masked;
}

/** Hoeveel verschillende waarden we per kolom tonen. */
const MAX_DISTINCT = 25;

/**
 * Telt per gevraagde kolom welke waarden erin voorkomen, over de rijen van deze
 * pagina. Daarmee beantwoord je vragen die uit een schema niet te halen zijn:
 * welke waarden `event_sales_status` aanneemt, of `capacity` altijd 1 is, of
 * `is_counted_as_available` varieert. Aggregaten, dus geen rijen met
 * persoonsgegevens — maar een kolom die gemaskeerd wordt, tellen we alsnog niet.
 */
function distinctValues(
  rows: Record<string, unknown>[],
  columns: string[],
  unmasked: boolean
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const column of columns) {
    if (!unmasked && isPersonalColumn(column)) {
      result[column] = "«gemaskeerd — gebruik unmasked=1»";
      continue;
    }

    const counts = new Map<string, number>();
    for (const row of rows) {
      const value = row[column];
      const key = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    result[column] = {
      distinct: sorted.length,
      values: Object.fromEntries(sorted.slice(0, MAX_DISTINCT)),
      ...(sorted.length > MAX_DISTINCT ? { truncated: true } : {}),
    };
  }

  return result;
}

interface RingsideEnvelope {
  data?: unknown;
  has_more?: unknown;
  cursor?: unknown;
  metadata?: { table_definition?: { column?: string; postgres_type?: string }[] };
}

/** Herkent een Ringside-pagina aan de envelop. */
function asRingsidePage(body: unknown): RingsideEnvelope | null {
  if (typeof body !== "object" || body === null) return null;
  const page = body as RingsideEnvelope;
  return Array.isArray(page.data) ? page : null;
}

/**
 * Een diagnose-antwoord mag nooit uit een cache komen: dan kijk je naar de
 * uitkomst van een vorige vraag zonder dat te merken. `force-dynamic` regelt de
 * rendering, deze header het doorgeven onderweg.
 */
function json(body: unknown, init?: { status?: number }): NextResponse {
  return NextResponse.json(body, {
    status: init?.status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = authorize(req.cookies.get("psv_session")?.value);
  if (authError) return json({ error: authError }, { status: 401 });

  const { searchParams } = new URL(req.url);

  if (!isRingsideConfigured()) {
    return json(
      {
        configured: false,
        error:
          "Ringside is nog niet geconfigureerd. Zet RINGSIDE_CLIENT_ID en RINGSIDE_CLIENT_SECRET in Vercel.",
        required: ["RINGSIDE_CLIENT_ID", "RINGSIDE_CLIENT_SECRET"],
        optional: ["RINGSIDE_TOKEN_URL", "RINGSIDE_AUDIENCE", "RINGSIDE_BASE_URL"],
      },
      { status: 503 }
    );
  }

  if (searchParams.get("refresh") === "1") resetRingsideToken();

  try {
    const token = await getRingsideTokenInfo();
    const path = searchParams.get("path");

    if (!path) {
      return json({
        configured: true,
        authenticated: true,
        baseUrl: getRingsideBaseUrl(),
        token,
        hint: "Geef ?path=/… mee om een Ringside-endpoint te proberen.",
      });
    }

    // `rows=0` is een geldige vraag — alleen de kolommen, geen enkele rij — dus
    // niet op falsy testen, anders valt juist die stand terug op de default.
    const rawRows = searchParams.get("rows");
    const requestedRows = rawRows === null ? DEFAULT_ROWS : Number(rawRows);
    const rowLimit = Number.isFinite(requestedRows)
      ? Math.min(Math.max(requestedRows, 0), MAX_ROWS)
      : DEFAULT_ROWS;
    const unmasked = searchParams.get("unmasked") === "1";

    // Alles behalve onze eigen parameters gaat als querystring mee naar
    // Ringside, zodat filters en paginatie direct uitgeprobeerd kunnen worden.
    const distinctColumns = (searchParams.get("distinct") ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    const ours = new Set(["path", "refresh", "rows", "unmasked", "distinct"]);
    const forwarded: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      if (!ours.has(key)) forwarded[key] = value;
    }

    const res = await ringsideFetch(path, { searchParams: forwarded });
    const text = await res.text();

    // Eerst parsen, dán pas inkorten. Andersom — zoals eerder — verliezen we de
    // samenvatting precies bij de grote pagina's waarvoor hij bedoeld is.
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Geen JSON; dan is de rauwe tekst zelf het interessante signaal.
    }

    const page = asRingsidePage(parsed);

    if (page) {
      const rows = page.data as Record<string, unknown>[];
      return json({
        configured: true,
        authenticated: true,
        request: { url: buildRingsideUrl(path, forwarded) },
        status: res.status,
        ok: res.ok,
        ringside: {
          rows: rows.length,
          hasMore: page.has_more ?? null,
          cursor: page.cursor ?? null,
          columns:
            page.metadata?.table_definition?.map((c) => `${c.column}: ${c.postgres_type}`) ?? null,
        },
        ...(distinctColumns.length
          ? { distinct: distinctValues(rows, distinctColumns, unmasked) }
          : {}),
        sample: {
          shown: Math.min(rowLimit, rows.length),
          masked: !unmasked,
          rows: rows
            .slice(0, rowLimit)
            .map((row) => (unmasked ? row : maskRow(row))),
        },
      });
    }

    const truncated = text.length > MAX_BODY_CHARS;
    return json({
      configured: true,
      authenticated: true,
      request: { url: buildRingsideUrl(path, forwarded) },
      status: res.status,
      ok: res.ok,
      contentType: res.headers.get("content-type"),
      truncated,
      body: truncated ? text.slice(0, MAX_BODY_CHARS) : (parsed ?? text),
    });
  } catch (error) {
    if (error instanceof RingsideConfigError) {
      return json({ configured: false, error: error.message }, { status: 400 });
    }
    if (error instanceof RingsideAuthError) {
      console.error("[ringside/probe]", error.message);
      return json(
        { configured: true, authenticated: false, error: error.message },
        { status: 502 }
      );
    }
    return json(
      { error: error instanceof Error ? error.message : "Ringside-aanroep mislukt." },
      { status: 502 }
    );
  }
}
