import { PAGES_MAP } from "./bunny";
import { FRAMEWORK_CSS, FRAMEWORK_JS, KIT_VERSIE } from "./kit";

/**
 * De Playable loader. De API van Playable kan de HTML, CSS en JS van een
 * `html-element` niet lezen of schrijven (zie `docs/playable-api.md`). Daarom
 * staat in Playable één keer een vast stukje code (`loaderFields`), dat de
 * echte pagina als bundel van de Bunny CDN laadt. PSV Tools maakt die bundel
 * (`buildBundle`) en zet hem op Bunny; een collega hoeft dan niet meer in
 * Playable te plakken.
 *
 * De bundel is één JavaScript-bestand, geladen met een `<script src>`: dat
 * werkt over domeinen heen zonder CORS, en HTML, CSS en JS komen altijd samen
 * binnen, nooit de ene versie naast de andere.
 */

/** Het element in Playable waar de pagina in komt. */
export const MOUNT_ID = "psvk-mount";

/**
 * Meer html-blokken. Staat er in Playable iets tussen de pagina, zoals een
 * formulier, dan is de pagina daar verdeeld over meer html-elementen. In PSV
 * Tools is het één HTML, met deze scheiding tussen de blokken. Blok 1 komt in
 * `#psvk-mount`, blok 2 in `#psvk-mount-2`, enzovoort. CSS en JavaScript
 * zijn er één keer, voor alle blokken samen.
 */
export const DEEL_SCHEIDING = "<!-- psvk-deel -->";
const DEEL_RE = /<!--\s*psvk-deel\b[\s\S]*?-->/gi;

/** De html-blokken van de pagina, van boven naar beneden. Altijd minstens één. */
export function splitsDelen(html: string): string[] {
  return html.split(DEEL_RE).map((d) => d.trim());
}

export function voegDelenSamen(delen: string[]): string {
  return delen.map((d) => d.trim()).join(`\n\n${DEEL_SCHEIDING}\n\n`);
}

/** Het element in Playable voor blok `i` (vanaf 0). */
export function mountId(i: number): string {
  return i === 0 ? MOUNT_ID : `${MOUNT_ID}-${i + 1}`;
}

/** Ruim boven een echte pagina (de kit zelf is zo'n 40.000 tekens), maar niet onbeperkt. */
export const MAX_FIELD_CHARS = 400_000;

export interface PageSource {
  html: string;
  css: string;
  js: string;
}

/**
 * Staat de kit al in de geplakte code? `eigen`: precies de kit die PSV Tools
 * meelevert, die halen we eruit. `andere-versie`: een andere versie van de
 * kit, die laten we staan. `geen`: dan zet PSV Tools de kit erbij.
 */
export type KitMatch = "eigen" | "andere-versie" | "geen";

export function splitKit(code: string, framework: string): { rest: string; kit: KitMatch } {
  const kit = framework.trim();
  // Elke kopie eruit: bij meer html-elementen in Playable stond de Kit er soms in elk.
  if (code.includes(kit)) return { rest: code.split(kit).join("").trim(), kit: "eigen" };
  if (/PSV CAMPAIGN KIT/i.test(code)) return { rest: code.trim(), kit: "andere-versie" };
  return { rest: code.trim(), kit: "geen" };
}

/**
 * De code zonder de Kit, zoals de collega en de assistent hem zien. Een
 * andere versie van de Kit blijft staan; PSV Tools zet de eigen Kit er bij
 * het publiceren bij.
 */
export function zonderKit(bron: PageSource): PageSource {
  return {
    html: bron.html.trim(),
    css: splitKit(bron.css, FRAMEWORK_CSS).rest,
    js: splitKit(bron.js, FRAMEWORK_JS).rest,
  };
}

export interface PreparedPage {
  html: string;
  /** De html-blokken, elk voor een eigen element in Playable. */
  delen: string[];
  /** Alle CSS: de kit plus de pagina-eigen CSS. */
  css: string;
  /** De kit-JS, of leeg als de geplakte JS zelf een andere versie van de kit bevat. */
  kitJs: string;
  /** De pagina-eigen JS (met daarin de kit als het een andere versie is). */
  pageJs: string;
  warnings: string[];
}

export class PageSourceError extends Error {}

