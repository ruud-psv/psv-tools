/**
 * Dunne client voor de Ringside API van SeatGeek.
 *
 * Alle calls gaan met een Locksmith access token langs. Loopt een token toch
 * voortijdig af (ingetrokken, of geroteerd aan SeatGeek-kant), dan geeft
 * Ringside een 401 en proberen we het één keer opnieuw met een vers token.
 */

import { getRingsideToken, resetRingsideToken, RingsideConfigError } from "./auth";

/** Basis-URL van de API; gelijk aan de audience uit de credentials-mail. */
const DEFAULT_BASE_URL = "https://ringside.seatgeek.com";

export class RingsideRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string
  ) {
    super(message);
  }
}

export function getRingsideBaseUrl(): string {
  return (process.env.RINGSIDE_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export interface RingsideFetchOptions {
  searchParams?: Record<string, string | number | undefined>;
  /** Doorgegeven aan `fetch`, zodat een cron een lange call kan afbreken. */
  signal?: AbortSignal;
}

/**
 * Bouwt de volledige URL voor een Ringside-pad. Weigert absolute URL's: een
 * pad komt in sommige gevallen uit een querystring, en zonder deze check zou
 * dat een open proxy naar willekeurige hosts opleveren.
 */
export function buildRingsideUrl(
  path: string,
  searchParams?: RingsideFetchOptions["searchParams"]
): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//")) {
    throw new RingsideConfigError("Geef een pad op binnen de Ringside API, geen volledige URL.");
  }

  const url = new URL(`${getRingsideBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** Doet een geauthenticeerde GET naar Ringside en geeft de rauwe response terug. */
export async function ringsideFetch(
  path: string,
  options: RingsideFetchOptions = {}
): Promise<Response> {
  const url = buildRingsideUrl(path, options.searchParams);

  const send = async () =>
    fetch(url, {
      headers: {
        Authorization: `Bearer ${await getRingsideToken()}`,
        Accept: "application/json",
        "User-Agent": "PSV-Tools/1.0",
      },
      cache: "no-store",
      signal: options.signal,
    });

  let res = await send();
  if (res.status === 401) {
    resetRingsideToken();
    res = await send();
  }
  return res;
}

/** Als `ringsideFetch`, maar parseert JSON en gooit bij een foutstatus. */
export async function ringsideJson<T>(
  path: string,
  options: RingsideFetchOptions = {}
): Promise<T> {
  const res = await ringsideFetch(path, options);

  if (!res.ok) {
    const body = (await res.text()).slice(0, 500);
    throw new RingsideRequestError(
      `Ringside ${path} gaf ${res.status} ${res.statusText}`,
      res.status,
      body
    );
  }

  return (await res.json()) as T;
}

/* ---------- Paginatie ---------- */

/**
 * Ringside levert geen kant-en-klare resources maar een change-feed over de
 * databasetabellen van SeatGeek: elke rij draagt `_ringside_sequence` en
 * `_ringside_operation` (de soort mutatie), en `metadata.table_definition`
 * beschrijft de kolommen met hun Postgres-type.
 *
 * Een antwoord is daarom altijd een pagina, niet een volledige set: `has_more`
 * zegt of er nog meer is en `cursor` wijst naar het vervolg.
 */
export interface RingsideColumn {
  column: string;
  postgres_type: string;
}

export interface RingsidePage<T> {
  data: T[];
  has_more: boolean;
  cursor: string | null;
  metadata?: {
    version?: string;
    table_definition?: RingsideColumn[];
  };
}

export interface RingsidePageOptions extends RingsideFetchOptions {
  /** Vervolgpunt uit een eerdere pagina. Weglaten voor de eerste pagina. */
  cursor?: string;
}

/** Haalt één pagina op. */
export async function ringsidePage<T>(
  path: string,
  options: RingsidePageOptions = {}
): Promise<RingsidePage<T>> {
  const { cursor, searchParams, ...rest } = options;
  return ringsideJson<RingsidePage<T>>(path, {
    ...rest,
    searchParams: { ...searchParams, ...(cursor ? { cursor } : {}) },
  });
}

export interface RingsidePagesOptions extends RingsideFetchOptions {
  cursor?: string;
  /**
   * Harde bovengrens op het aantal pagina's. Een change-feed over een tabel van
   * SeatGeek-formaat is in principe eindeloos; zonder grens loopt een route in
   * zijn timeout in plaats van met een bruikbaar antwoord terug te komen.
   */
  maxPages?: number;
}

const DEFAULT_MAX_PAGES = 50;

/**
 * Loopt de pagina's af tot `has_more` false is of `maxPages` bereikt is.
 *
 * Een generator, zodat de aanroeper zelf kan stoppen — bijvoorbeeld zodra hij
 * ver genoeg terug in de tijd is — en we nooit een hele tabel in het geheugen
 * trekken.
 */
export async function* ringsidePages<T>(
  path: string,
  options: RingsidePagesOptions = {}
): AsyncGenerator<RingsidePage<T>> {
  const { cursor: startCursor, maxPages = DEFAULT_MAX_PAGES, ...fetchOptions } = options;

  let cursor = startCursor;
  for (let page = 0; page < maxPages; page++) {
    const result = await ringsidePage<T>(path, { ...fetchOptions, cursor });
    yield result;

    // Een gelijkgebleven cursor zou ons dezelfde pagina laten herhalen tot
    // `maxPages` op is; dan is het einde bereikt, wat `has_more` ook zegt.
    if (!result.has_more || !result.cursor || result.cursor === cursor) return;
    cursor = result.cursor;
  }
}
