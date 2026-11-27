import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BewerkFout,
  bronTekst,
  dupliceerElement,
  leesBewerkKeuze,
  leesKnopen,
  markeer,
  mogelijkheden,
  ontcijfer,
  pasTekstToe,
  scanTags,
  verplaatsElement,
  verwijderElement,
  zetAchtergrond,
  zetFoto,
  zetLink,
  type BewerkKeuze,
} from "./bewerken";

const PAGINA = `<div id="psvk-app">
  <!-- <p>commentaar telt niet</p> -->
  <section class="psvk-section psvk-red">
    <h1 class="psvk-title">Vooruitblik <span class="psvk-accent">PSV &amp; NEC</span></h1>
    <img src="/files/4075/a.jpg" srcset="/files/4075/a-2x.jpg 2x" alt="Oud" data-psvk-photo>
    <a class="psvk-btn" href="https://www.psv.nl" target="_blank" rel="noopener">Koop tickets</a>
  </section>
  <ul class="psvk-list">
    <li>Een</li>
    <li>Twee</li>
    <li>Drie</li>
  </ul>
  <div class="psvk-hero" style="background-image: url(&quot;/files/4075/bg.jpg&quot;); color: red">Hero</div>
  <style>.x > p { color: red }</style>
  <svg viewBox="0 0 10 10"><path d="M0 0h10"/><circle r="1"/></svg>
</div>`;

function nummer(html: string, naam: string, n = 0): number {
  const t = scanTags(html).filter((x) => x.naam === naam)[n];
  assert.ok(t, `${naam} ${n} niet gevonden`);
  return t.index;
}

test("scanTags: elementen in de volgorde van hun starttags, zonder commentaar", () => {
  const tags = scanTags(PAGINA);
  assert.deepEqual(
    tags.map((t) => t.naam),
    ["div", "section", "h1", "span", "img", "a", "ul", "li", "li", "li", "div", "style", "svg", "path", "circle"]
  );
  const h1 = tags[2];
  assert.equal(PAGINA.slice(h1.start, h1.eind!), '<h1 class="psvk-title">Vooruitblik <span class="psvk-accent">PSV &amp; NEC</span></h1>');
  assert.equal(tags[3].ouder, 2);
  assert.equal(tags[4].leeg, true);
  assert.equal(tags[13].leeg, true, "<path/> in een svg sluit zichzelf");
  assert.equal(tags[11].naam, "style");
  assert.equal(tags.find((t) => t.naam === "p"), undefined, "geen tags uit commentaar of css");
});

test("scanTags: een > in een attribuut en een niet afgesloten element", () => {
  const tags = scanTags('<p title="a > b" data-x=1>tekst<b>vet</p><i>los');
  assert.deepEqual(tags.map((t) => t.naam), ["p", "b", "i"]);
  assert.equal(tags[0].eind, 41);
  assert.equal(tags[1].eind, null, "de browser sloot <b> zelf");
  assert.equal(tags[2].eind, null);
});

test("markeer: elk element krijgt zijn nummer, de rest blijft gelijk", () => {
  const html = '<div id="a"><br/><img src=x.jpg><p>Hoi</p></div>';
  assert.equal(
    markeer(html),
    '<div id="a" data-psvk-bron="0"><br data-psvk-bron="1"/><img src=x.jpg data-psvk-bron="2"><p data-psvk-bron="3">Hoi</p></div>'
  );
});

test("ontcijfer en bronTekst", () => {
  assert.equal(ontcijfer("PSV &amp; NEC &euro;5 &#233;&#xE9; &onbekend;"), "PSV & NEC €5 éé &onbekend;");
  const tags = scanTags(PAGINA);
  assert.equal(bronTekst(PAGINA, tags[2]), "Vooruitblik PSV & NEC");
  assert.equal(bronTekst(PAGINA, tags[4]), null);
});

function keuze(html: string, bron: number, extra: Partial<BewerkKeuze> = {}): BewerkKeuze {
  const tag = scanTags(html)[bron];
  return {
    bron,
    naam: tag?.naam ?? "div",
    tekst: tag ? (bronTekst(html, tag) ?? "") : "",
    tekstTeLang: false,
    inline: true,
    foto: null,
    achtergrond: null,
    link: null,
    ouder: true,
    plek: { x: 0, y: 0, b: 10, h: 10 },
    dubbel: false,
    ...extra,
  };
}

test("mogelijkheden: tekst alleen als hij gelijk is aan de bron", () => {
  const h1 = nummer(PAGINA, "h1");
  assert.equal(mogelijkheden(PAGINA, keuze(PAGINA, h1)).tekst, null);
  assert.match(mogelijkheden(PAGINA, keuze(PAGINA, h1, { tekst: "Teller 12" })).tekst!, /verandert de pagina zelf/);
  assert.match(mogelijkheden(PAGINA, keuze(PAGINA, h1, { inline: false })).tekst!, /meer onderdelen/);
  assert.equal(mogelijkheden(PAGINA, keuze(PAGINA, nummer(PAGINA, "img"))).tekst, undefined);
  assert.match(mogelijkheden(PAGINA, keuze(PAGINA, 99, { tekst: "x" })).tekst!, /JavaScript/);
});

