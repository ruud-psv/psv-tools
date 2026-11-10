/**
 * Een inleesroute die meer werk heeft dan in één serverless run past, start aan
 * het eind zijn eigen opvolger. Hier staat wat zo'n route daarvoor nodig heeft:
 * wie hem mag aanroepen, en hoe de volgende run gestart wordt.
 */

import type { NextRequest } from "next/server";
import { verifySessionToken } from "../auth";

/**
 * Toegang: de cron met het gedeelde geheim, of een ingelogde gebruiker. Dat
 * tweede is er zodat een eerste vulling handmatig gestart kan worden.
 */
export function isCronOrSession(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (req.headers.get("authorization") === `Bearer ${cronSecret}`) return true;
    if (req.headers.get("x-cron-secret") === cronSecret) return true;
  }
  const cookie = req.cookies.get("psv_session")?.value;
  return Boolean(cookie && verifySessionToken(cookie));
}

/**
 * Waar de volgende run heen moet.
 *
 * Niet per se het adres waarop dit verzoek binnenkwam: een deployment heeft ook
 * een eigen adres (`psv-tools-<hash>.vercel.app`) dat achter Vercel-login zit.
 * Een vervolgaanroep daarheen wordt doorgestuurd naar de inlogpagina en start
 * niets. In productie gaat hij daarom naar het vaste productiedomein.
 *
 * `force`, `restart` en `productId` gaan niet mee: die gelden alleen voor de
 * eerste run van een ketting.
 */
function nextRunUrl(req: NextRequest, remaining: number): URL {
  const url = new URL(req.url);
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL_ENV === "production" && productionHost) {
    url.protocol = "https:";
    url.host = productionHost;
  }
  url.searchParams.set("chain", String(remaining));
  for (const once of ["force", "restart", "productId"]) url.searchParams.delete(once);
  return url;
}

/**
 * Start de volgende run en wacht alleen tot het verzoek de deur uit is.
 *
 * Een run duurt minuten, dus een timeout is hier het verwachte geval. Komt er
 * binnen twee seconden wél een antwoord, dan is de run niet gestart, behalve
 * bij 409: dan loopt er al een, en dat is ook goed.
 */
export async function startNextRun(req: NextRequest, remaining: number, label: string): Promise<boolean> {
  const url = nextRunUrl(req, remaining);

  const headers: Record<string, string> = {};
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) headers.authorization = `Bearer ${cronSecret}`;
  const cookie = req.headers.get("cookie");
  if (cookie) headers.cookie = cookie;

  try {
    const res = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
      redirect: "manual",
    });
    if (res.status === 409) return true;
    console.error(`[${label}] volgende run niet gestart: ${url.host} gaf ${res.status}`);
    return false;
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") return true;
    console.error(`[${label}] volgende run niet gestart:`, error instanceof Error ? error.message : error);
    return false;
  }
}

/** `?chain=` als aantal: `0` zet de ketting uit, leeg of onleesbaar geeft de standaard. */
export function chainRemaining(raw: string | null, standard: number, max: number): number {
  const requested = raw === null ? standard : Number(raw);
  return Number.isFinite(requested) ? Math.min(Math.max(requested, 0), max) : standard;
}
