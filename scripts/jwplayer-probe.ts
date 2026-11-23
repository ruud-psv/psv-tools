/**
 * Capability probe voor PSV Play (JW Player), lokaal. Test per property welke
 * dimensies, metrics, bronnen en endpoints werken en print de uitkomst.
 *
 *   node --experimental-strip-types --no-warnings --import ./scripts/test-hooks.mjs scripts/jwplayer-probe.ts [rapport.json]
 *
 * Leest `JWPLAYER_SECRET` (en eventueel `JWPLAYER_SITE_IDS`) uit de omgeving of
 * uit `.env.local`. Het secret komt niet in de uitvoer of het rapport.
 *
 * Op Vercel draait dezelfde probe vanzelf (bij de eerste vraag en elke maandag)
 * en staat de uitkomst in Blob; met de hand via `/api/psv-play/probe?opnieuw=1`.
 * Dit script is om lokaal te kijken; het schrijft niets naar Blob.
 */

import { existsSync, writeFileSync } from "node:fs";
import { jwRuw } from "../lib/jwplayer/client";
import { probeSite } from "../lib/jwplayer/probe";
import { JwConfigError, leesSecret, leesSites } from "../lib/jwplayer/sites";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

let secret: string;
try {
  secret = leesSecret();
} catch (err) {
  if (err instanceof JwConfigError) {
    console.error(err.message);
    process.exit(2);
  }
  throw err;
}

const { ruw } = jwRuw({ secret });
const rapport: Record<string, unknown> = {};
let fout = false;

for (const site of leesSites()) {
  console.log(`\n== ${site.label} (${site.id}) ==`);
  const uitkomst = await probeSite(site, ({ method, pad, body }) => ruw(method, pad, body));
  rapport[site.id] = uitkomst;
  for (const c of uitkomst.checks) {
    console.log(`${c.ok ? "OK  " : "NEE "} ${c.naam.padEnd(46)} ${String(c.status).padStart(3)}  rijen ${c.rijen}${c.melding ? `  ${c.melding}` : ""}`);
  }
  const k = uitkomst.capabilities;
  if (k.metrics.plays === null) fout = true;
  const ja = (o: Record<string, unknown>) => Object.entries(o).filter(([, v]) => v).map(([n]) => n).join(", ") || "geen";
  const nee = (o: Record<string, unknown>) => Object.entries(o).filter(([, v]) => !v).map(([n]) => n).join(", ") || "geen";
  console.log(`\nMetrics wel: ${ja(k.metrics)}\nMetrics niet: ${nee(k.metrics)}`);
  console.log(`Dimensies wel: ${ja(k.dimensions)}\nDimensies niet: ${nee(k.dimensions)}`);
  console.log(`include_metadata: ${k.includeMetadata ? "ja" : "nee"}; totaal zonder dimensie: ${k.totalsWithoutDimension ? "ja" : "nee"}`);
  console.log(`OTT: ${k.ott.available ? (k.ott.hasData ? "data" : "werkt, geen data") : "niet beschikbaar"}; logged_in_unique_viewers: ${k.ott.loggedInUniqueViewers ? "ja" : "nee"}`);
  console.log(`Live-filter: ${k.live.filter ? (k.live.hasData ? "data" : "werkt, geen data") : "niet beschikbaar"}`);
  console.log(`Max. bereik per query: ${k.maxRangeDays ?? "?"} dagen${k.maxRangeIsLowerBound ? " (of meer)" : ""}; oudste dag met data: ${k.earliestDate ?? "onbekend"}`);
  console.log(`Management API: ${k.management.available ? k.management.fields.join(", ") : "niet beschikbaar"}`);
}

const pad = process.argv[2];
if (pad) {
  writeFileSync(pad, JSON.stringify(rapport, null, 2));
  console.log(`\nRapport: ${pad}`);
}
if (fout) process.exit(1);
