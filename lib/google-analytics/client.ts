import { BetaAnalyticsDataClient } from "@google-analytics/data";

import { GaConfigError, type GaSite } from "./rapport";
import type { GaApi } from "../mcp/servers/google-analytics";

/**
 * De Google Analytics-koppeling voor de MCP-server van PSV Tools: welke sites
 * er zijn en een client met het service-account. Dezelfde instellingen als
 * Web Verkeer (`app/api/analytics/route.ts`); die route heeft een eigen kopie
 * en blijft ongewijzigd.
 */

export function gaSites(env: Record<string, string | undefined> = process.env): GaSite[] {
  const mapping: [string, string, string][] = [
    ["psv", "psv.nl", "GA_PROPERTY_PSV"],
    ["ticketshop", "ticketshop.psv.nl", "GA_PROPERTY_TICKETSHOP"],
    ["fanstore", "psvfanstore.nl", "GA_PROPERTY_FANSTORE"],
    ["acties", "acties.psv.nl", "GA_PROPERTY_ACTIES"],
  ];
  return mapping
    .filter(([, , envVar]) => Boolean(env[envVar]?.trim()))
    .map(([key, label, envVar]) => ({ key, label, propertyId: env[envVar]!.trim(), envVar }));
}

let cached: { json: string; client: BetaAnalyticsDataClient } | null = null;

function leesServiceAccount(json: string): Record<string, unknown> {
  let credentials: unknown;
  try {
    credentials = JSON.parse(json);
    // Soms staat de waarde met extra aanhalingstekens in Vercel.
    if (typeof credentials === "string") credentials = JSON.parse(credentials);
  } catch {
    throw new GaConfigError("GA_SERVICE_ACCOUNT_JSON is geen geldige JSON.");
  }
  if (!credentials || typeof credentials !== "object") throw new GaConfigError("GA_SERVICE_ACCOUNT_JSON is geen object.");
  const creds = credentials as Record<string, unknown>;
  if (!creds.client_email || !creds.private_key) throw new GaConfigError("GA_SERVICE_ACCOUNT_JSON mist client_email of private_key.");
  // Een private key op één regel heeft \n als tekst in plaats van regeleindes.
  if (typeof creds.private_key === "string" && !creds.private_key.includes("\n")) {
    creds.private_key = creds.private_key.replace(/\\n/g, "\n");
  }
  return creds;
}

export function gaClient(): BetaAnalyticsDataClient {
  const json = process.env.GA_SERVICE_ACCOUNT_JSON;
  if (!json) throw new GaConfigError("GA_SERVICE_ACCOUNT_JSON ontbreekt.");
  if (cached?.json === json) return cached.client;
  const client = new BetaAnalyticsDataClient({ credentials: leesServiceAccount(json) });
  cached = { json, client };
  return client;
}

/** Het e-mailadres van het service-account, voor foutmeldingen; geen geheim. */
export function gaServiceAccountEmail(): string | null {
  const json = process.env.GA_SERVICE_ACCOUNT_JSON;
  if (!json) return null;
  try {
    const email = leesServiceAccount(json).client_email;
    return typeof email === "string" ? email : null;
  } catch {
    return null;
  }
}

/** De client in de vorm die de MCP-server verwacht. */
export function gaApi(client: BetaAnalyticsDataClient): GaApi {
  return {
    runReport: async (request) => (await client.runReport(request))[0],
    runRealtimeReport: async (request) => (await client.runRealtimeReport(request))[0],
    getMetadata: async (name) => (await client.getMetadata({ name }))[0],
  };
}
