/**
 * Domeinscan: wat draait er op psv.<tld> voor álle topleveldomeinen?
 *
 * Haalt de actuele lijst topleveldomeinen op bij IANA (± 1.450 stuks), vult die
 * aan met veelgebruikte tweede niveaus (co.uk, com.au, com.br, …) en kijkt per
 * domein:
 *
 *   1. DNS: bestaat het domein, en zo ja, wijst het naar een webserver?
 *      TLD's die álles laten resolven (wildcard) worden herkend en overgeslagen.
 *   2. Website: opent de pagina in een headless Chromium, maakt een screenshot
 *      en noteert eindadres na doorsturen, titel, HTTP-status en of er een
 *      wachtwoordveld op staat.
 *   3. Indeling: eigen PSV-site (of doorgestuurd naar een eigen domein),
 *      mogelijk verdacht (noemt PSV / Eindhoven / tickets e.d. maar is niet van
 *      ons), geparkeerd of te koop, ander gebruik, of geen website.
 *
 * Uitvoer in een map per datum: `rapport.html` met alle screenshots (filterbaar
 * per categorie), `resultaten.json`, `resultaten.csv` en de losse screenshots.
 *
 * Gebruik:
 *
 *   npm i -D playwright && npx playwright install chromium   (eenmalig)
 *   node scripts/psv-domeinscan.mjs
 *
 * Opties:
 *   --naam psv              het label vóór de TLD (standaard: psv)
 *   --eigen psv.nl,psv.com  domeinen die van ons zijn; doorsturen hierheen = "eigen"
 *   --uit <map>             uitvoermap (standaard: domeinscan/<datum>)
 *   --parallel 6            aantal gelijktijdige browsertabbladen
 *   --alleen nl,com,co.uk   alleen deze TLD's scannen (handig om te testen)
 *   --www                   ook www.psv.<tld> proberen als psv.<tld> niets geeft
 *   --vorige <json>         vergelijk met een eerdere resultaten.json en markeer
 *                           wat nieuw of veranderd is
 *   --dns 1.1.1.1,8.8.8.8   andere DNS-servers gebruiken
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Resolver } from "node:dns/promises";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------- opties

const args = parseArgs(process.argv.slice(2));
const NAAM = String(args.naam ?? "psv").toLowerCase();
const EIGEN = String(args.eigen ?? "psv.nl")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);
const PARALLEL = Math.max(1, Number(args.parallel ?? 6));
const DATUM = new Date().toISOString().slice(0, 10);
const UIT = String(args.uit ?? join("domeinscan", DATUM));
const PAGINA_TIMEOUT = 25_000;

const resolver = new Resolver({ timeout: 4000, tries: 2 });
if (args.dns) resolver.setServers(String(args.dns).split(","));

// Veelgebruikte tweede niveaus onder landcodes, waar je als bedrijf vaak
// registreert (psv.co.uk i.p.v. psv.uk).
const TWEEDE_NIVEAU = [
  "co.uk", "org.uk", "me.uk", "com.au", "net.au", "org.au", "co.nz", "com.br",
  "com.ar", "com.mx", "com.co", "com.pe", "com.ve", "com.ec", "com.uy",
  "com.tr", "com.cn", "com.hk", "com.tw", "com.sg", "com.my", "com.ph",
  "co.jp", "ne.jp", "co.kr", "co.in", "co.id", "co.th", "com.vn", "com.pk",
  "co.za", "com.ng", "co.ke", "com.eg", "com.sa", "co.il", "com.ua", "com.pl",
  "com.ru", "com.es", "com.pt", "com.gr", "com.cy", "com.mt", "co.at",
  "eu.com", "us.com", "uk.com", "de.com", "nl.com",
];

// Teksten die een parkeerpagina of "te koop"-pagina verraden.
const PARKEER =
  /domain (name )?(is |may be )?for sale|buy this domain|this domain (name )?is (for sale|parked|available)|make an offer|domein(naam)? .{0,20}(te koop|beschikbaar)|sedo|afternic|dan\.com|hugedomains|bodis|parkingcrew|above\.com|undeveloped|godaddy|domain parking|parked (free|domain)|zu verkaufen|inquire (about|now)|related searches/i;

// Teksten die op PSV als club wijzen (bij een site die niet van ons is: verdacht).
const PSV_CLUB =
  /\b(psv eindhoven|philips stadion|eindhoven|eredivisie|seizoenkaart|clubcard|boerenvreugd|rood[- ]wit|psv fan|psv shop|psv tickets?|psv supporters?)\b/i;

// ---------------------------------------------------------------- hoofdlijn

const playwright = await laadPlaywright();
mkdirSync(join(UIT, "screenshots"), { recursive: true });

const tlds = await haalTlds();
const domeinen = [...new Set(tlds.map((t) => `${NAAM}.${t}`))];
log(`${domeinen.length} domeinen om te controleren (${NAAM}.<tld>).`);

// 1. DNS
const wildcardCache = new Map();
let klaar = 0;
const dns = await pool(domeinen, 40, async (domein) => {
  const r = await dnsInfo(domein);
  if (++klaar % 100 === 0) log(`  DNS: ${klaar}/${domeinen.length}`);
  return r;
});
const metWebserver = dns.filter((d) => d.status === "resolveert");
log(
  `DNS klaar: ${dns.filter((d) => d.geregistreerd).length} geregistreerd, ` +
    `${metWebserver.length} met een webadres, ` +
    `${dns.filter((d) => d.status === "wildcard").length} wildcard-TLD's overgeslagen.`,
);

// 2. Website + screenshot
const browser = await playwright.chromium.launch();
klaar = 0;
const web = await pool(metWebserver, PARALLEL, async (d) => {
  const r = await bezoek(browser, d.domein);
  klaar++;
  log(`  [${klaar}/${metWebserver.length}] ${d.domein} → ${r.fout ?? `${r.httpStatus} ${r.eindUrl}`}`);
  return r;
});
await browser.close();

// 3. Samenvoegen en indelen
const webPerDomein = new Map(web.map((w) => [w.domein, w]));
const vorige = args.vorige ? leesVorige(String(args.vorige)) : null;
const resultaten = dns.map((d) => {
  const w = webPerDomein.get(d.domein) ?? null;
  const r = { ...d, ...(w ?? {}), categorie: deelIn(d, w) };
  if (vorige) r.wijziging = vergelijk(r, vorige.get(r.domein));
  return r;
});

const VOLGORDE = ["verdacht", "ander gebruik", "geparkeerd", "eigen", "geen website", "geregistreerd, geen webadres"];
resultaten.sort(
  (a, b) => rang(a.categorie) - rang(b.categorie) || a.domein.localeCompare(b.domein),
);

writeFileSync(join(UIT, "resultaten.json"), JSON.stringify({ datum: DATUM, naam: NAAM, eigen: EIGEN, resultaten }, null, 2));
writeFileSync(join(UIT, "resultaten.csv"), naarCsv(resultaten));
writeFileSync(join(UIT, "rapport.html"), naarHtml(resultaten));

const telling = {};
for (const r of resultaten) telling[r.categorie] = (telling[r.categorie] ?? 0) + 1;
log("\nSamenvatting:");
for (const c of [...VOLGORDE, "niet geregistreerd", "wildcard"]) if (telling[c]) log(`  ${c.padEnd(30)} ${telling[c]}`);
log(`\nRapport: ${join(UIT, "rapport.html")}`);

// ---------------------------------------------------------------- DNS

async function dnsInfo(domein) {
  const [a, aaaa, ns] = await Promise.all([
    probeer(() => resolver.resolve4(domein)),
    probeer(() => resolver.resolve6(domein)),
    probeer(() => resolver.resolveNs(domein)),
  ]);
  const ips = [...(a.waarde ?? []), ...(aaaa.waarde ?? [])];
  const bestaat = (r) => r.ok || r.code === "ENODATA";
  const geregistreerd = bestaat(a) || bestaat(aaaa) || bestaat(ns);
  const onzeker = [a, aaaa, ns].every((r) => !r.ok && r.code !== "ENOTFOUND" && r.code !== "ENODATA");

  let status;
  if (ips.length) {
    status = (await isWildcard(domein, ips)) ? "wildcard" : "resolveert";
  } else if (geregistreerd) {
    status = "geregistreerd, geen webadres";
  } else {
    status = onzeker ? "dns-fout" : "niet geregistreerd";
  }
  return {
    domein,
    tld: domein.slice(NAAM.length + 1),
    status,
    geregistreerd: status === "resolveert" || status === "geregistreerd, geen webadres",
    ips,
    nameservers: ns.waarde ?? [],
    dnsFout: onzeker ? a.code : undefined,
  };
}

/** Sommige TLD's geven voor élk niet-bestaand domein een adres terug. */
async function isWildcard(domein, ips) {
  const tld = domein.slice(NAAM.length + 1);
  if (!wildcardCache.has(tld)) {
    const willekeurig = `zz${randomBytes(6).toString("hex")}.${tld}`;
    wildcardCache.set(
      tld,
      probeer(() => resolver.resolve4(willekeurig)).then((r) => r.waarde ?? []),
    );
  }
  const wild = await wildcardCache.get(tld);
  return wild.length > 0 && ips.some((ip) => wild.includes(ip));
}

