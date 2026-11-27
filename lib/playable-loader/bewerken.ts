/**
 * Zelf bewerken in het voorbeeld: een andere foto, een tekst of een link
 * aanpassen, een onderdeel verplaatsen, dupliceren of weghalen, zonder Claude.
 *
 * Het voorbeeld toont de pagina zoals de browser hem opbouwt, met wat de Kit
 * er bij het opstarten aan toevoegt. Een wijziging moet in de bron terecht
 * komen (de HTML zoals de collega hem invulde), en wel precies op die plek.
 * Daarom krijgt in het voorbeeld elke starttag uit de bron een nummer
 * (`data-psvk-bron`, zie `markeer`): het hoeveelste element in de bron het is.
 * De browser maakt de elementen in dezelfde volgorde als de starttags, dus een
 * aangeklikt element wijst altijd naar zijn eigen starttag, ook als de Kit
 * het verplaatst of klassen toevoegt. Elementen die de JavaScript zelf maakt,
 * hebben geen nummer en zijn hier niet te bewerken.
 *
 * Alle bewerkingen hier zijn gewone tekstbewerkingen op de bron: de rest van
 * de HTML blijft letter voor letter staan. Alleen in het voorbeeld staan de
 * nummers; in wat er op Bunny komt niet.
 */

export const BRON_ATTR = "data-psvk-bron";

/** Langer dan dit is geen tekst om ter plekke te bewerken, maar een blok. */
export const MAX_BEWERK_TEKST = 5_000;

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);
/** Elementen waarvan de inhoud tekst is, geen HTML. */
const RAUW = new Set(["script", "style", "textarea", "title"]);

export class BewerkFout extends Error {}

export interface Attribuut {
  /** In kleine letters. */
  naam: string;
  start: number;
  eind: number;
  /** Zoals hij in de bron staat (met entiteiten); null zonder `=`. */
  waarde: string | null;
}

export interface BronTag {
  /** Het hoeveelste element in de bron, vanaf 0: het nummer in `data-psvk-bron`. */
  index: number;
  /** In kleine letters. */
  naam: string;
  /** Positie van de `<`. */
  start: number;
  /** Positie na de `>` van de starttag. */
  openEind: number;
  /** Positie van de `>` (of `/>`): hier kan een attribuut bij. */
  invoeg: number;
  attributen: Attribuut[];
  /** Zonder inhoud en sluittag (`<img>`, of `<path/>` in een svg). */
  leeg: boolean;
  /** Begin van de eigen sluittag; null als die ontbreekt. */
  sluitStart: number | null;
  /** Einde van het hele element; null als het niet netjes is afgesloten. */
  eind: number | null;
  /** Het element eromheen in de bron. */
  ouder: number | null;
}

/* ---------- Lezen ---------- */

const NAAM = /<([a-zA-Z][^\s/>]*)/y;
const SLUIT = /<\/([a-zA-Z][^\s/>]*)[^>]*>/y;

function isWit(c: string | undefined): boolean {
  return c === " " || c === "\n" || c === "\t" || c === "\r" || c === "\f";
}

/** Leest de starttag die op `lt` begint, met zijn attributen. */
function leesStartTag(html: string, lt: number) {
  NAAM.lastIndex = lt;
  const m = NAAM.exec(html);
  if (!m) return null;
  const naam = m[1].toLowerCase();
  const attributen: Attribuut[] = [];
  const n = html.length;
  let p = lt + m[0].length;
  while (p < n) {
    while (p < n && isWit(html[p])) p++;
    if (p >= n) return null;
    if (html[p] === ">") return { naam, attributen, openEind: p + 1, invoeg: p, slash: false };
    if (html[p] === "/" && html[p + 1] === ">") return { naam, attributen, openEind: p + 2, invoeg: p, slash: true };
    if (html[p] === "/") {
      p++;
      continue;
    }
    const aStart = p;
    p++;
    while (p < n && !isWit(html[p]) && html[p] !== "/" && html[p] !== ">" && html[p] !== "=") p++;
    const aNaam = html.slice(aStart, p).toLowerCase();
    let q = p;
    while (q < n && isWit(html[q])) q++;
    if (html[q] !== "=") {
      attributen.push({ naam: aNaam, start: aStart, eind: p, waarde: null });
      continue;
    }
    q++;
    while (q < n && isWit(html[q])) q++;
    let waarde: string;
    if (html[q] === '"' || html[q] === "'") {
      const sluit = html.indexOf(html[q], q + 1);
      if (sluit === -1) return null;
      waarde = html.slice(q + 1, sluit);
      p = sluit + 1;
    } else {
      let e = q;
      while (e < n && !isWit(html[e]) && html[e] !== ">") e++;
      waarde = html.slice(q, e);
      p = e;
    }
    attributen.push({ naam: aNaam, start: aStart, eind: p, waarde });
  }
  return null;
}

