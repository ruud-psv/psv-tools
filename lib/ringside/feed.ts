/**
 * Een stroom van Ringside lezen, pagina voor pagina.
 *
 * Gedeeld door de stoelstatus (`seat-ingest.ts`) en de verkoop per dag
 * (`sales-ingest.ts`): allebei lezen ze vanaf een cursor tot het eind van de
 * stroom of tot de tijd op is, en allebei moeten ze tegen dezelfde dingen
 * kunnen: een tijdelijke fout, een hangende pagina en een ververste dataset
 * (HTTP 205).
 */

import { ringsideFetch, RingsideRequestError, type RingsidePage } from "./client";

/** Een pagina mag niet eindeloos hangen; dan liever een fout en de volgende run. */
const PAGE_TIMEOUT_MS = 60_000;

/**
 * Hoe lang één pagina mag duren: nooit langer dan `PAGE_TIMEOUT_MS`, en niet
 * veel langer dan het budget nog toelaat. Zonder die tweede grens kan één
 * hangende pagina de korte run van een knop (25 seconden budget) tot voorbij
 * de limiet van de functie (60 seconden) rekken; dan breekt Vercel het verzoek
 * af en krijgt de gebruiker een kale 502/504.
 */
function pageTimeout(deadline: number): number {
  return Math.min(PAGE_TIMEOUT_MS, Math.max(deadline - Date.now(), 0) + PAGE_GRACE_MS);
}

/** Speling boven het budget voor een pagina die al onderweg is. */
const PAGE_GRACE_MS = 10_000;

/**
 * Wachttijden voor een nieuwe poging na een tijdelijke fout. Ringside gaf bij
 * de eerste vulling een `503 Connection reset by peer` op de allereerste pagina;
 * zoiets is meestal na een paar seconden voorbij.
 */
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000];

/** Tijdelijk: serverfouten, te veel verzoeken, of een verbinding die wegviel. */
function isTransient(status: number | null): boolean {
  return status === null || status === 429 || status >= 500;
}

/**
 * Haalt één pagina op, met een paar nieuwe pogingen bij een tijdelijke fout.
 * Geen nieuwe poging meer als de deadline daardoor overschreden zou worden.
 */
export async function fetchPage(path: string, cursor: string | null, deadline: number): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    let failure: unknown = null;
    try {
      res = await ringsideFetch(path, {
        searchParams: cursor ? { cursor } : {},
        signal: AbortSignal.timeout(pageTimeout(deadline)),
      });
    } catch (error) {
      failure = error;
    }

    if (res && (res.ok || res.status === 205 || !isTransient(res.status))) return res;

    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined || Date.now() + delay > deadline) {
      if (res) {
        const body = (await res.text()).slice(0, 500);
        throw new RingsideRequestError(`Ringside ${path} gaf ${res.status} ${res.statusText}`, res.status, body);
      }
      throw failure;
    }
    console.warn(
      `[ringside] ${path}: ${res ? `${res.status} ${res.statusText}` : String(failure)}; nieuwe poging over ${delay / 1000}s`
    );
    await res?.body?.cancel().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export interface FeedResult {
  rows: number;
  /** Tot het eind van de stroom gekomen: de data is nu actueel. */
  reachedEnd: boolean;
  /** SeatGeek heeft de dataset ververst (HTTP 205): opnieuw beginnen. */
  reset: boolean;
}

/**
 * Leest pagina's vanaf `cursor` tot het eind of tot de deadline.
 *
 * Eigen lus in plaats van `ringsidePages()`: die gooit bij een 205 niet en
 * probeert er dan JSON uit te lezen. De cursor wordt na elke pagina doorgegeven
 * via `onCursor`, zodat een fout halverwege het al gelezen werk niet weggooit.
 */
export async function readFeed<T>(
  path: string,
  cursor: string | null,
  deadline: number,
  onRows: (rows: T[]) => void,
  onCursor: (cursor: string) => void
): Promise<FeedResult> {
  let rows = 0;
  let current = cursor;

  for (;;) {
    const res = await fetchPage(path, current, deadline);
    if (res.status === 205) return { rows, reachedEnd: false, reset: true };
    if (!res.ok) {
      const body = (await res.text()).slice(0, 500);
      throw new RingsideRequestError(`Ringside ${path} gaf ${res.status} ${res.statusText}`, res.status, body);
    }

    const page = (await res.json()) as RingsidePage<T>;
    onRows(page.data ?? []);
    rows += page.data?.length ?? 0;

    // Aan het eind van de stroom kan de cursor ontbreken. Dan blijft de vorige
    // staan: de volgende run leest de laatste pagina opnieuw, wat geen kwaad
    // kan omdat elke rij de vorige versie vervangt.
    const next = page.cursor || current;
    if (next) onCursor(next);
    if (!page.has_more || !page.cursor || page.cursor === current) {
      return { rows, reachedEnd: true, reset: false };
    }
    current = page.cursor;
    if (Date.now() > deadline) return { rows, reachedEnd: false, reset: false };
  }
}