// ---------------------------------------------------------------- website

async function bezoek(browser, domein) {
  const pogingen = [`https://${domein}/`, `http://${domein}/`];
  if (args.www) pogingen.push(`https://www.${domein}/`, `http://www.${domein}/`);

  const context = await browser.newContext({
    ignoreHTTPSErrors: true, // phishingsites hebben vaak een slecht certificaat
    viewport: { width: 1280, height: 800 },
    locale: "nl-NL",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  });
  let laatsteFout = null;
  try {
    for (const url of pogingen) {
      // Per poging een vers tabblad: anders onderbreekt de foutpagina van een
      // mislukte https-poging de volgende navigatie.
      const page = await context.newPage();
      try {
        const antwoord = await page.goto(url, { waitUntil: "domcontentloaded", timeout: PAGINA_TIMEOUT });
        await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
        await page.waitForTimeout(1000);

        const bestand = join("screenshots", `${domein}.png`);
        await page.screenshot({ path: join(UIT, bestand), timeout: 10_000 });
        const info = await page.evaluate(() => ({
          titel: document.title,
          tekst: (document.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 4000),
          wachtwoordveld: !!document.querySelector("input[type=password]"),
        }));
        return {
          domein,
          geprobeerd: url,
          eindUrl: page.url(),
          eindHost: new URL(page.url()).hostname.toLowerCase(),
          httpStatus: antwoord?.status() ?? null,
          https: page.url().startsWith("https:"),
          titel: info.titel.trim().slice(0, 200),
          fragment: info.tekst.slice(0, 300),
          tekst: info.tekst,
          wachtwoordveld: info.wachtwoordveld,
          screenshot: bestand,
        };
      } catch (e) {
        laatsteFout = korteFout(e);
        await page.close().catch(() => {});
      }
    }
    return { domein, fout: laatsteFout };
  } finally {
    await context.close().catch(() => {});
  }
}