/**
 * Alle elementen in de bron, in de volgorde van hun starttags: dezelfde
 * volgorde waarin de browser ze maakt. Commentaar en de inhoud van `script`
 * en `style` tellen niet mee.
 */
export function scanTags(html: string): BronTag[] {
  const tags: BronTag[] = [];
  const stapel: number[] = [];
  const n = html.length;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1) break;
    if (html.startsWith("<!--", lt)) {
      const e = html.indexOf("-->", lt + 4);
      i = e === -1 ? n : e + 3;
      continue;
    }
    const volgende = html[lt + 1];
    if (volgende === "!" || volgende === "?") {
      const e = html.indexOf(">", lt);
      i = e === -1 ? n : e + 1;
      continue;
    }
    if (volgende === "/") {
      SLUIT.lastIndex = lt;
      const m = SLUIT.exec(html);
      if (!m) {
        i = lt + 1;
        continue;
      }
      const naam = m[1].toLowerCase();
      let k = stapel.length - 1;
      while (k >= 0 && tags[stapel[k]].naam !== naam) k--;
      // Wat er nog openstond, sloot de browser zelf: dat einde weten we niet zeker.
      if (k >= 0) {
        const t = tags[stapel[k]];
        t.sluitStart = lt;
        t.eind = lt + m[0].length;
        stapel.length = k;
      }
      i = lt + m[0].length;
      continue;
    }
    const tag = leesStartTag(html, lt);
    if (!tag) {
      i = lt + 1;
      continue;
    }
    const vreemd =
      tag.naam === "svg" || tag.naam === "math" || stapel.some((s) => tags[s].naam === "svg" || tags[s].naam === "math");
    const leeg = VOID.has(tag.naam) || (vreemd && tag.slash);
    const t: BronTag = {
      index: tags.length,
      naam: tag.naam,
      start: lt,
      openEind: tag.openEind,
      invoeg: tag.invoeg,
      attributen: tag.attributen,
      leeg,
      sluitStart: null,
      eind: leeg ? tag.openEind : null,
      ouder: stapel.length ? stapel[stapel.length - 1] : null,
    };
    tags.push(t);
    i = tag.openEind;
    if (leeg) continue;
    if (RAUW.has(tag.naam) && !vreemd) {
      const sluit = new RegExp(`</${tag.naam}\\s*>`, "ig");
      sluit.lastIndex = i;
      const m = sluit.exec(html);
      if (m) {
        t.sluitStart = m.index;
        t.eind = m.index + m[0].length;
        i = t.eind;
      } else {
        i = n;
      }
      continue;
    }
    stapel.push(t.index);
  }
  return tags;
}

/** De HTML voor het voorbeeld: elke starttag krijgt zijn nummer. */
export function markeer(html: string, tags: BronTag[] = scanTags(html)): string {
  let uit = "";
  let vanaf = 0;
  for (const t of tags) {
    uit += `${html.slice(vanaf, t.invoeg)} ${BRON_ATTR}="${t.index}"`;
    vanaf = t.invoeg;
  }
  return uit + html.slice(vanaf);
}

const ENTITEITEN: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", shy: "­",
  euro: "€", hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  laquo: "«", raquo: "»", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™", deg: "°", times: "×",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", aacute: "á", agrave: "à", auml: "ä", iacute: "í", iuml: "ï",
  oacute: "ó", ouml: "ö", uacute: "ú", uuml: "ü", ccedil: "ç", Eacute: "É", Euml: "Ë", Iuml: "Ï", Ouml: "Ö", Uuml: "Ü",
};

