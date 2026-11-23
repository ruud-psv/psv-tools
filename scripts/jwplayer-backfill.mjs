/**
 * Backfill van de dagelijkse snapshots van PSV Play: legt elke ontbrekende
 * JW-dag vast vanaf een datum (of vanaf de oudste dag die de API kent). Het
 * werk gebeurt op Vercel (`/api/psv-play/snapshot`), waar het JW-secret en de
 * Blob-opslag staan; de route start zelf vervolgruns tot alles binnen is.
 *
 *   CRON_SECRET=… node scripts/jwplayer-backfill.mjs [JJJJ-MM-DD|begin] [https://tools.psv.nl]
 *
 * Zonder datum: `begin`. Draai het gerust opnieuw: dagen die er al zijn,
 * worden overgeslagen.
 */

const van = process.argv[2] ?? "begin";
const basis = (process.argv[3] ?? process.env.PSV_TOOLS_URL ?? "https://tools.psv.nl").replace(/\/$/, "");
const geheim = process.env.CRON_SECRET;

if (!geheim) {
  console.error("Zet CRON_SECRET (dezelfde waarde als in Vercel).");
  process.exit(2);
}
if (van !== "begin" && !/^\d{4}-\d{2}-\d{2}$/.test(van)) {
  console.error("Geef de startdatum als JJJJ-MM-DD of als begin.");
  process.exit(2);
}

const url = `${basis}/api/psv-play/snapshot?van=${encodeURIComponent(van)}`;
console.log(`Backfill starten: ${url}`);
const res = await fetch(url, { headers: { Authorization: `Bearer ${geheim}` } });
const tekst = await res.text();
console.log(`Status ${res.status}`);
console.log(tekst.slice(0, 4000));
if (!res.ok) process.exit(1);
console.log("\nDe eerste run is klaar; de rest loopt als ketting op Vercel. Bekijk de voortgang in de logs ([psv-play] snapshot).");