test("mogelijkheden: foto, achtergrond, link en verplaatsen", () => {
  const img = nummer(PAGINA, "img");
  const opFoto = mogelijkheden(PAGINA, keuze(PAGINA, img, { foto: { bron: img, url: "https://x/a.jpg" } }));
  assert.deepEqual(opFoto.foto, { kan: null, doel: img, soort: "img", url: "https://x/a.jpg" });

  const hero = nummer(PAGINA, "div", 1);
  const opHero = mogelijkheden(PAGINA, keuze(PAGINA, hero, { achtergrond: 'url("https://psv/files/4075/bg.jpg")' }));
  assert.equal(opHero.foto?.kan, null);
  assert.equal(opHero.foto?.soort, "achtergrond");
  const inCss = mogelijkheden(PAGINA, keuze(PAGINA, nummer(PAGINA, "section"), { achtergrond: 'url("x.jpg")' }));
  assert.match(inCss.foto!.kan!, /in de CSS/);

  const a = nummer(PAGINA, "a");
  assert.equal(mogelijkheden(PAGINA, keuze(PAGINA, a, { link: { bron: a, href: "x" } })).link?.kan, null);

  const eerste = mogelijkheden(PAGINA, keuze(PAGINA, nummer(PAGINA, "li", 0)));
  assert.match(eerste.omhoog!, /bovenaan/);
  assert.equal(eerste.omlaag, null);
  assert.match(mogelijkheden(PAGINA, keuze(PAGINA, nummer(PAGINA, "li", 2))).omlaag!, /onderaan/);
  assert.match(mogelijkheden(PAGINA, keuze(PAGINA, 0)).verwijderen!, /hele pagina/);
});

test("pasTekstToe: tekst aangepast, span met eigen starttag terug", () => {
  const h1 = nummer(PAGINA, "h1");
  const span = nummer(PAGINA, "span");
  const uit = pasTekstToe(PAGINA, h1, [
    { t: "Terugblik " },
    { el: span, k: [{ t: "PSV & Ajax" }] },
    { br: true },
    // Wat de browser er zelf in zette, wordt tekst.
    { el: null, k: [{ t: " <b>!</b> " }] },
  ]);
  assert.equal(uit.veranderd, true);
  assert.equal(uit.zelfdeOpbouw, false, "er kwam een <br> bij");
  assert.ok(
    uit.html.includes(
      '<h1 class="psvk-title">Terugblik <span class="psvk-accent">PSV &amp; Ajax</span><br> &lt;b&gt;!&lt;/b&gt; </h1>'
    )
  );
  assert.equal(uit.html.replace(/<h1[\s\S]*?<\/h1>/, ""), PAGINA.replace(/<h1[\s\S]*?<\/h1>/, ""));
});

test("pasTekstToe: niets veranderd, of een element van buiten telt niet", () => {
  const h1 = nummer(PAGINA, "h1");
  const span = nummer(PAGINA, "span");
  const zelfde = pasTekstToe(PAGINA, h1, [{ t: "Vooruitblik " }, { el: span, k: [{ t: "PSV & NEC" }] }]);
  assert.deepEqual(zelfde, { html: PAGINA, veranderd: false, zelfdeOpbouw: true });

  const li = nummer(PAGINA, "li");
  const uit = pasTekstToe(PAGINA, li, [{ el: span, k: [{ t: "Nul" }] }]);
  assert.ok(uit.html.includes("<li>Nul</li>"));
  assert.equal(uit.zelfdeOpbouw, true);
});

test("pasTekstToe: de extra <br> van de browser aan het eind gaat eraf", () => {
  const html = '<h1><span class="a">Oud</span></h1>';
  const uit = pasTekstToe(html, 0, [{ el: 1, k: [{ t: "PSV" }, { br: true }, { t: "NEC" }, { br: true }] }, { t: "\n" }]);
  assert.equal(uit.html, '<h1><span class="a">PSV<br>NEC</span>\n</h1>');
  // Stond er al een <br> aan het eind, dan blijft hij.
  const metBr = "<p>a<br></p>";
  assert.equal(pasTekstToe(metBr, 0, [{ t: "b" }, { br: true }]).html, "<p>b<br></p>");
});

