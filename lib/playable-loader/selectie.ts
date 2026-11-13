/**
 * Aanwijzen in het voorbeeld: een collega zet het voorbeeld op "Aanwijzen",
 * zweeft over de pagina en klikt een onderdeel aan. Dat onderdeel gaat als
 * context mee met de volgende vraag aan Claude, zodat "deze knop" of "dit
 * blok" niet meer uitgelegd hoeft te worden.
 *
 * Het voorbeeld draait in een afgeschermd iframe (geen `allow-same-origin`),
 * dus PSV Tools kan er niet in kijken. `AANWIJZER_JS` gaat als klein script
 * mee in het voorbeeld en praat met PSV Tools via `postMessage`.
 */

/** Wat er met de vraag meegaat naar Claude. */
export interface Selectie {
  /** Waar het element staat, van buiten naar binnen. */
  pad: string;
  /** De tekst in het element, ingekort. */
  tekst: string;
  /** De weergegeven HTML van het element, ingekort. */
  html: string;
}

/** Wat het voorbeeld terugmeldt; de laatste twee zijn alleen voor de knoppen. */
export interface Aanwijzing extends Selectie {
  /** Per niveau een label, van buiten naar binnen, tot het aangeklikte element. */
  niveaus: string[];
  /** Welk niveau nu gekozen is (de laatste is het aangeklikte element zelf). */
  niveau: number;
  /** Index van het kind per niveau, om het element na een herlading terug te vinden. */
  wijzer: number[];
}

export const MAX_PAD = 600;
export const MAX_TEKST = 500;
export const MAX_SELECTIE_HTML = 4_000;

function kort(waarde: unknown, max: number): string {
  return typeof waarde === "string" ? waarde.slice(0, max) : "";
}

/** Leest de selectie uit een verzoek; geeft null als er niets bruikbaars in staat. */
export function leesSelectie(raw: unknown): Selectie | null {
  if (!raw || typeof raw !== "object") return null;
  const bron = raw as Record<string, unknown>;
  const pad = kort(bron.pad, MAX_PAD).trim();
  if (!pad) return null;
  return { pad, tekst: kort(bron.tekst, MAX_TEKST).trim(), html: kort(bron.html, MAX_SELECTIE_HTML).trim() };
}

