/**
 * Capability probe voor PSV Play (JW Player). Test per property welke
 * dimensies, metrics, bronnen en endpoints werken, en schrijft de uitkomst naar
 * `config/jwplayer-capabilities.ts`.
 *
 *   node --experimental-strip-types --no-warnings --import ./scripts/test-hooks.mjs scripts/jwplayer-probe.ts [rapport.json]
 *
 * Leest `JWPLAYER_SECRET` en `JWPLAYER_SITE_IDS` (of `JWPLAYER_SITE_ID`) uit de
 * omgeving of uit `.env.local`. Het secret komt niet in de uitvoer of het rapport.
 * Het optionele rapport bevat de losse checks en voorbeeldantwoorden; zet het
 * niet in git.
 */

import { existsSync, writeFileSync } from "node:fs";
import { JW_API, JwConfigError, leesSecret, leesSites } from "../lib/jwplayer/sites";
import { probeSite, type ProbeAntwoord, type ProbeVerzoek } from "../lib/jwplayer/probe";
import type { JwCapabilities } from "../config/jwplayer-capabilities";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

/** JW staat 60 verzoeken per minuut per token toe; de probe blijft daar ruim onder. */
const PAUZE_MS = 1_100;
const slaap = (ms: number) => new Promise((r) => setTimeout(r, ms));

let secret: string;
let sites: { id: string; label: string }[];
try {
  secret = leesSecret();
  sites = leesSites();
} catch (err) {
  if (err instanceof JwConfigError) {
    console.error(`${err.message}\nZet de site-id('s) van PSV Play, bijvoorbeeld JWPLAYER_SITE_IDS="abcd1234:PSV Play".`);
    process.exit(2);
  }
  throw err;
}

let aantal = 0;
async function verzoek({ method, pad, body }: ProbeVerzoek): Promise<ProbeAntwoord> {
  for (let poging = 0; ; poging++) {
    if (aantal++) await slaap(PAUZE_MS);
    const res = await fetch(`${JW_API}${pad}`, {
      method,
      headers: { Authorization: `Bearer ${secret}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && poging < 3) {
      const wacht = 15_000 * 2 ** poging;
      console.warn(`  429: wacht ${wacht / 1000} s`);
      await slaap(wacht);
      continue;
    }
    const tekst = await res.text();
    let json: unknown = tekst;
    try {
      json = JSON.parse(tekst);
    } catch {
      // geen JSON
    }
    return { status: res.status, body: json };
  }
}

const capabilities: JwCapabilities = { probedAt: new Date().toISOString(), sites: {} };
const rapport: Record<string, unknown> = {};

for (const site of sites) {
  console.log(`\n== ${site.label} (${site.id}) ==`);
  const uitkomst = await probeSite(site, verzoek);
  capabilities.sites[site.id] = uitkomst.capabilities;
  rapport[site.id] = uitkomst;
  for (const c of uitkomst.checks) {
    console.log(`${c.ok ? "OK  " : "NEE "} ${c.naam.padEnd(48)} ${String(c.status).padStart(3)}  rijen ${c.rijen}${c.melding ? `  ${c.melding}` : ""}`);
  }
  const k = uitkomst.capabilities;
  console.log(`\nOTT: ${k.ott.available ? (k.ott.hasData ? "data" : "werkt, geen data") : "niet beschikbaar"}; live-filter: ${k.live.filter ? (k.live.hasData ? "data" : "werkt, geen data") : "niet beschikbaar"}`);
  console.log(`Max. bereik per query: ${k.maxRangeDays ?? "?"} dagen${k.maxRangeIsLowerBound ? " (of meer)" : ""}; oudste dag met data: ${k.earliestDate ?? "onbekend"}`);
  console.log(`Management-velden: ${k.management.fields.join(", ") || "geen"}`);
}

const bestand = `/**
 * Wat de JW Player-API voor PSV Play kan, per property. Dit bestand wordt
 * geschreven door \`scripts/jwplayer-probe.ts\`; pas het niet met de hand aan.
 * UI en MCP-tools tonen alleen onderdelen die hier als beschikbaar staan.
 */

export interface SiteCapabilities {
  label: string;
  /** Per metric (\`plays\`, \`play_rate\`, \`25_percent_completes\`, …): werkt hij? */
  metrics: Record<string, boolean>;
  /** Per dimensie (\`eastern_date\`, \`tag\`, \`platform_id\`, …): werkt hij? */
  dimensions: Record<string, boolean>;
  includeMetadata: boolean;
  ott: { available: boolean; hasData: boolean; loggedInUniqueViewers: boolean };
  live: { filter: boolean; hasData: boolean };
  /** De schrijfwijze van \`order\` die de API accepteert, of \`null\` als sorteren niet werkt. */
  sort: "ascending" | "ASCENDING" | null;
  /** Het grootste geteste bereik (dagen) dat één query accepteert. */
  maxRangeDays: number | null;
  /** Ook het grootste geteste bereik werkte: de echte grens ligt mogelijk hoger. */
  maxRangeIsLowerBound: boolean;
  /** De oudste dag (eastern_date) met data. */
  earliestDate: string | null;
  management: { available: boolean; fields: string[] };
}

export interface JwCapabilities {
  probedAt: string | null;
  sites: Record<string, SiteCapabilities>;
}

export const JWPLAYER_CAPABILITIES: JwCapabilities = ${JSON.stringify(capabilities, null, 2)};
`;
writeFileSync("config/jwplayer-capabilities.ts", bestand);
console.log(`\nGeschreven: config/jwplayer-capabilities.ts (${aantal} verzoeken)`);

const rapportPad = process.argv[2];
if (rapportPad) {
  writeFileSync(rapportPad, JSON.stringify(rapport, null, 2));
  console.log(`Rapport: ${rapportPad}`);
}