/** Controleert of JavaScript te lezen is, zonder hem uit te voeren. */
function checkSyntax(js: string, label: string): void {
  try {
    // Alleen parsen: de functie wordt nooit aangeroepen.
    new Function(js);
  } catch (err) {
    throw new PageSourceError(`${label} bevat een fout: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function preparePage(source: PageSource): PreparedPage {
  for (const [label, value] of [
    ["De HTML", source.html],
    ["De CSS", source.css],
    ["De JavaScript", source.js],
  ] as const) {
    if (value.length > MAX_FIELD_CHARS) {
      throw new PageSourceError(`${label} is te groot (${value.length} tekens, maximaal ${MAX_FIELD_CHARS}).`);
    }
  }

  const html = source.html.trim();
  if (!html) throw new PageSourceError("De HTML is leeg.");

  const warnings: string[] = [];
  if (!/id\s*=\s*["']?psvk-app\b/.test(html)) {
    warnings.push("De HTML heeft geen element met id=\"psvk-app\". Daar zoekt de kit naar; zonder doet de kit niets.");
  }
  const delen = splitsDelen(html);
  delen.forEach((deel, i) => {
    if (!deel) warnings.push(`Html-blok ${i + 1} is leeg.`);
  });

  const css = splitKit(source.css, FRAMEWORK_CSS);
  const fullCss =
    css.kit === "andere-versie" ? css.rest : [FRAMEWORK_CSS.trim(), css.rest].filter(Boolean).join("\n\n");
  if (css.kit === "andere-versie") {
    warnings.push(`De CSS bevat een andere versie van de kit dan ${KIT_VERSIE}. Die is gebruikt zoals hij is.`);
  }

  const js = splitKit(source.js, FRAMEWORK_JS);
  const kitJs = js.kit === "andere-versie" ? "" : FRAMEWORK_JS.trim();
  if (js.kit === "andere-versie") {
    warnings.push(
      `De JavaScript bevat een andere versie van de kit dan ${KIT_VERSIE}. Die is gebruikt zoals hij is; ` +
        "bouwt Playable de pagina opnieuw op, dan start de kit niet opnieuw."
    );
  }

  checkSyntax(js.rest, "De JavaScript");
  return { html, delen, css: fullCss, kitJs, pageJs: js.rest, warnings };
}

export interface BundleMeta {
  campaignId: number;
  publishedAt: string;
}

/**
 * De bundel. Hij wacht op `#psvk-mount` (en `#psvk-mount-2` enzovoort bij meer
 * html-blokken), zet de CSS in de `<head>` en elk blok in zijn eigen mount,
 * voert de pagina-JS één keer uit (die luistert naar `psvk:ready`) en start
 * de kit. Bouwt Playable de pagina opnieuw op en is de inhoud weg, dan zet hij
 * hem terug en start de kit opnieuw, zodat filters, uitklappers en tellers
 * blijven werken.
 *
 * De kit start op het eerste `#psvk-app` van de pagina. Heeft elk blok een
 * eigen `#psvk-app`, dan start de bundel de kit voor elk blok apart: de
 * andere heten heel even anders, zodat de kit dit blok vindt. Zo werken ook
 * de uitklappers onder een formulier. `psvk:ready` komt dan per blok, met dat
 * blok in `e.detail.root`.
 *
 * Geen `'use strict'` om de pagina-JS heen: die is geschreven voor het
 * JS-veld van Playable en hoeft daar niet aan te voldoen.
 */
export function buildBundle(page: PreparedPage, meta: BundleMeta): string {
  return asciiOnly(rawBundle(page, meta));
}

/**
 * Vervangt elk teken buiten ASCII door een `\uXXXX`-escape. Bunny geeft het
 * bestand geen tekenset mee; een browser die het als Western leest, maakt van
 * "één" dan "Ã©Ã©n". In JavaScript betekent de escape in strings, regexen en
 * namen hetzelfde als het teken zelf, dus de pagina verandert niet; alleen
 * in commentaar staat de escape letterlijk.
 */
export function asciiOnly(js: string): string {
  return js.replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function rawBundle(page: PreparedPage, meta: BundleMeta): string {
  return `/* PSV Campaign Kit ${KIT_VERSIE} via de Playable loader, campagne ${meta.campaignId}.
   Gepubliceerd ${meta.publishedAt} vanuit PSV Tools. Niet met de hand aanpassen:
   de inhoud beheer je in PSV Tools, Beta tools, Playable loader. */
(function () {
  if (window.__psvkBundel) return;
  window.__psvkBundel = { campagne: ${meta.campaignId}, gepubliceerd: ${JSON.stringify(meta.publishedAt)} };

  var MOUNT_ID = ${JSON.stringify(MOUNT_ID)};
  var STIJL_ID = "psvk-bundel-stijl";
  var CSS = ${JSON.stringify(page.css)};
  var DELEN = ${JSON.stringify(page.delen)};

  function paginaJs() {
${page.pageJs}
  }

  function kit() {
${page.kitJs}
  }

  var paginaGestart = false;

  function mountId(i) {
    return i === 0 ? MOUNT_ID : MOUNT_ID + "-" + (i + 1);
  }

  function zetStijl() {
    if (document.getElementById(STIJL_ID)) return;
    var stijl = document.createElement("style");
    stijl.id = STIJL_ID;
    stijl.textContent = CSS;
    (document.head || document.documentElement).appendChild(stijl);
  }

  function startKit() {
    var wortels = Array.prototype.slice.call(document.querySelectorAll('[id="psvk-app"]'));
    wortels.forEach(function (wortel) {
      if (wortel.__psvkGestart || !wortel.closest("[data-psvk-bundel]")) return;
      wortel.__psvkGestart = true;
      var anderen = wortels.filter(function (w) { return w !== wortel; });
      anderen.forEach(function (w) { w.id = "psvk-app-wacht"; });
      try { kit(); } catch (e) { console.error("[psvk] kit", e); }
      anderen.forEach(function (w) { w.id = "psvk-app"; });
    });
  }

  function plaats() {
    var nieuw = false;
    for (var i = 0; i < DELEN.length; i++) {
      var mount = document.getElementById(mountId(i));
      if (!mount) continue;
      zetStijl();
      if (mount.querySelector("[data-psvk-bundel]")) continue;
      mount.innerHTML = '<div data-psvk-bundel="${meta.campaignId}" data-psvk-deel="' + (i + 1) + '">' + DELEN[i] + "</div>";
      mount.setAttribute("data-psvk-geladen", "");
      nieuw = true;
    }
    if (!nieuw) return;
    if (!paginaGestart) {
      paginaGestart = true;
      try { paginaJs(); } catch (e) { console.error("[psvk] pagina-JavaScript", e); }
    }
    startKit();
  }

  var gepland = false;
  function plan() {
    if (gepland) return;
    gepland = true;
    (window.requestAnimationFrame || setTimeout)(function () {
      gepland = false;
      plaats();
    });
  }

  plaats();
  new MutationObserver(plan).observe(document.documentElement, { childList: true, subtree: true });
})();
`;
}

/**
 * Wat een collega één keer in de drie velden van het `html-element` in Playable
 * zet. De `?v=` verandert elke minuut, zodat de browser hooguit een minuut een
 * oude versie bewaart. Bunny negeert de `?v=`; daar leegt PSV Tools de cache na
 * elke publicatie (`purgeBundle`).
 */
/** Wat er in het html-element van blok `i` (vanaf 1) komt: alleen de plek voor dat blok. */
export function mountHtml(i: number): string {
  return `<div id="${mountId(i)}"></div>`;
}

export function loaderFields(campaignId: number, bundleUrl: string): PageSource {
  return {
    html: `<div id="${MOUNT_ID}"></div>`,
    css: `/* Playable loader: de opmaak komt mee met de pagina uit PSV Tools. */
#${MOUNT_ID} { min-height: 100vh; }
#${MOUNT_ID}[data-psvk-geladen] { min-height: 0; }`,
    js: `/* Playable loader, campagne ${campaignId}. Laadt de pagina uit PSV Tools via Bunny.
   Niet aanpassen: de inhoud beheer je in PSV Tools, Beta tools, Playable loader. */
(function () {
  if (document.querySelector("script[data-psvk-bundel]")) return;
  var s = document.createElement("script");
  s.src = ${JSON.stringify(bundleUrl)} + "?v=" + Math.floor(Date.now() / 60000);
  s.async = true;
  s.setAttribute("data-psvk-bundel", "${campaignId}");
  s.onerror = function () { console.error("[psvk] De pagina kon niet worden geladen van " + s.src); };
  (document.head || document.documentElement).appendChild(s);
})();`,
  };
}

/** Het pad op Bunny, binnen de map `playable` waar ook de achtergronden staan. */
export function bundlePath(campaignId: number): string {
  return `${PAGES_MAP}/${campaignId}/page.js`;
}

export function parseCampaignId(raw: unknown): number | null {
  const text = String(raw ?? "").trim().replace(/^#/, "");
  if (!/^\d{1,12}$/.test(text)) return null;
  const id = Number(text);
  return id > 0 ? id : null;
}