// ---------------------------------------------------------------- indelen

function deelIn(d, w) {
  if (d.status === "niet geregistreerd" || d.status === "dns-fout") return "niet geregistreerd";
  if (d.status === "wildcard") return "wildcard";
  if (d.status === "geregistreerd, geen webadres") return "geregistreerd, geen webadres";
  if (!w || w.fout) return "geen website";

  const eigen = EIGEN.some((e) => w.eindHost === e || w.eindHost.endsWith(`.${e}`));
  if (eigen) return "eigen";

  const tekst = `${w.titel} ${w.tekst}`;
  if (PARKEER.test(tekst) || tekst.trim().length < 40) return "geparkeerd";
  if (PSV_CLUB.test(tekst) || (w.wachtwoordveld && /\bpsv\b/i.test(tekst))) return "verdacht";
  return "ander gebruik";
}

function rang(c) {
  const i = VOLGORDE.indexOf(c);
  return i === -1 ? 99 : i;
}

function leesVorige(pad) {
  const data = JSON.parse(readFileSync(pad, "utf8"));
  return new Map(data.resultaten.map((r) => [r.domein, r]));
}

function vergelijk(nu, toen) {
  if (!toen) return "nieuw";
  if (toen.categorie !== nu.categorie) return `was: ${toen.categorie}`;
  if ((toen.eindHost ?? "") !== (nu.eindHost ?? "")) return `was: ${toen.eindHost ?? "—"}`;
  if ((toen.titel ?? "") !== (nu.titel ?? "")) return "titel veranderd";
  return undefined;
}

// ---------------------------------------------------------------- uitvoer

