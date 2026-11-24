import { get, put } from "@vercel/blob";

import { isValidEmail, normalizeEmail } from "@/lib/access";
import type { Collega } from "@/lib/stukken/collegas";

/**
 * Wie er in PSV Tools heeft ingelogd, met de naam uit de SAML-login. Zo kun je
 * bij het delen van een stuk een collega op naam kiezen. Eén JSON-bestand in
 * Vercel Blob; het wordt alleen geschreven als iemand nieuw is of een andere
 * naam heeft, dus bijna nooit. Mist er door twee gelijktijdige eerste logins
 * toch iemand, dan staat hij er na zijn volgende login alsnog in.
 */

const PATH = "gebruikersbeheer/register.json";
const CACHE_MS = 60_000;

let cache: { collegas: Collega[]; at: number } | null = null;

async function lees(): Promise<Collega[]> {
  const result = await get(PATH, { access: "private", useCache: false });
  if (!result?.stream) return [];
  return ((JSON.parse(await new Response(result.stream).text()) as { collegas?: Collega[] }).collegas ?? []).filter(
    (c) => typeof c?.email === "string"
  );
}

export async function readRegister(): Promise<Collega[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.collegas;
  try {
    const collegas = await lees();
    cache = { collegas, at: Date.now() };
    return collegas;
  } catch (err) {
    console.error("[gebruikers-register] lezen mislukt:", err instanceof Error ? err.message : err);
    return cache?.collegas ?? [];
  }
}

/** Bij het inloggen: zet de collega erin, of werk zijn naam bij. Een fout blokkeert het inloggen nooit. */
export async function registreerLogin(email: string, naam?: string): Promise<void> {
  const key = normalizeEmail(email);
  if (!isValidEmail(key)) return;
  try {
    const collegas = await lees();
    const bekend = collegas.find((c) => c.email === key);
    if (bekend && (!naam || bekend.naam === naam)) return;
    const nieuw = [...collegas.filter((c) => c.email !== key), { email: key, ...(naam && { naam }) }].sort((a, b) =>
      a.email.localeCompare(b.email, "nl")
    );
    await put(PATH, JSON.stringify({ collegas: nieuw }, null, 2), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    cache = { collegas: nieuw, at: Date.now() };
  } catch (err) {
    console.error("[gebruikers-register] bijwerken mislukt:", err instanceof Error ? err.message : err);
  }
}