/** Zet entiteiten om in tekens. Een onbekende blijft staan zoals hij is. */
export function ontcijfer(tekst: string): string {
  return tekst.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (heel, code: string) => {
    if (code[0] === "#") {
      const getal = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return getal > 0 && getal <= 0x10ffff ? String.fromCodePoint(getal) : heel;
    }
    return ENTITEITEN[code] ?? heel;
  });
}

export function normaal(tekst: string): string {
  return tekst.replace(/\s+/g, " ").trim();
}

/** De tekst tussen `van` en `tot`, zonder tags, commentaar, scripts en stijl. */
function tekstTussen(html: string, van: number, tot: number): string {
  let uit = "";
  let i = van;
  while (i < tot) {
    const lt = html.indexOf("<", i);
    if (lt === -1 || lt >= tot) {
      uit += html.slice(i, tot);
      break;
    }
    uit += html.slice(i, lt);
    if (html.startsWith("<!--", lt)) {
      const e = html.indexOf("-->", lt + 4);
      i = e === -1 ? tot : e + 3;
      continue;
    }
    if (html[lt + 1] === "/" || html[lt + 1] === "!" || html[lt + 1] === "?") {
      const e = html.indexOf(">", lt);
      i = e === -1 ? tot : e + 1;
      continue;
    }
    const tag = leesStartTag(html, lt);
    if (!tag) {
      uit += "<";
      i = lt + 1;
      continue;
    }
    i = tag.openEind;
    if (RAUW.has(tag.naam)) {
      const sluit = new RegExp(`</${tag.naam}\\s*>`, "ig");
      sluit.lastIndex = i;
      const m = sluit.exec(html);
      i = m ? m.index + m[0].length : tot;
    }
  }
  return ontcijfer(uit);
}

/** De tekst in een element zoals hij in de bron staat, met witruimte samengevoegd. */
export function bronTekst(html: string, tag: BronTag): string | null {
  if (tag.leeg || tag.sluitStart === null) return null;
  return normaal(tekstTussen(html, tag.openEind, tag.sluitStart));
}

/** De waarde van een attribuut, zonder entiteiten; null als hij er niet is. */
export function leesAttribuut(tag: BronTag, naam: string): string | null {
  const a = tag.attributen.find((x) => x.naam === naam);
  if (!a) return null;
  return a.waarde === null ? "" : ontcijfer(a.waarde);
}

/* ---------- Wat er kan met een aangeklikt onderdeel ---------- */

/** Wat het voorbeeld meldt als er in de bewerkstand iets is aangeklikt. */
export interface BewerkKeuze {
  /** Het nummer van het element in de bron. */
  bron: number;
  /** Label zoals in het voorbeeld, bijvoorbeeld `h2.psvk-title`. */
  naam: string;
  /** De tekst zoals de browser hem toont, met witruimte samengevoegd. */
  tekst: string;
  tekstTeLang: boolean;
  /** Er staan alleen tekst en kleine opmaak (zoals `strong` of `span`) in. */
  inline: boolean;
  /** De enige foto in het onderdeel (of het onderdeel zelf). */
  foto: { bron: number | null; url: string } | null;
  /** De achtergrond die de browser toont, als die een afbeelding is. */
  achtergrond: string | null;
  /** De link om het onderdeel heen (of het onderdeel zelf). */
  link: { bron: number | null; href: string } | null;
  /** Er is een groter blok om het onderdeel heen. */
  ouder: boolean;
  /** Plek in het voorbeeld, in pixels van het voorbeeld zelf. */
  plek: Plek;
  /** Dubbelklik: meteen de tekst bewerken als dat kan. */
  dubbel: boolean;
}

export interface Plek {
  x: number;
  y: number;
  b: number;
  h: number;
}

function getal(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function bronNummer(n: unknown): number | null {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null;
}

function tekstVeld(n: unknown, max: number): string {
  return typeof n === "string" ? n.slice(0, max) : "";
}

export function leesPlek(raw: unknown): Plek | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const [x, y, b, h] = [getal(r.x), getal(r.y), getal(r.b), getal(r.h)];
  return x === null || y === null || b === null || h === null ? null : { x, y, b, h };
}