function naarCsv(rijen) {
  const kolommen = ["domein", "categorie", "wijziging", "status", "httpStatus", "eindUrl", "titel", "wachtwoordveld", "ips", "nameservers", "fout"];
  const cel = (v) => {
    const s = Array.isArray(v) ? v.join(" ") : v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [kolommen.join(","), ...rijen.map((r) => kolommen.map((k) => cel(r[k])).join(","))].join("\n");
}

function naarHtml(rijen) {
  const hier = dirname(fileURLToPath(import.meta.url));
  const tokensPad = join(hier, "..", "packages", "psv-branding", "css", "tokens.css");
  const tokens = existsSync(tokensPad) ? readFileSync(tokensPad, "utf8") : "";
  const fontsPad = join(hier, "..", "packages", "psv-branding", "css", "fonts.css");
  // De fonts verwijzen relatief naar ../fonts; vanuit de rapportmap herleiden.
  const fonts = existsSync(fontsPad)
    ? readFileSync(fontsPad, "utf8").replace(/url\((['"]?)\.\.\//g, (_, q) => `url(${q}${relative(UIT, join(hier, "..", "packages", "psv-branding")).replace(/\\/g, "/")}/`)
    : "";

  const zichtbaar = rijen.filter((r) => !["niet geregistreerd", "wildcard"].includes(r.categorie));
  const categorieen = VOLGORDE.filter((c) => zichtbaar.some((r) => r.categorie === c));
  const telling = (c) => zichtbaar.filter((r) => r.categorie === c).length;
  const klasse = (c) => c.replace(/[^a-z]+/g, "-");

  const kaarten = zichtbaar
    .map((r) => {
      const beeld = r.screenshot
        ? `<a href="${esc(r.screenshot)}" target="_blank"><img loading="lazy" src="${esc(r.screenshot)}" alt="Screenshot van ${esc(r.domein)}"></a>`
        : `<div class="leeg">${esc(r.fout ?? r.status)}</div>`;
      const door =
        r.eindHost && r.eindHost !== r.domein && r.eindHost !== `www.${r.domein}`
          ? `<div class="meta">Doorgestuurd naar <strong>${esc(r.eindHost)}</strong></div>`
          : "";
      return `<article class="kaart" data-cat="${esc(r.categorie)}">
  ${beeld}
  <div class="body">
    <div class="kop"><a href="${esc(r.eindUrl ?? `http://${r.domein}`)}" target="_blank" rel="noopener noreferrer">${esc(r.domein)}</a>
      <span class="tag tag--${klasse(r.categorie)}">${esc(r.categorie)}</span>
      ${r.wijziging ? `<span class="tag tag--nieuw">${esc(r.wijziging)}</span>` : ""}</div>
    ${r.titel ? `<div class="titel">${esc(r.titel)}</div>` : ""}
    ${door}
    <div class="meta">${[r.httpStatus && `HTTP ${r.httpStatus}`, r.https === false && "geen https", r.wachtwoordveld && "⚠ wachtwoordveld", r.ips?.slice(0, 2).join(", ")].filter(Boolean).map(esc).join(" · ")}</div>
  </div>
</article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Domeinscan ${esc(NAAM)}.* — ${DATUM}</title>
<style>
${fonts}
${tokens}
* { box-sizing: border-box; }
body { margin: 0; font-family: var(--font-text); background: var(--color-bg-page); color: var(--color-text-default); }
header { background: var(--color-neutral-dark); color: var(--color-white); padding: 24px 16px; }
h1 { font-family: var(--font-condensed); text-transform: uppercase; margin: 0 0 4px; font-size: var(--text-3xl); }
header p { margin: 0; color: var(--color-gray-08); }
nav { display: flex; flex-wrap: wrap; gap: 8px; padding: 16px; position: sticky; top: 0; background: var(--color-bg-page); z-index: 1; }
nav button { font-family: var(--font-condensed); text-transform: uppercase; letter-spacing: .05em; border: 2px solid var(--color-neutral-dark); background: var(--color-white); padding: 6px 12px; cursor: pointer; }
nav button.aan { background: var(--color-neutral-dark); color: var(--color-white); }
main { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; padding: 0 16px 32px; }
.kaart { background: var(--color-white); border-top: 4px solid var(--color-gray-08); overflow: hidden; }
.kaart[data-cat="verdacht"] { border-top-color: var(--color-error); }
.kaart[data-cat="eigen"] { border-top-color: var(--color-success); }
.kaart img { display: block; width: 100%; aspect-ratio: 16/10; object-fit: cover; object-position: top; border-bottom: 1px solid var(--color-gray-07); }
.leeg { aspect-ratio: 16/10; display: grid; place-items: center; padding: 16px; text-align: center; color: var(--color-gray-10); background: var(--color-off-white); font-size: var(--text-sm); }
.body { padding: 12px; }
.kop { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.kop a { font-family: var(--font-condensed); font-size: var(--text-lg); color: var(--color-text-default); text-decoration: none; margin-right: auto; }
.titel { margin-top: 6px; }
.meta { margin-top: 4px; font-size: var(--text-sm); color: var(--color-gray-10); word-break: break-all; }
.tag { font-family: var(--font-condensed); text-transform: uppercase; font-size: var(--text-xs); letter-spacing: .05em; padding: 2px 6px; background: var(--color-gray-07); }
.tag--verdacht { background: var(--color-error); color: var(--color-white); }
.tag--eigen { background: var(--color-success); color: var(--color-white); }
.tag--geparkeerd { background: var(--color-warning-bg); color: var(--color-warning); }
.tag--ander-gebruik { background: var(--color-info-bg); color: var(--color-info); }
.tag--nieuw { background: var(--color-gold); color: var(--color-white); }
.verborgen { display: none; }
</style></head>
<body>
<header>
  <h1>Domeinscan ${esc(NAAM)}.*</h1>
  <p>${DATUM} · ${rijen.length} domeinen gecontroleerd · ${zichtbaar.length} geregistreerd · eigen domeinen: ${esc(EIGEN.join(", "))}</p>
</header>
<nav>
  <button class="aan" data-filter="">Alles (${zichtbaar.length})</button>
  ${categorieen.map((c) => `<button data-filter="${esc(c)}">${esc(c)} (${telling(c)})</button>`).join("\n  ")}
</nav>
<main>
${kaarten}
</main>
<script>
document.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll("nav button").forEach((x) => x.classList.toggle("aan", x === b));
  document.querySelectorAll(".kaart").forEach((k) => k.classList.toggle("verborgen", !!b.dataset.filter && k.dataset.cat !== b.dataset.filter));
}));
</script>
</body></html>`;
}

// ---------------------------------------------------------------- hulpjes

async function haalTlds() {
  if (args.alleen) return String(args.alleen).split(",").map((t) => t.trim().toLowerCase().replace(/^\./, ""));
  try {
    const res = await fetch("https://data.iana.org/TLD/tlds-alpha-by-domain.txt");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const lijst = (await res.text())
      .split("\n")
      .map((r) => r.trim().toLowerCase())
      .filter((r) => r && !r.startsWith("#")); // punycode (xn--) gaat zo de resolver in
    log(`IANA: ${lijst.length} topleveldomeinen.`);
    return [...lijst, ...TWEEDE_NIVEAU];
  } catch (e) {
    console.error(`Kon de TLD-lijst van IANA niet ophalen (${e.message}).`);
    process.exit(1);
  }
}

async function laadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    console.error(
      "Playwright ontbreekt. Installeer het eenmalig met:\n\n" +
        "  npm i -D playwright\n  npx playwright install chromium\n",
    );
    process.exit(1);
  }
}

async function probeer(fn) {
  try {
    return { ok: true, waarde: await fn() };
  } catch (e) {
    return { ok: false, code: e.code };
  }
}

async function pool(items, n, fn) {
  const uit = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const mijn = i++;
        uit[mijn] = await fn(items[mijn]);
      }
    }),
  );
  return uit;
}

function korteFout(e) {
  const m = String(e?.message ?? e).split("\n")[0];
  return m.replace(/^page\.goto: /, "").replace(/ at https?:\/\/\S+$/, "").slice(0, 120);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function parseArgs(lijst) {
  const uit = {};
  for (let i = 0; i < lijst.length; i++) {
    const a = lijst[i];
    if (!a.startsWith("--")) continue;
    const [sleutel, waarde] = a.slice(2).split("=", 2);
    if (waarde !== undefined) uit[sleutel] = waarde;
    else if (lijst[i + 1] && !lijst[i + 1].startsWith("--")) uit[sleutel] = lijst[++i];
    else uit[sleutel] = true;
  }
  return uit;
}

function log(...m) {
  console.log(...m);
}
