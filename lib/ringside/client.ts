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
