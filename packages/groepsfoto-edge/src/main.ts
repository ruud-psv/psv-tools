/**
 * Ingang voor Bunny Edge Scripting (standalone script). Leest de secrets en
 * geeft elke aanvraag door aan `verwerk()` in `handler.ts`.
 *
 * Bouwen tot één bestand: `npm run edge:build` (zie README.md).
 */

import * as BunnySDK from "https://esm.sh/@bunny.net/edgescript-sdk@0.13.0";
import { verwerk, type Omgeving } from "./handler.ts";
import { GeheugenLimiet, opslagDagTeller } from "./limieten.ts";
import { bunnyOpslag } from "./opslag.ts";
import { maakTicketSleutel } from "./ticket.ts";

function env(naam: string): string | undefined {
  try {
    if (typeof Deno !== "undefined") return Deno.env.get(naam);
  } catch {
    // geen rechten op de omgeving
  }
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[naam];
}

function verplicht(naam: string): string {
  const waarde = env(naam)?.trim();
  if (!waarde) throw new Error(`${naam} ontbreekt in de omgeving van het script.`);
  return waarde;
}

async function bouwOmgeving(): Promise<Omgeving> {
  const opslag = bunnyOpslag({
    zone: verplicht("STORAGE_ZONE"),
    sleutel: verplicht("STORAGE_KEY"),
    host: env("STORAGE_HOST"),
  });
  return {
    opslag,
    dagTeller: opslagDagTeller(opslag),
    ipLimiet: new GeheugenLimiet(),
    ticketSleutel: await maakTicketSleutel(verplicht("TICKET_SLEUTEL")),
    replicateToken: verplicht("REPLICATE_API_TOKEN"),
    turnstileSecret: verplicht("TURNSTILE_SECRET"),
    ipHeader: env("IP_HEADER")?.trim().toLowerCase() || "x-real-ip",
    fetch: (input, init) => fetch(input, init),
    nu: () => Date.now(),
    log: (...args) => console.error("[groepsfoto]", ...args),
  };
}

let omgeving: Promise<Omgeving> | null = null;

BunnySDK.net.http.serve(async (req: Request) => {
  try {
    omgeving ??= bouwOmgeving();
    return await verwerk(req, await omgeving);
  } catch (err) {
    // Een ontbrekend secret: niet opnieuw proberen met dezelfde fout, wel loggen.
    console.error("[groepsfoto] Script niet ingesteld:", err);
    omgeving = null;
    return new Response(JSON.stringify({ code: "storing", melding: "Er ging iets mis. Probeer het later opnieuw." }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
});