/** Leest de melding van het voorbeeld; null bij iets onbruikbaars. */
export function leesBewerkKeuze(raw: unknown): BewerkKeuze | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  // In berichten heet het nummer `nummer`: `bron` is daar de afzender.
  const bron = bronNummer(d.nummer);
  const plek = leesPlek(d.plek);
  if (bron === null || !plek) return null;
  const foto = d.foto && typeof d.foto === "object" ? (d.foto as Record<string, unknown>) : null;
  const link = d.link && typeof d.link === "object" ? (d.link as Record<string, unknown>) : null;
  return {
    bron,
    naam: tekstVeld(d.naam, 200),
    tekst: tekstVeld(d.tekst, MAX_BEWERK_TEKST),
    tekstTeLang: d.tekstTeLang === true,
    inline: d.inline === true,
    foto: foto ? { bron: bronNummer(foto.bron), url: tekstVeld(foto.url, 4_000) } : null,
    achtergrond: typeof d.achtergrond === "string" && d.achtergrond ? d.achtergrond.slice(0, 4_000) : null,
    link: link ? { bron: bronNummer(link.bron), href: tekstVeld(link.href, 4_000) } : null,
    ouder: d.ouder === true,
    plek,
    dubbel: d.dubbel === true,
  };
}

/** Kan het (null), of waarom niet. */
export type Kan = string | null;

export interface Mogelijkheden {
  /** null: er staat geen tekst in. */
  tekst: Kan | undefined;
  /** null: geen foto. */
  foto: { kan: Kan; doel: number | null; soort: "img" | "achtergrond"; url: string } | null;
  link: { kan: Kan; doel: number | null } | null;
  omhoog: Kan;
  omlaag: Kan;
  dupliceren: Kan;
  verwijderen: Kan;
}

const VRAAG_CLAUDE = "vraag de aanpassing aan Claude";
const URL_IN_STIJL = /url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)/i;

