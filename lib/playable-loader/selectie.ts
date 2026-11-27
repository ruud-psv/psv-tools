/**
 * Aanwijzen in het voorbeeld: een collega zet het voorbeeld op "Aanwijzen",
 * zweeft over de pagina en klikt een onderdeel aan. Dat onderdeel gaat als
 * context mee met de volgende vraag aan Claude, zodat "deze knop" of "dit
 * blok" niet meer uitgelegd hoeft te worden.
 *
 * Het voorbeeld draait in een afgeschermd iframe (geen `allow-same-origin`),
 * dus PSV Tools kan er niet in kijken. `AANWIJZER_JS` gaat als klein script
 * mee in het voorbeeld en praat met PSV Tools via `postMessage`. Hetzelfde
 * script doet ook de bewerkstand (zie `bewerken.ts`).
 */

import { BRON_ATTR, MAX_BEWERK_TEKST } from "./bewerken";

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
  /** In welk html-blok het staat (vanaf 0), bij een pagina in meer blokken. */
  deel: number;
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
  const deel = (raw as Record<string, unknown>).deel;
  return { ...selectie, niveaus: niveaus as string[], niveau, wijzer: wijzer as number[], deel: isIndex(deel) ? deel : 0 };
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
 * Het script in het voorbeeld, voor Aanwijzen en Bewerken.
 *
 * Aanwijzen: tekent een kader om het element onder de muis en om het gekozen
 * element, en meldt de keuze aan PSV Tools (voor de vraag aan Claude).
 *
 * Bewerken: een klik kiest een onderdeel met een nummer uit de bron (zie
 * `lib/playable-loader/bewerken.ts`); PSV Tools zet er een werkbalk bij. Een
 * tekst wordt ter plekke bewerkbaar (`contenteditable`); na Enter of buiten
 * de tekst klikken gaat de nieuwe inhoud als lijst knopen naar PSV Tools, dat
 * hem in de bron zet. De plek van het onderdeel gaat mee bij scrollen, zodat
 * de werkbalk erbij blijft.
 *
 * Berichten van PSV Tools komen binnen met `bron: "psvk-aanwijzer-ouder"`; het
 * nummer van een element heet in berichten daarom `nummer`.
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
  var BRON = "${BRON_ATTR}";
  // Kleine opmaak in een tekst: zo'n onderdeel is ter plekke te bewerken.
  var INLINE = { a: 1, abbr: 1, b: 1, bdi: 1, br: 1, cite: 1, code: 1, del: 1, em: 1, i: 1, img: 1, ins: 1,
    kbd: 1, mark: 1, q: 1, s: 1, small: 1, span: 1, strong: 1, sub: 1, sup: 1, time: 1, u: 1, wbr: 1, svg: 1 };
  // "uit", "aanwijzen" (een onderdeel kiezen voor Claude) of "bewerken" (zelf aanpassen).
  var stand = "uit";
  var gekozen = null;
  var bodem = null;
  var keuze = null;
  var bewerkt = null;
  var origineel = "";
  var blurTimer = null;
  var zweef = null;
  var muis = null;
  var laatstePlek = "";
  var laag, vakGekozen, vakZweef, label, stijl;

  // De pagina kan uit meer html-blokken bestaan (bijvoorbeeld boven en onder een
  // formulier van Playable). Elk blok heeft een eigen wortel: het #psvk-app erin,
  // of anders het blok zelf.
  function wortels() {
    var blokken = document.querySelectorAll("[data-psvk-bundel]");
    var uit = [];
    for (var i = 0; i < blokken.length; i++) uit.push(blokken[i].querySelector('[id="psvk-app"]') || blokken[i]);
    if (!uit.length) uit.push(document.getElementById("psvk-app") || document.body);
    return uit;
  }

  function wortelVan(el) {
    var lijst = wortels();
    for (var i = 0; i < lijst.length; i++) if (lijst[i].contains(el)) return lijst[i];
    return null;
  }

  /** Het hoeveelste blok (vanaf 0) waar het element in staat. */
  function deelVan(el) {
    return Math.max(0, wortels().indexOf(wortelVan(el)));
  }

  function post(data) {
    data.bron = MERK;
    try { parent.postMessage(data, "*"); } catch (e) { /* het voorbeeld staat los */ }
  }

  function bouw() {
    stijl = document.createElement("style");
    stijl.textContent = "*{cursor:crosshair !important;user-select:none !important;-webkit-user-select:none !important}" +
      "[data-psvk-bewerkt],[data-psvk-bewerkt] *{cursor:text !important;user-select:text !important;-webkit-user-select:text !important}" +
      "[data-psvk-bewerkt]{outline:none !important}";
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
    var top = wortelVan(el);
    if (!top || el === top) return null;
    return el;
  }

  function bronVan(el) {
    var b = el && el.getAttribute ? el.getAttribute(BRON) : null;
    return b === null || b === "" ? null : Number(b);
  }

  /** Het dichtstbijzijnde element uit de bron; wat de JavaScript zelf maakt, telt niet. */
  function metBron(el) {
    var top = wortelVan(el);
    for (var n = geldig(el); n && n !== top && n.nodeType === 1; n = n.parentElement) {
      if (bronVan(n) !== null) return n;
    }
    return null;
  }

  function doelVan(el) {
    return stand === "bewerken" ? metBron(el) : geldig(el);
  }

  /** Het element en zijn voorouders tot aan de wortel, van buiten naar binnen. */
  function keten(el) {
    var top = el ? wortelVan(el) : null;
    var lijst = [];
    if (!top) return lijst;
    for (var n = el; n && n !== top && n.nodeType === 1; n = n.parentElement) lijst.unshift(n);
    return lijst;
  }

  function wijzerVan(lijst) {
    return lijst.map(function (n) {
      return Array.prototype.indexOf.call(n.parentElement.children, n);
    });
  }

  function volg(wijzer, deel) {
    var top = wortels()[deel || 0];
    var n = top;
    for (var i = 0; i < wijzer.length; i++) {
      if (!n || !n.children[wijzer[i]]) return null;
      n = n.children[wijzer[i]];
    }
    return n === top ? null : n;
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

  function plek(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, b: r.width, h: r.height };
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
    var vast = stand === "bewerken" ? keuze : gekozen;
    var zw = stand !== "uit" && !bewerkt ? zweef : null;
    zetVak(vakGekozen, vast);
    zetVak(vakZweef, zw && zw !== vast ? zw : null);
    // In de bewerkstand staat de werkbalk van PSV Tools bij het gekozen onderdeel.
    var el = zw || (stand === "bewerken" ? null : vast);
    if (!el || !el.isConnected) {
      label.style.display = "none";
    } else {
      var r = el.getBoundingClientRect();
      label.textContent = naam(el);
      label.style.display = "block";
      label.style.left = Math.max(0, r.left) + "px";
      label.style.top = (r.top >= 20 ? r.top - 18 : Math.min(r.bottom, window.innerHeight - 18)) + "px";
    }
    if (stand === "bewerken") meldPlek();
  }

  /* ---------- Aanwijzen ---------- */

  /** Meldt de keuze. "klik": de collega koos zelf, dus de chat mag de focus pakken. */
  function meld(klik) {
    if (!gekozen || !gekozen.isConnected) { post({ type: "selectie", leeg: true }); return; }
    var pad = keten(gekozen);
    var heleKeten = keten(bodem && bodem.isConnected ? bodem : gekozen);
    var niveau = heleKeten.indexOf(gekozen);
    if (niveau === -1) { heleKeten = pad; niveau = pad.length - 1; }
    var deel = deelVan(gekozen);
    post({
      type: "selectie",
      pad: (wortels().length > 1 ? "html-blok " + (deel + 1) + " > " : "") + pad.map(naam).join(" > ") + positie(gekozen),
      tekst: (gekozen.textContent || "").replace(/\\s+/g, " ").trim().slice(0, ${MAX_TEKST}),
      // Zonder de nummers van de bewerkstand: die zegt Claude niets.
      html: (gekozen.outerHTML || "").replace(/ ${BRON_ATTR}="\\d+"/g, "").slice(0, ${MAX_SELECTIE_HTML}),
      niveaus: heleKeten.map(naam),
      niveau: niveau,
      wijzer: wijzerVan(heleKeten),
      deel: deel,
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

  /* ---------- Bewerken ---------- */

  function tekstVan(el) {
    return (el.textContent || "").replace(/\\s+/g, " ").trim();
  }

  function alleenInline(el) {
    var alles = el.getElementsByTagName("*");
    for (var i = 0; i < alles.length; i++) {
      if (alles[i].ownerSVGElement) continue;
      if (!INLINE[alles[i].tagName.toLowerCase()]) return false;
    }
    return true;
  }

  function fotoIn(el) {
    if (el.tagName === "IMG") return el;
    var lijst = el.querySelectorAll("img[" + BRON + "]");
    return lijst.length === 1 ? lijst[0] : null;
  }

  function linkVan(el) {
    var a = el.closest ? el.closest("a[href]") : null;
    return geldig(a);
  }

  function meldPlek() {
    if (!keuze || !keuze.isConnected) return;
    var p = plek(keuze);
    var sleutel = [p.x, p.y, p.b, p.h].map(Math.round).join(",");
    if (sleutel === laatstePlek) return;
    laatstePlek = sleutel;
    post({ type: "plek", plek: p });
  }

  /** Meldt wat er gekozen is, met wat PSV Tools nodig heeft voor de werkbalk. */
  function meldKeuze(dubbel) {
    laatstePlek = "";
    if (!keuze || !keuze.isConnected) {
      keuze = null;
      post({ type: "bewerk-keuze", leeg: true });
      return;
    }
    var tekst = tekstVan(keuze);
    var foto = fotoIn(keuze);
    var link = linkVan(keuze);
    var achtergrond = "";
    try { achtergrond = getComputedStyle(keuze).backgroundImage || ""; } catch (e) { /* geen stijl */ }
    var p = plek(keuze);
    laatstePlek = [p.x, p.y, p.b, p.h].map(Math.round).join(",");
    post({
      type: "bewerk-keuze",
      nummer: bronVan(keuze),
      naam: naam(keuze),
      tekst: tekst.slice(0, ${MAX_BEWERK_TEKST}),
      tekstTeLang: tekst.length > ${MAX_BEWERK_TEKST},
      inline: alleenInline(keuze),
      foto: foto ? { bron: bronVan(foto), url: foto.currentSrc || foto.src || "" } : null,
      achtergrond: /url\\(/i.test(achtergrond) ? achtergrond : null,
      link: link ? { bron: bronVan(link), href: link.getAttribute("href") || "" } : null,
      ouder: !!metBron(keuze.parentElement),
      plek: p,
      dubbel: !!dubbel
    });
  }

  function kiesBewerk(el, dubbel) {
    if (bewerkt) stopBewerken(true);
    keuze = el || null;
    teken();
    meldKeuze(dubbel);
  }

  /** De inhoud na het typen: tekst, regeleinden en elementen met hun nummer uit de bron. */
  function knopen(el) {
    var uit = [];
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) uit.push({ t: n.nodeValue });
      else if (n.nodeType === 1) {
        if (n.tagName.toLowerCase() === "br" && bronVan(n) === null) uit.push({ br: 1 });
        else uit.push({ el: bronVan(n), k: knopen(n) });
      }
    }
    return uit;
  }

  function startBewerken() {
    if (stand !== "bewerken" || !keuze || !keuze.isConnected || bewerkt) return;
    bewerkt = keuze;
    origineel = keuze.innerHTML;
    zweef = null;
    // Beelden en lege elementen (zoals een icoon) op slot, zodat de tekst er niet in belandt.
    var alles = keuze.querySelectorAll("*");
    for (var i = 0; i < alles.length; i++) {
      var n = alles[i];
      var tag = n.tagName.toLowerCase();
      if (n.ownerSVGElement || tag === "br") continue;
      if (tag === "img" || tag === "svg" || !(n.textContent || "").trim()) {
        n.setAttribute("contenteditable", "false");
        n.setAttribute("data-psvk-vast", "");
      }
    }
    keuze.setAttribute("data-psvk-bewerkt", "");
    keuze.setAttribute("contenteditable", "true");
    keuze.focus();
    try {
      var r = document.createRange();
      r.selectNodeContents(keuze);
      var s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    } catch (e) { /* zonder selectie kan het ook */ }
    post({ type: "tekst-bezig" });
    teken();
  }

  function stopBewerken(bewaar) {
    if (!bewerkt) return;
    clearTimeout(blurTimer);
    var el = bewerkt;
    bewerkt = null;
    el.removeAttribute("contenteditable");
    el.removeAttribute("data-psvk-bewerkt");
    var vast = el.querySelectorAll("[data-psvk-vast]");
    for (var i = 0; i < vast.length; i++) {
      vast[i].removeAttribute("contenteditable");
      vast[i].removeAttribute("data-psvk-vast");
    }
    try { window.getSelection().removeAllRanges(); } catch (e) { /* niets geselecteerd */ }
    if (el.blur) el.blur();
    if (bewaar) {
      post({ type: "tekst-klaar", nummer: bronVan(el), knopen: knopen(el) });
    } else {
      if (el.innerHTML !== origineel) el.innerHTML = origineel;
      post({ type: "tekst-klaar", geannuleerd: true });
    }
    teken();
    if (keuze === el) meldKeuze(false);
  }

  /* ---------- Muis en toetsenbord ---------- */

  // De laatste plek van de muis, zodat aanzetten meteen een kader geeft.
  document.addEventListener("mousemove", function (e) {
    muis = { x: e.clientX, y: e.clientY };
  }, true);

  document.addEventListener("mouseover", function (e) {
    if (stand === "uit" || bewerkt) return;
    zweef = doelVan(e.target);
    teken();
  }, true);

  document.addEventListener("mouseout", function () {
    if (stand === "uit" || bewerkt) return;
    zweef = null;
    teken();
  }, true);

  // In de aanwijs- en bewerkstand gaat een klik nergens heen: geen links, geen filters.
  // Alleen in een tekst die getypt wordt, zet de muis de cursor.
  document.addEventListener("pointerdown", function (e) {
    if (stand === "uit" || (bewerkt && bewerkt.contains(e.target))) return;
    e.stopPropagation();
  }, true);

  document.addEventListener("mousedown", function (e) {
    if (stand === "uit") return;
    e.stopPropagation();
    if (bewerkt && bewerkt.contains(e.target)) return;
    e.preventDefault();
  }, true);

  document.addEventListener("click", function (e) {
    if (stand === "uit") return;
    e.preventDefault();
    e.stopPropagation();
    if (bewerkt && bewerkt.contains(e.target)) return;
    if (stand === "aanwijzen") kies(geldig(e.target), true);
    else kiesBewerk(doelVan(e.target), false);
  }, true);

  document.addEventListener("dblclick", function (e) {
    if (stand !== "bewerken") return;
    e.preventDefault();
    e.stopPropagation();
    if (bewerkt && bewerkt.contains(e.target)) return;
    kiesBewerk(doelVan(e.target), true);
  }, true);

  // Heeft het voorbeeld de focus, dan komt Esc hier binnen en niet in PSV Tools.
  window.addEventListener("keydown", function (e) {
    if (bewerkt) {
      if (e.key === "Escape") { e.preventDefault(); stopBewerken(false); }
      else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); stopBewerken(true); }
      else if (e.key === " " && bewerkt.closest("button, summary")) {
        // Een spatie in een knop zou hem indrukken.
        e.preventDefault();
        document.execCommand("insertText", false, " ");
      }
      // De sneltoetsen van de pagina zelf reageren niet tijdens het typen.
      e.stopPropagation();
      return;
    }
    if (e.key === "Escape") post({ type: "escape" });
  }, true);

  // Plakken en slepen alleen als gewone tekst.
  document.addEventListener("paste", function (e) {
    if (!bewerkt) return;
    e.preventDefault();
    var t = e.clipboardData ? e.clipboardData.getData("text/plain") : "";
    document.execCommand("insertText", false, t.replace(/\\s*\\n\\s*/g, " "));
  }, true);
  document.addEventListener("dragstart", function (e) { if (stand !== "uit") e.preventDefault(); }, true);
  document.addEventListener("drop", function (e) { if (stand !== "uit") e.preventDefault(); }, true);
  document.addEventListener("input", function () { if (bewerkt) teken(); }, true);

  // Buiten de tekst klikken bewaart hem; even wachten, want de werkbalk kan nog Annuleren melden.
  document.addEventListener("focusout", function (e) {
    if (!bewerkt || e.target !== bewerkt) return;
    clearTimeout(blurTimer);
    blurTimer = setTimeout(function () {
      if (bewerkt && (!document.hasFocus() || document.activeElement !== bewerkt)) stopBewerken(true);
    }, 250);
  }, true);
  document.addEventListener("focusin", function (e) {
    if (bewerkt && e.target === bewerkt) clearTimeout(blurTimer);
  }, true);

  var scrollGepland = false;
  window.addEventListener("scroll", function () {
    teken();
    if (scrollGepland) return;
    scrollGepland = true;
    setTimeout(function () {
      scrollGepland = false;
      post({ type: "scroll", y: window.scrollY || 0 });
    }, 150);
  }, true);
  window.addEventListener("resize", teken);
  // De Kit en ladende beelden schuiven de pagina soms op: de kaders lopen mee.
  setInterval(function () { if (stand !== "uit" || gekozen) teken(); }, 400);

  function scrollNaar(y) {
    if (typeof y !== "number" || !(y > 0)) return;
    window.scrollTo(0, y);
    // Beelden zonder vaste maat maken de pagina tijdens het laden nog langer.
    if (document.readyState !== "complete") window.addEventListener("load", function () { window.scrollTo(0, y); });
  }

  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.bron !== MERK + "-ouder") return;
    if (d.actie === "stand") {
      if (bewerkt && d.stand !== "bewerken") stopBewerken(true);
      stand = d.stand === "aanwijzen" || d.stand === "bewerken" ? d.stand : "uit";
      if (stand !== "bewerken") keuze = null;
      zweef = stand !== "uit" && muis ? doelVan(document.elementFromPoint(muis.x, muis.y)) : null;
      stijl.media = stand !== "uit" ? "all" : "not all";
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
      var terug = keten(volg(d.wijzer || [], d.deel));
      var tags = (d.niveaus || []).map(function (n) { return String(n).split(/[.#]/)[0]; });
      var klopt = terug.length > 0 && terug.length === tags.length && terug.every(function (n, i) {
        return n.tagName.toLowerCase() === tags[i];
      });
      bodem = klopt ? terug[terug.length - 1] : null;
      gekozen = klopt ? terug[d.niveau] || null : null;
      teken();
      meld();
    } else if (d.actie === "kies-nummer") {
      var el = typeof d.nummer === "number" ? document.querySelector("[data-psvk-bundel] [" + BRON + '="' + d.nummer + '"]') : null;
      kiesBewerk(geldig(el), false);
    } else if (d.actie === "kies-ouder") {
      if (keuze) kiesBewerk(metBron(keuze.parentElement), false);
    } else if (d.actie === "bewerk-wis") {
      if (bewerkt) stopBewerken(false);
      keuze = null;
      teken();
    } else if (d.actie === "tekst-start") {
      startBewerken();
    } else if (d.actie === "tekst-wacht") {
      clearTimeout(blurTimer);
    } else if (d.actie === "tekst-stop") {
      stopBewerken(d.bewaar === true);
    } else if (d.actie === "scroll") {
      scrollNaar(d.y);
    }
  });

  bouw();
  post({ type: "gereed" });
})();`;
