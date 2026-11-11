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
  if (code.includes(kit)) return { rest: code.replace(kit, "").trim(), kit: "eigen" };
  if (/PSV CAMPAIGN KIT/i.test(code)) return { rest: code.trim(), kit: "andere-versie" };
  return { rest: code.trim(), kit: "geen" };
}

export interface PreparedPage {
  html: string;
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
  return { html, css: fullCss, kitJs, pageJs: js.rest, warnings };
}

export interface BundleMeta {
  campaignId: number;
  publishedAt: string;
}

/**
 * De bundel. Hij wacht op `#psvk-mount`, zet de CSS in de `<head>` en de HTML
 * in de mount, voert de pagina-JS één keer uit (die luistert naar
 * `psvk:ready`) en start de kit. Bouwt Playable de pagina opnieuw op en is
 * de inhoud weg, dan zet hij hem terug en start de kit opnieuw, zodat
 * filters, uitklappers en tellers blijven werken.
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
  var HTML = ${JSON.stringify(page.html)};

  function paginaJs() {
${page.pageJs}
  }

  function kit() {
${page.kitJs}
  }

  var paginaGestart = false;

  function zetStijl() {
    if (document.getElementById(STIJL_ID)) return;
    var stijl = document.createElement("style");
    stijl.id = STIJL_ID;
    stijl.textContent = CSS;
    (document.head || document.documentElement).appendChild(stijl);
  }

  function plaats() {
    var mount = document.getElementById(MOUNT_ID);
    if (!mount) return;
    zetStijl();
    if (mount.querySelector("[data-psvk-bundel]")) return;
    mount.innerHTML = '<div data-psvk-bundel="${meta.campaignId}">' + HTML + "</div>";
    mount.setAttribute("data-psvk-geladen", "");
    if (!paginaGestart) {
      paginaGestart = true;
      try { paginaJs(); } catch (e) { console.error("[psvk] pagina-JavaScript", e); }
    }
    try { kit(); } catch (e) { console.error("[psvk] kit", e); }
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
  return `playable/pages/${campaignId}/page.js`;
}

export function parseCampaignId(raw: unknown): number | null {
  const text = String(raw ?? "").trim().replace(/^#/, "");
  if (!/^\d{1,12}$/.test(text)) return null;
  const id = Number(text);
  return id > 0 ? id : null;
}