test("zetFoto: nieuwe src en alt, srcset weg", () => {
  const img = nummer(PAGINA, "img");
  const uit = zetFoto(PAGINA, img, "https://psveindhoven.b-cdn.net/playable/editor/1-a.jpg?x=1&y=2", "Nieuw \"citaat\"");
  assert.ok(
    uit.includes(
      '<img src="https://psveindhoven.b-cdn.net/playable/editor/1-a.jpg?x=1&amp;y=2" alt="Nieuw &quot;citaat&quot;" data-psvk-photo>'
    )
  );
  assert.throws(() => zetFoto(PAGINA, nummer(PAGINA, "h1"), "x.jpg"), BewerkFout);

  const picture = '<picture><source srcset="a.webp" type="image/webp"><img src="a.jpg"></picture>';
  assert.equal(
    zetFoto(picture, 2, "b.jpg"),
    '<picture><source srcset="b.jpg"><img src="b.jpg"></picture>'
  );
});

test("zetAchtergrond: alleen de url in de stijl verandert", () => {
  const uit = zetAchtergrond(PAGINA, nummer(PAGINA, "div", 1), "https://cdn/nieuw.jpg");
  assert.ok(uit.includes(`style="background-image: url('https://cdn/nieuw.jpg'); color: red">Hero`));
  assert.throws(() => zetAchtergrond(PAGINA, nummer(PAGINA, "section"), "x.jpg"), /in de CSS/);
});

test("zetLink: adres en nieuw tabblad", () => {
  const a = nummer(PAGINA, "a");
  const zelfde = zetLink(PAGINA, a, "https://www.psvfanstore.nl", true);
  assert.ok(zelfde.includes('<a class="psvk-btn" href="https://www.psvfanstore.nl" target="_blank" rel="noopener">'));
  const hier = zetLink(PAGINA, a, "#psvk-blok-1", false);
  assert.ok(hier.includes('<a class="psvk-btn" href="#psvk-blok-1">Koop tickets</a>'));
  assert.ok(zetLink('<a href="x">x</a>', 0, "y", true).startsWith('<a href="y" target="_blank" rel="noopener">'));
});

test("verwijderElement: de hele regel weg als het element er alleen op staat", () => {
  const uit = verwijderElement(PAGINA, nummer(PAGINA, "li", 1));
  assert.ok(uit.includes("<li>Een</li>\n    <li>Drie</li>"));
  assert.equal(verwijderElement("<p>a <b>b</b> c</p>", 1), "<p>a  c</p>");
});

test("dupliceerElement: kopie erachter met dezelfde inspringing", () => {
  const li = nummer(PAGINA, "li", 0);
  const { html, nieuweId } = dupliceerElement(PAGINA, li);
  assert.ok(html.includes("<li>Een</li>\n    <li>Een</li>\n    <li>Twee</li>"));
  assert.equal(scanTags(html)[nieuweId].start, html.indexOf("<li>Een</li>", html.indexOf("<li>Een</li>") + 1));

  const h1 = nummer(PAGINA, "h1");
  const kopie = dupliceerElement(PAGINA, h1);
  assert.equal(kopie.nieuweId, h1 + 2, "de span hoort bij de h1");
});

test("verplaatsElement: wisselen met de buur, nummer volgt het element", () => {
  const twee = nummer(PAGINA, "li", 1);
  const omhoog = verplaatsElement(PAGINA, twee, -1);
  assert.ok(omhoog.html.includes("<li>Twee</li>\n    <li>Een</li>\n    <li>Drie</li>"));
  assert.equal(omhoog.html.slice(scanTags(omhoog.html)[omhoog.nieuweId].start).slice(0, 13), "<li>Twee</li>");

  const h1 = nummer(PAGINA, "h1");
  const omlaag = verplaatsElement(PAGINA, h1, 1);
  const tags = scanTags(omlaag.html);
  assert.equal(tags[omlaag.nieuweId].naam, "h1");
  assert.equal(tags[h1].naam, "img");
  assert.throws(() => verplaatsElement(PAGINA, nummer(PAGINA, "li", 0), -1), /bovenaan/);
});

test("leesKnopen en leesBewerkKeuze: alleen bruikbare invoer", () => {
  assert.deepEqual(leesKnopen([{ t: "a" }, { br: 1 }, { el: 3, k: [{ t: "b" }] }, { el: "x", k: [] }]), [
    { t: "a" },
    { br: true },
    { el: 3, k: [{ t: "b" }] },
    { el: null, k: [] },
  ]);
  assert.equal(leesKnopen("tekst"), null);
  assert.equal(leesKnopen([{ el: 1, k: "x" }]), null);

  const goed = { nummer: 2, naam: "h1", tekst: "Hoi", inline: true, plek: { x: 1, y: 2, b: 3, h: 4 } };
  assert.equal(leesBewerkKeuze(goed)?.bron, 2);
  assert.equal(leesBewerkKeuze({ ...goed, nummer: -1 }), null);
  assert.equal(leesBewerkKeuze({ ...goed, plek: { x: 1 } }), null);
  assert.equal(leesBewerkKeuze({ ...goed, foto: { bron: "x", url: "u" } })?.foto?.bron, null);
});
