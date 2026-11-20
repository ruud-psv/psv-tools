import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getAccess } from "@/lib/access-store";
import {
  RingsideAuthError,
  RingsideConfigError,
  getRingsideTokenInfo,
  isRingsideConfigured,
  resetRingsideToken,
} from "@/lib/ringside/auth";
import { buildRingsideUrl, getRingsideBaseUrl, ringsideFetch } from "@/lib/ringside/client";
import { isProbeVisibleColumn, maskForProbe } from "@/lib/ringside/privacy";

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
 * Alleen voor admins, en alleen GET — het is een leeshulpmiddel, geen
 * doorgeefluik. Het access token verlaat de server niet.
 *
 * Ringside-tabellen bevatten persoonsgegevens. Naam, e-mail, telefoon en
 * adresregels haalt `ringsideFetch` er al voor alle code uit. Daarbovenop toont
 * de probe alleen de waarden van kolommen op een toestaanlijst
 * (`isProbeVisibleColumn`); al het andere is gemaskeerd, zonder uitzondering.
 * Elke aanroep komt in de log, met wie hem deed.
 */

/** Aantal rijen dat we standaard tonen — genoeg om de vorm te zien. */
const DEFAULT_ROWS = 3;
const MAX_ROWS = 10;

/**
 * Parameters die niet naar Ringside doorgaan. `cursor` hoort erbij: met een
 * doorgegeven cursor kon je pagina na pagina door een hele tabel bladeren, en
 * de probe is er om de vorm van een tabel te zien, niet de inhoud.
 */
const BLOCKED_PARAMS = new Set(["path", "refresh", "rows", "distinct", "unmasked", "cursor"]);

/** Hoeveel verschillende waarden we per kolom tonen. */
const MAX_DISTINCT = 25;

/**
 * Telt per gevraagde term welke waarden erin voorkomen, over de rijen van deze
 * pagina. Daarmee beantwoord je vragen die uit een schema niet te halen zijn:
 * welke waarden `event_sales_status` aanneemt, of `capacity` altijd 1 is, of
 * `is_counted_as_available` varieert.
 *
 * Een term mag kolommen kruisen met `+`, bijvoorbeeld
 * `sale_type+current_status`: dan tellen we de combinaties in plaats van elke
 * kolom apart.
 *
 * Aggregaten, dus geen rijen met persoonsgegevens — maar een kolom die
 * gemaskeerd wordt, tellen we alsnog niet.
 */
function distinctValues(rows: Record<string, unknown>[], terms: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const term of terms) {
    // Een term met `+` kruist kolommen: `sale_type+current_status` telt de
    // combinaties. Losse tellingen zeggen namelijk niet of de retouren in de
    // rijen met current_status=false zitten of er juist buiten vallen.
    //
    // In een querystring betekent `+` een spatie, dus dat is precies wat hier
    // binnenkomt. Kolomnamen bevatten geen spaties, dus we splitsen op allebei
    // — dan werkt zowel `a+b` als `a%2Bb` als `a%20b`.
    const columns = term.split(/[\s+]+/).filter(Boolean);

    const personal = columns.find((c) => !isProbeVisibleColumn(c));
    if (personal) {
      result[columns.join(" + ")] = `«${personal} is gemaskeerd»`;
      continue;
    }

    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = columns
        .map((column) => {
          const value = row[column];
          return typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
        })
        .join(" | ");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    result[columns.join(" + ")] = {
      distinct: sorted.length,
      values: Object.fromEntries(sorted.slice(0, MAX_DISTINCT)),
      ...(sorted.length > MAX_DISTINCT ? { truncated: true } : {}),
    };
  }

  return result;
}

/** Een foutmelding van Ringside is kort; meer dan dit tonen we niet. */
const MAX_ERROR_CHARS = 500;

/** De vorm van een antwoord zonder de waarden: sleutels en typen. */
function describeShape(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) {
    return depth > 2 ? "array" : { array: value.length, item: describeShape(value[0], depth + 1) };
  }
  if (typeof value === "object" && value !== null) {
    if (depth > 2) return "object";
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, describeShape(v, depth + 1)])
    );
  }
  return value === null ? "null" : typeof value;
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
  const cookie = req.cookies.get("psv_session")?.value;
  const session = cookie ? verifySession(cookie) : null;
  if (!session) return json({ error: "Geen geldige sessie. Log opnieuw in." }, { status: 401 });
  if (!(await getAccess(session.email)).isAdmin) {
    return json({ error: "De Ringside-probe is alleen voor admins." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  console.info(
    `[ringside/probe] ${session.email}: ${searchParams.get("path") ?? "(token)"} ${searchParams.toString()}`
  );

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

    // Alles behalve onze eigen parameters gaat als querystring mee naar
    // Ringside, zodat filters en paginatie direct uitgeprobeerd kunnen worden.
    const distinctColumns = (searchParams.get("distinct") ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    const forwarded: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      if (!BLOCKED_PARAMS.has(key)) forwarded[key] = value;
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
          columns:
            page.metadata?.table_definition?.map((c) => `${c.column}: ${c.postgres_type}`) ?? null,
        },
        ...(distinctColumns.length
          ? { distinct: distinctValues(rows, distinctColumns) }
          : {}),
        sample: {
          shown: Math.min(rowLimit, rows.length),
          masked: true,
          rows: rows.slice(0, rowLimit).map(maskForProbe),
        },
      });
    }

    // Geen Ringside-pagina: dan nooit de body zelf, want daar loopt het
    // maskeren niet over. Bij een fout de melding (kort), anders alleen de vorm.
    return json({
      configured: true,
      authenticated: true,
      request: { url: buildRingsideUrl(path, forwarded) },
      status: res.status,
      ok: res.ok,
      contentType: res.headers.get("content-type"),
      ...(res.ok ? { shape: describeShape(parsed ?? text) } : { error: text.slice(0, MAX_ERROR_CHARS) }),
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