function isIndex(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

/** Leest een melding van het voorbeeld; geeft null bij iets onbruikbaars. */
export function leesAanwijzing(raw: unknown): Aanwijzing | null {
  const selectie = leesSelectie(raw);
  if (!selectie) return null;
  const { niveaus, niveau, wijzer } = raw as Record<string, unknown>;
  if (!Array.isArray(niveaus) || !niveaus.every((n) => typeof n === "string")) return null;
  if (!Array.isArray(wijzer) || !wijzer.every(isIndex) || wijzer.length !== niveaus.length) return null;
  if (!isIndex(niveau) || niveau >= niveaus.length) return null;
  return { ...selectie, niveaus: niveaus as string[], niveau, wijzer: wijzer as number[] };
}

/** Het blok dat bij de vraag aan Claude komt. */
export function selectieTekst(selectie: Selectie): string {
  const regels = [
    "De collega heeft dit onderdeel aangewezen in het voorbeeld. Woorden als \"deze knop\", \"dit blok\" of \"hier\" slaan hierop.",
    `Pad in de pagina: ${selectie.pad}`,
  ];
  if (selectie.tekst) regels.push(`Tekst erin: ${selectie.tekst}`);
  if (selectie.html) regels.push(`Weergegeven HTML:\n${selectie.html}`);
  regels.push(
    "Dit is de HTML zoals de browser hem toont. In <pagina_html> kan hij iets afwijken, want de Kit zet bij het " +
      "opstarten klassen en attributen bij. Zoek het bijbehorende stuk op in <pagina_html> en pas daar aan."
  );
  return `<aangewezen_element>\n${regels.join("\n")}\n</aangewezen_element>`;
}

/** Een korte regel bij een oudere vraag, zodat Claude die later nog kan plaatsen. */
export function selectieNotitie(selectie: Selectie): string {
  return `(aangewezen in het voorbeeld: ${selectie.pad})`;
}

/**
 * Het script in het voorbeeld. Tekent een kader om het element onder de muis
 * en om het gekozen element, en meldt de keuze aan PSV Tools. Berichten van
 * PSV Tools komen binnen met `bron: "psvk-aanwijzer-ouder"`.
 *
 * Alles staat in een IIFE met `var`, want het draait zoals het is in het
 * iframe, zonder bundelstap. Er mag nergens `</script` in staan.
 */
export const AANWIJZER_JS = `(function () {
  var MERK = "psvk-aanwijzer";
  // Vaste waarden: het afgeschermde voorbeeld kan niet bij de tokens van PSV Tools.
  // Rood met een witte binnenrand, zodat het kader ook op een rode sectie te zien is.
  var ROOD = "#e82026";
  var DONKER = "#09101d";
  var aan = false;
  var gekozen = null;
  var bodem = null;
  var zweef = null;
  var muis = null;
  var laag, vakGekozen, vakZweef, label, stijl;

  function wortel() {
    return document.getElementById("psvk-app") || document.querySelector("[data-psvk-bundel]") || document.body;
  }

  function post(data) {
    data.bron = MERK;
    try { parent.postMessage(data, "*"); } catch (e) { /* het voorbeeld staat los */ }
  }

  function bouw() {
    stijl = document.createElement("style");
    stijl.textContent = "*{cursor:crosshair !important;user-select:none !important}";
    stijl.media = "not all";
    (document.head || document.documentElement).appendChild(stijl);

    laag = document.createElement("div");
    laag.setAttribute("data-psvk-aanwijzer", "");
    laag.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:2147483647";
    vakGekozen = vak("3px solid " + ROOD, "transparent");
    vakZweef = vak("2px dashed " + ROOD, "rgba(232,32,38,0.08)");
    label = document.createElement("div");
    label.style.cssText = "position:absolute;max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" +
      "background:" + DONKER + ";border-left:3px solid " + ROOD + ";color:#fff;" +
      "font:700 11px/18px Arial,Helvetica,sans-serif;padding:0 6px;display:none";
    laag.appendChild(vakGekozen);
    laag.appendChild(vakZweef);
    laag.appendChild(label);
    (document.body || document.documentElement).appendChild(laag);
  }

  function vak(rand, vulling) {
    var el = document.createElement("div");
    el.style.cssText = "position:absolute;outline:" + rand + ";outline-offset:1px;" +
      "box-shadow:0 0 0 1px #fff, inset 0 0 0 1px #fff;background:" + vulling + ";display:none";
    return el;
  }

  function naam(el) {
    var t = el.tagName.toLowerCase();
    if (el.id) return t + "#" + el.id;
    var klassen = (el.getAttribute("class") || "").split(/\\s+/).filter(Boolean).slice(0, 3);
    return klassen.length ? t + "." + klassen.join(".") : t;
  }

  function geldig(el) {
    if (!el || el.nodeType !== 1) return null;
    if (laag && laag.contains(el)) return null;
    var top = wortel();
    if (!top || el === top || !top.contains(el)) return null;
    return el;
  }

  /** Het element en zijn voorouders tot aan de wortel, van buiten naar binnen. */
  function keten(el) {
    var top = wortel();
    var lijst = [];
    if (!el || !top || !top.contains(el)) return lijst;
    for (var n = el; n && n !== top && n.nodeType === 1; n = n.parentElement) lijst.unshift(n);
    return lijst;
  }

  function wijzerVan(lijst) {
    return lijst.map(function (n) {
      return Array.prototype.indexOf.call(n.parentElement.children, n);
    });
  }

  function volg(wijzer) {
    var n = wortel();
    for (var i = 0; i < wijzer.length; i++) {
      if (!n || !n.children[wijzer[i]]) return null;
      n = n.children[wijzer[i]];
    }
    return n === wortel() ? null : n;
  }

  /** "(nummer 2 van 4)" als er meer van hetzelfde naast staan. */
  function positie(el) {
    var ouder = el.parentElement;
    if (!ouder) return "";
    var zelfde = [];
    for (var i = 0; i < ouder.children.length; i++) {
      if (naam(ouder.children[i]) === naam(el)) zelfde.push(ouder.children[i]);
    }
    return zelfde.length > 1 ? " (nummer " + (zelfde.indexOf(el) + 1) + " van " + zelfde.length + ")" : "";
  }

  function zetVak(doel, el) {
    if (!el || !el.isConnected) { doel.style.display = "none"; return; }
    var r = el.getBoundingClientRect();
    doel.style.display = "block";
    doel.style.left = r.left + "px";
    doel.style.top = r.top + "px";
    doel.style.width = r.width + "px";
    doel.style.height = r.height + "px";
  }

  function teken() {
    if (!laag) return;
    zetVak(vakGekozen, gekozen);
    zetVak(vakZweef, aan ? zweef : null);
    var el = (aan && zweef) || gekozen;
    if (!el || !el.isConnected) { label.style.display = "none"; return; }
    var r = el.getBoundingClientRect();
    label.textContent = naam(el);
    label.style.display = "block";
    label.style.left = Math.max(0, r.left) + "px";
    label.style.top = (r.top >= 20 ? r.top - 18 : Math.min(r.bottom, window.innerHeight - 18)) + "px";
  }

  /** Meldt de keuze. "klik": de collega koos zelf, dus de chat mag de focus pakken. */
  function meld(klik) {
    if (!gekozen || !gekozen.isConnected) { post({ type: "selectie", leeg: true }); return; }
    var pad = keten(gekozen);
    var heleKeten = keten(bodem && bodem.isConnected ? bodem : gekozen);
    var niveau = heleKeten.indexOf(gekozen);
    if (niveau === -1) { heleKeten = pad; niveau = pad.length - 1; }
    post({
      type: "selectie",
      pad: pad.map(naam).join(" > ") + positie(gekozen),
      tekst: (gekozen.textContent || "").replace(/\\s+/g, " ").trim().slice(0, ${MAX_TEKST}),
      html: (gekozen.outerHTML || "").slice(0, ${MAX_SELECTIE_HTML}),
      niveaus: heleKeten.map(naam),
      niveau: niveau,
      wijzer: wijzerVan(heleKeten),
      klik: !!klik
    });
  }

  function kies(el, aangeklikt) {
    if (!el) return;
    gekozen = el;
    if (aangeklikt) bodem = el;
    teken();
    meld(aangeklikt);
  }

  // De laatste plek van de muis, zodat aanzetten meteen een kader geeft.
  document.addEventListener("mousemove", function (e) {
    muis = { x: e.clientX, y: e.clientY };
  }, true);

  document.addEventListener("mouseover", function (e) {
    if (!aan) return;
    zweef = geldig(e.target);
    teken();
  }, true);

  document.addEventListener("mouseout", function () {
    if (!aan) return;
    zweef = null;
    teken();
  }, true);

  // In de aanwijsstand gaat een klik nergens heen: geen links, geen filters.
  document.addEventListener("mousedown", function (e) {
    if (!aan) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  document.addEventListener("click", function (e) {
    if (!aan) return;
    e.preventDefault();
    e.stopPropagation();
    kies(geldig(e.target), true);
  }, true);

  // Heeft het voorbeeld de focus, dan komt Esc hier binnen en niet in PSV Tools.
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape") post({ type: "escape" });
  }, true);

  window.addEventListener("scroll", teken, true);
  window.addEventListener("resize", teken);

  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.bron !== MERK + "-ouder") return;
    if (d.actie === "aan" || d.actie === "uit") {
      aan = d.actie === "aan";
      zweef = aan && muis ? geldig(document.elementFromPoint(muis.x, muis.y)) : null;
      stijl.media = aan ? "all" : "not all";
      teken();
    } else if (d.actie === "wis") {
      gekozen = null;
      bodem = null;
      zweef = null;
      teken();
    } else if (d.actie === "niveau") {
      var lijst = keten(bodem && bodem.isConnected ? bodem : gekozen);
      kies(lijst[d.niveau], false);
    } else if (d.actie === "herstel") {
      // Na een wijziging staat er een nieuwe pagina. Zelfde plek en dezelfde
      // soorten elementen onderweg: dan is het hetzelfde onderdeel. Anders
      // niets kiezen, liever dan het verkeerde.
      var terug = keten(volg(d.wijzer || []));
      var tags = (d.niveaus || []).map(function (n) { return String(n).split(/[.#]/)[0]; });
      var klopt = terug.length > 0 && terug.length === tags.length && terug.every(function (n, i) {
        return n.tagName.toLowerCase() === tags[i];
      });
      bodem = klopt ? terug[terug.length - 1] : null;
      gekozen = klopt ? terug[d.niveau] || null : null;
      teken();
      meld();
    }
  });

  bouw();
  post({ type: "gereed" });
})();`;
