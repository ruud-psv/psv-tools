import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AANWIJZER_JS,
  leesAanwijzing,
  leesSelectie,
  MAX_SELECTIE_HTML,
  MAX_TEKST,
  selectieNotitie,
  selectieTekst,
} from "./selectie";

const AANWIJZING = {
  pad: "section.psvk-section.psvk-red > div.psvk-wrap > h1.psvk-hero-title",
  tekst: "Vooruitblik PSV - NEC",
  html: '<h1 class="psvk-hero-title">Vooruitblik PSV - NEC</h1>',
  niveaus: ["section.psvk-section.psvk-red", "div.psvk-wrap", "h1.psvk-hero-title"],
  niveau: 2,
  wijzer: [1, 0, 0],
};

test("leesSelectie: alleen pad, tekst en html, ingekort", () => {
  assert.deepEqual(leesSelectie(AANWIJZING), {
    pad: AANWIJZING.pad,
    tekst: AANWIJZING.tekst,
    html: AANWIJZING.html,
  });
  const lang = leesSelectie({ pad: "p", tekst: "x".repeat(MAX_TEKST + 10), html: "y".repeat(MAX_SELECTIE_HTML + 10) });
  assert.equal(lang?.tekst.length, MAX_TEKST);
  assert.equal(lang?.html.length, MAX_SELECTIE_HTML);
  assert.deepEqual(leesSelectie({ pad: "p", tekst: 3 }), { pad: "p", tekst: "", html: "" });
});

test("leesSelectie: niets bruikbaars geeft null", () => {
  assert.equal(leesSelectie(null), null);
  assert.equal(leesSelectie("h1"), null);
  assert.equal(leesSelectie({ pad: "   " }), null);
  assert.equal(leesSelectie({ tekst: "zonder pad" }), null);
});

test("leesAanwijzing: niveaus, niveau en wijzer moeten kloppen", () => {
  assert.deepEqual(leesAanwijzing(AANWIJZING), AANWIJZING);
  assert.deepEqual(leesAanwijzing({ ...AANWIJZING, niveau: 0 })?.niveau, 0);
  assert.equal(leesAanwijzing({ ...AANWIJZING, niveau: 3 }), null);
  assert.equal(leesAanwijzing({ ...AANWIJZING, niveau: -1 }), null);
  assert.equal(leesAanwijzing({ ...AANWIJZING, wijzer: [1, 0] }), null);
  assert.equal(leesAanwijzing({ ...AANWIJZING, wijzer: [1, 0, 0.5] }), null);
  assert.equal(leesAanwijzing({ ...AANWIJZING, niveaus: ["a", 2, "c"] }), null);
  assert.equal(leesAanwijzing({ ...AANWIJZING, pad: "" }), null);
});

test("selectieTekst: pad, tekst en html in een eigen blok", () => {
  const tekst = selectieTekst(AANWIJZING);
  assert.ok(tekst.startsWith("<aangewezen_element>\n"));
  assert.ok(tekst.endsWith("\n</aangewezen_element>"));
  assert.ok(tekst.includes(`Pad in de pagina: ${AANWIJZING.pad}`));
  assert.ok(tekst.includes(`Tekst erin: ${AANWIJZING.tekst}`));
  assert.ok(tekst.includes(AANWIJZING.html));
  assert.ok(tekst.includes("<pagina_html>"));

  const kaal = selectieTekst({ pad: "div.psvk-wrap", tekst: "", html: "" });
  assert.ok(!kaal.includes("Tekst erin"));
  assert.ok(!kaal.includes("Weergegeven HTML"));
});

test("selectieNotitie: kort, met het pad", () => {
  assert.equal(selectieNotitie(AANWIJZING), `(aangewezen in het voorbeeld: ${AANWIJZING.pad})`);
});

test("AANWIJZER_JS: leesbaar, en veilig in een inline script", () => {
  assert.doesNotThrow(() => new Function(AANWIJZER_JS));
  assert.ok(!/<\/script/i.test(AANWIJZER_JS));
  assert.ok(!AANWIJZER_JS.includes("${"));
  // De grenzen in het script zijn dezelfde als die van de server.
  assert.ok(AANWIJZER_JS.includes(`.slice(0, ${MAX_TEKST})`));
  assert.ok(AANWIJZER_JS.includes(`.slice(0, ${MAX_SELECTIE_HTML})`));
});
