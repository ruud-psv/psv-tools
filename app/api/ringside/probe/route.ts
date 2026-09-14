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
    // Persoonsnamen. Anker op het achtervoegsel, niet op het begin: in
    // `attendance` heten ze `primary_first_name` en `primary_last_name`.
    // Bewust niet elk veld dat op `_name` eindigt — `product_name` draagt de
    // wedstrijdnaam, `section_name` en `venue_name` de plek in het stadion, en
    // dat is juist waar Ticket Inzichten op draait.
    "(^|_)(first_name|last_name|middle_name|full_name|fname|lname)$",
    "^name$",
    // Contact- en adresgegevens.
    "(^|_)(email|phone|mobile|address|street|city|zip|postcode|country|birth|iban|bsn)($|_)",
    // Pseudonieme klantidentificatie: onder de AVG nog steeds persoonsgegeven,
    // en ook hier met een prefix (`primary_crm_id`).
    "(^|_)(crm_id|client_id)$",
    // Betaalgegevens.
    "credit_card",
    "payment_item_ref",
    "gateway_transaction",
    // Een barcode is een toegangsbewijs: wie hem heeft, komt binnen.
    "(^|_)barcode",
  ].join("|"),
  "i"
);

function maskRow(row: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const isPersonal = PERSONAL_COLUMN_PATTERN.test(key);
    // `null` blijft staan: dat een veld leeg is, is zelf geen persoonsgegeven
    // en juist nuttig om te zien bij het in kaart brengen van een tabel.
    masked[key] = isPersonal && value !== null ? "«gemaskeerd»" : value;
  }
  return masked;
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

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = authorize(req.cookies.get("psv_session")?.value);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const { searchParams } = new URL(req.url);

  if (!isRingsideConfigured()) {
    return NextResponse.json(
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
      return NextResponse.json({
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
    const ours = new Set(["path", "refresh", "rows", "unmasked"]);
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
      return NextResponse.json({
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
    return NextResponse.json({
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
      return NextResponse.json({ configured: false, error: error.message }, { status: 400 });
    }
    if (error instanceof RingsideAuthError) {
      console.error("[ringside/probe]", error.message);
      return NextResponse.json(
        { configured: true, authenticated: false, error: error.message },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ringside-aanroep mislukt." },
      { status: 502 }
    );
  }
}