/** Wat er met het aangeklikte onderdeel kan, volgens de huidige bron. */
export function mogelijkheden(html: string, keuze: BewerkKeuze, tags: BronTag[] = scanTags(html)): Mogelijkheden {
  const tag = tags[keuze.bron];
  const geenBron = `Dit onderdeel maakt de JavaScript van de pagina; ${VRAAG_CLAUDE}.`;
  if (!tag) {
    return { tekst: keuze.tekst ? geenBron : undefined, foto: null, link: null, omhoog: geenBron, omlaag: geenBron, dupliceren: geenBron, verwijderen: geenBron };
  }
  const nietAfgesloten = tag.eind === null ? `De HTML van dit onderdeel is niet netjes afgesloten; ${VRAAG_CLAUDE}.` : null;

  let tekst: Kan | undefined;
  if (!keuze.tekst) tekst = undefined;
  else if (tag.leeg) tekst = undefined;
  else if (nietAfgesloten) tekst = nietAfgesloten;
  else if (keuze.tekstTeLang || !keuze.inline) tekst = "Hier staan meer onderdelen in. Klik de tekst zelf aan.";
  else if (bronTekst(html, tag) !== keuze.tekst)
    tekst = `Deze tekst verandert de pagina zelf, bijvoorbeeld een teller; ${VRAAG_CLAUDE}.`;
  else tekst = null;

  let foto: Mogelijkheden["foto"] = null;
  if (keuze.foto) {
    const doel = keuze.foto.bron !== null && tags[keuze.foto.bron]?.naam === "img" ? keuze.foto.bron : null;
    foto = { kan: doel === null ? geenBron : null, doel, soort: "img", url: keuze.foto.url };
  } else if (keuze.achtergrond) {
    const stijl = leesAttribuut(tag, "style");
    const url = /url\(\s*["']?([^"')]+)/i.exec(keuze.achtergrond)?.[1] ?? "";
    foto =
      stijl && URL_IN_STIJL.test(stijl)
        ? { kan: null, doel: tag.index, soort: "achtergrond", url }
        : { kan: `Deze achtergrond staat in de CSS; ${VRAAG_CLAUDE}.`, doel: null, soort: "achtergrond", url };
  }

  let link: Mogelijkheden["link"] = null;
  if (keuze.link) {
    const doel = keuze.link.bron !== null && tags[keuze.link.bron]?.naam === "a" ? keuze.link.bron : null;
    link = { kan: doel === null ? geenBron : null, doel };
  }

  const broers = tags.filter((t) => t.ouder === tag.ouder);
  const plek = broers.indexOf(tag);
  const buur = (richting: -1 | 1): Kan => {
    if (nietAfgesloten) return nietAfgesloten;
    const b = broers[plek + richting];
    if (!b) return richting === -1 ? "Dit staat al bovenaan in zijn blok." : "Dit staat al onderaan in zijn blok.";
    if (b.eind === null) return `Het onderdeel ${richting === -1 ? "erboven" : "eronder"} is niet netjes afgesloten.`;
    return null;
  };

  return {
    tekst,
    foto,
    link,
    omhoog: buur(-1),
    omlaag: buur(1),
    dupliceren: nietAfgesloten,
    verwijderen: nietAfgesloten ?? (tag.ouder === null ? "Dit is de hele pagina." : null),
  };
}

/* ---------- Schrijven ---------- */

function vind(tags: BronTag[], id: number): BronTag {
  const t = tags[id];
  if (!t) throw new BewerkFout("Dit onderdeel staat niet meer in de HTML. Ververs het voorbeeld en probeer het opnieuw.");
  return t;
}

function bereik(t: BronTag): { start: number; eind: number } {
  if (t.eind === null) throw new BewerkFout(`De HTML van dit onderdeel is niet netjes afgesloten; ${VRAAG_CLAUDE}.`);
  return { start: t.start, eind: t.eind };
}

function escapeTekst(tekst: string): string {
  return tekst.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;");
}

function escapeAttribuut(waarde: string): string {
  return waarde.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Past attributen van één starttag aan; null haalt een attribuut weg. De
 * andere attributen en de opmaak van de tag blijven zoals ze waren.
 */
function pasTagAan(html: string, t: BronTag, wijzig: Record<string, string | null>): string {
  const stukken: { van: number; tot: number; tekst: string }[] = [];
  let erbij = "";
  for (const [naam, waarde] of Object.entries(wijzig)) {
    const a = t.attributen.find((x) => x.naam === naam);
    if (a && waarde === null) {
      let van = a.start;
      while (van > t.start && isWit(html[van - 1])) van--;
      stukken.push({ van, tot: a.eind, tekst: "" });
    } else if (a && waarde !== null) {
      stukken.push({ van: a.start, tot: a.eind, tekst: `${naam}="${escapeAttribuut(waarde)}"` });
    } else if (waarde !== null) {
      erbij += ` ${naam}="${escapeAttribuut(waarde)}"`;
    }
  }
  if (erbij) stukken.push({ van: t.invoeg, tot: t.invoeg, tekst: erbij });
  let uit = html;
  for (const s of stukken.sort((a, b) => b.van - a.van)) uit = uit.slice(0, s.van) + s.tekst + uit.slice(s.tot);
  return uit;
}

/** De inhoud van een element zoals het voorbeeld hem na het typen doorgeeft. */
export type Knoop = { t: string } | { br: true } | { el: number | null; k: Knoop[] };

const MAX_KNOPEN = 5_000;
const MAX_DIEPTE = 30;

/** Leest de knopen uit het voorbeeld; null bij iets onbruikbaars. */
export function leesKnopen(raw: unknown): Knoop[] | null {
  let aantal = 0;
  function lees(lijst: unknown, diepte: number): Knoop[] | null {
    if (!Array.isArray(lijst) || diepte > MAX_DIEPTE) return null;
    const uit: Knoop[] = [];
    for (const k of lijst) {
      if (++aantal > MAX_KNOPEN || !k || typeof k !== "object") return null;
      const o = k as Record<string, unknown>;
      if (typeof o.t === "string") uit.push({ t: o.t.slice(0, MAX_BEWERK_TEKST * 2) });
      else if (o.br) uit.push({ br: true });
      else {
        const kinderen = lees(o.k, diepte + 1);
        if (!kinderen) return null;
        uit.push({ el: bronNummer(o.el), k: kinderen });
      }
    }
    return uit;
  }
  return lees(raw, 0);
}

/**
 * Chrome zet na Shift+Enter aan het eind een extra `<br>` neer, zodat de
 * nieuwe regel te zien is. Op de pagina doet die niets; hij gaat er weer af.
 */
function zonderSlotBr(knopen: Knoop[]): Knoop[] {
  const lijst = [...knopen];
  let i = lijst.length - 1;
  while (i >= 0) {
    const k = lijst[i];
    if ("t" in k && !k.t.trim()) i--;
    else break;
  }
  if (i < 0) return lijst;
  const laatste = lijst[i];
  if ("br" in laatste) lijst.splice(i, 1);
  else if ("el" in laatste) lijst[i] = { el: laatste.el, k: zonderSlotBr(laatste.k) };
  return lijst;
}

/**
 * Zet een getypte tekst terug in de bron. Elementen die er al in stonden
 * (zoals een `span` met een accentkleur) komen terug met hun eigen starttag
 * uit de bron, dus zonder wat de Kit er in het voorbeeld aan toevoegde. Wat
 * de browser er tijdens het typen zelf in zette, wordt gewone tekst; alleen
 * een regeleinde (`<br>`) blijft.
 */
export function pasTekstToe(
  html: string,
  id: number,
  knopen: Knoop[]
): { html: string; veranderd: boolean; zelfdeOpbouw: boolean } {
  const tags = scanTags(html);
  const ouder = vind(tags, id);
  if (ouder.leeg || ouder.sluitStart === null) {
    throw new BewerkFout(`De HTML van dit onderdeel is niet netjes afgesloten; ${VRAAG_CLAUDE}.`);
  }
  const sluit = ouder.sluitStart;
  const oud = html.slice(ouder.openEind, sluit);
  // De browser maakt van een spatie aan het eind vaak een harde spatie.
  const hardeSpaties = /&nbsp;|&#160;|&#xa0;| /i.test(oud);

  function schrijf(lijst: Knoop[]): string {
    return lijst
      .map((k) => {
        if ("t" in k) return escapeTekst(hardeSpaties ? k.t : k.t.replace(/ /g, " "));
        if ("br" in k) return "<br>";
        const t = k.el === null ? undefined : tags[k.el];
        const erin = !!t && t.index > ouder.index && t.start >= ouder.openEind && t.start < sluit;
        if (!t || !erin) return schrijf(k.k);
        if (t.leeg) return html.slice(t.start, t.openEind);
        if (t.sluitStart === null || t.eind === null) return schrijf(k.k);
        return html.slice(t.start, t.openEind) + schrijf(k.k) + html.slice(t.sluitStart, t.eind);
      })
      .join("");
  }

  const eindigdeOpBr = /<br\b[^>]*>\s*(<\/[^>]+>\s*)*$/i.test(oud);
  const nieuw = schrijf(eindigdeOpBr ? knopen : zonderSlotBr(knopen));
  if (nieuw === oud) return { html, veranderd: false, zelfdeOpbouw: true };
  const uit = html.slice(0, ouder.openEind) + nieuw + html.slice(sluit);
  const na = scanTags(uit);
  const zelfdeOpbouw = na.length === tags.length && na.every((t, i) => t.naam === tags[i].naam);
  return { html: uit, veranderd: true, zelfdeOpbouw };
}

/** Een andere foto in een `<img>`. `srcset` en `sizes` gaan weg, anders toont de browser de oude nog. */
export function zetFoto(html: string, id: number, src: string, alt?: string): string {
  const tags = scanTags(html);
  const t = vind(tags, id);
  if (t.naam !== "img") throw new BewerkFout("Dit onderdeel is geen foto.");
  const wijzig: Record<string, string | null> = { src, srcset: null, sizes: null };
  if (alt !== undefined) wijzig.alt = alt;
  let uit = pasTagAan(html, t, wijzig);
  // In een <picture> kiest de browser eerst uit de <source>s: die wijzen nu ook naar de nieuwe foto.
  const ouder = t.ouder === null ? null : tags[t.ouder];
  if (ouder?.naam === "picture") {
    const bronnen = tags.filter((x) => x.ouder === ouder.index && x.naam === "source").sort((a, b) => b.start - a.start);
    for (const s of bronnen) uit = pasTagAan(uit, s, { srcset: src, type: null });
  }
  return uit;
}

/** Een andere achtergrond: de `url(...)` in het `style`-attribuut. */
export function zetAchtergrond(html: string, id: number, url: string): string {
  const t = vind(scanTags(html), id);
  const stijl = leesAttribuut(t, "style");
  if (!stijl || !URL_IN_STIJL.test(stijl)) throw new BewerkFout(`Deze achtergrond staat in de CSS; ${VRAAG_CLAUDE}.`);
  return pasTagAan(html, t, { style: stijl.replace(URL_IN_STIJL, `url('${url.replace(/'/g, "%27")}')`) });
}

/** Een ander adres voor een link, en wel of niet in een nieuw tabblad. */
export function zetLink(html: string, id: number, href: string, nieuwTabblad: boolean): string {
  const t = vind(scanTags(html), id);
  if (t.naam !== "a") throw new BewerkFout("Dit onderdeel is geen link.");
  const rel = (leesAttribuut(t, "rel") ?? "").split(/\s+/).filter(Boolean);
  const overig = rel.filter((r) => r !== "noopener" && r !== "noreferrer");
  const nieuweRel = nieuwTabblad ? [...rel.filter((r) => r !== "noopener"), "noopener"] : overig;
  return pasTagAan(html, t, {
    href,
    target: nieuwTabblad ? "_blank" : null,
    rel: nieuweRel.length ? nieuweRel.join(" ") : null,
  });
}

/** Witruimte vlak voor en na een stuk, en of het stuk alleen op zijn regel staat. */
function regel(html: string, start: number, eind: number) {
  let voor = start;
  while (voor > 0 && (html[voor - 1] === " " || html[voor - 1] === "\t")) voor--;
  let na = eind;
  while (na < html.length && (html[na] === " " || html[na] === "\t")) na++;
  const alleen = (voor === 0 || html[voor - 1] === "\n") && (na === html.length || html[na] === "\n" || html[na] === "\r");
  return { voor, na, alleen };
}

export function verwijderElement(html: string, id: number): string {
  const { start, eind } = bereik(vind(scanTags(html), id));
  const r = regel(html, start, eind);
  if (!r.alleen) return html.slice(0, start) + html.slice(eind);
  let van = r.voor;
  let tot = r.na;
  if (html[tot] === "\r") tot++;
  if (html[tot] === "\n") tot++;
  else if (van > 0 && html[van - 1] === "\n") van--;
  return html.slice(0, van) + html.slice(tot);
}

/** Zet een kopie direct na het element, met dezelfde witruimte als ervoor. Geeft het nummer van de kopie. */
export function dupliceerElement(html: string, id: number): { html: string; nieuweId: number } {
  const tags = scanTags(html);
  const t = vind(tags, id);
  const { start, eind } = bereik(t);
  let wit = start;
  while (wit > 0 && isWit(html[wit - 1])) wit--;
  const tussen = html.slice(wit, start);
  const binnen = tags.filter((x) => x.start >= start && x.start < eind).length;
  return { html: html.slice(0, eind) + tussen + html.slice(start, eind) + html.slice(eind), nieuweId: id + binnen };
}

/** Wisselt het element met het element ervoor (-1) of erna (1) in hetzelfde blok. */
export function verplaatsElement(html: string, id: number, richting: -1 | 1): { html: string; nieuweId: number } {
  const tags = scanTags(html);
  const t = vind(tags, id);
  const broers = tags.filter((x) => x.ouder === t.ouder);
  const buur = broers[broers.indexOf(t) + richting];
  if (!buur) throw new BewerkFout(richting === -1 ? "Dit staat al bovenaan in zijn blok." : "Dit staat al onderaan in zijn blok.");
  const [eerste, tweede] = richting === -1 ? [buur, t] : [t, buur];
  const a = bereik(eerste);
  const b = bereik(tweede);
  const uit =
    html.slice(0, a.start) +
    html.slice(b.start, b.eind) +
    html.slice(a.eind, b.start) +
    html.slice(a.start, a.eind) +
    html.slice(b.eind);
  const inBuur = tags.filter((x) => x.start >= buur.start && x.start < (buur.eind ?? buur.start)).length;
  return { html: uit, nieuweId: richting === -1 ? buur.index : t.index + inBuur };
}
