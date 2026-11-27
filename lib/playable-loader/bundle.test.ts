import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_FIELD_CHARS,
  asciiOnly,
  PageSourceError,
  buildBundle,
  bundlePath,
  DEEL_SCHEIDING,
  loaderFields,
  mountHtml,
  mountId,
  parseCampaignId,
  preparePage,
  splitKit,
  splitsDelen,
  voegDelenSamen,
} from "./bundle";
import { FRAMEWORK_CSS, FRAMEWORK_JS, STARTER_HTML } from "./kit";

const PAGE_JS = "document.addEventListener('psvk:ready', function (e) { e.detail.root.dataset.klaar = '1'; });";
const PAGE_CSS = "#psvk-app .psvk-shirt-titel { color: var(--psvk-red); }";

const count = (text: string, needle: string) => text.split(needle).length - 1;

test("splitKit: eigen kit eruit, andere versie laten staan, anders niets", () => {
  assert.deepEqual(splitKit(`${FRAMEWORK_JS}\n\n${PAGE_JS}`, FRAMEWORK_JS), { rest: PAGE_JS, kit: "eigen" });
  assert.deepEqual(splitKit(PAGE_JS, FRAMEWORK_JS), { rest: PAGE_JS, kit: "geen" });
  const ouder = "/* PSV CAMPAIGN KIT — v0.9 */\n(function(){})();";
  assert.deepEqual(splitKit(ouder, FRAMEWORK_JS), { rest: ouder, kit: "andere-versie" });
});

test("splitKit: ook een tweede kopie van de kit gaat eruit", () => {
  const twee = `${FRAMEWORK_JS}\n${PAGE_JS}\n${FRAMEWORK_JS}\nvar onder = 1;`;
  const { rest, kit } = splitKit(twee, FRAMEWORK_JS);
  assert.equal(kit, "eigen");
  assert.ok(!rest.includes("PSV CAMPAIGN KIT"));
  assert.ok(rest.includes(PAGE_JS) && rest.includes("var onder = 1;"));
});

test("html-blokken: splitsen, samenvoegen en de plek in Playable", () => {
  assert.deepEqual(splitsDelen("<p>a</p>"), ["<p>a</p>"]);
  assert.deepEqual(splitsDelen("<p>a</p>\n<!-- psvk-deel -->\n<p>b</p><!--PSVK-DEEL: formulier--><p>c</p>"), [
    "<p>a</p>",
    "<p>b</p>",
    "<p>c</p>",
  ]);
  assert.equal(voegDelenSamen([" <p>a</p>", "<p>b</p>\n"]), `<p>a</p>\n\n${DEEL_SCHEIDING}\n\n<p>b</p>`);
  assert.deepEqual(splitsDelen(voegDelenSamen(["<p>a</p>", ""])), ["<p>a</p>", ""]);
  assert.equal(mountId(0), "psvk-mount");
  assert.equal(mountId(1), "psvk-mount-2");
  assert.equal(mountHtml(2), '<div id="psvk-mount-3"></div>');
});

test("preparePage en buildBundle: elk html-blok apart in de bundel", () => {
  const html = voegDelenSamen(['<div id="psvk-app"><h1>Boven</h1></div>', '<div id="psvk-app"><p>Onder</p></div>']);
  const page = preparePage({ html, css: "", js: "" });
  assert.deepEqual(page.delen, ['<div id="psvk-app"><h1>Boven</h1></div>', '<div id="psvk-app"><p>Onder</p></div>']);
  assert.deepEqual(page.warnings, []);
  const bundle = buildBundle(page, { campaignId: 243381, publishedAt: "2026-11-27T10:00:00.000Z" });
  assert.doesNotThrow(() => new Function(bundle));
  assert.ok(bundle.includes(`var DELEN = ${JSON.stringify(page.delen)};`));
  assert.ok(!bundle.includes(DEEL_SCHEIDING), "de scheiding zelf komt niet op de pagina");

  const leeg = preparePage({ html: voegDelenSamen(['<div id="psvk-app"></div>', ""]), css: "", js: "" });
  assert.match(leeg.warnings[0], /Html-blok 2 is leeg/);
});

test("preparePage: de kit zit er één keer in, ook als hij al geplakt was", () => {
  for (const css of [PAGE_CSS, `${FRAMEWORK_CSS}\n${PAGE_CSS}`]) {
    for (const js of [PAGE_JS, `${FRAMEWORK_JS}\n${PAGE_JS}`]) {
      const page = preparePage({ html: STARTER_HTML, css, js });
      assert.equal(count(page.css, "PSV CAMPAIGN KIT"), 1);
      assert.ok(page.css.endsWith(PAGE_CSS));
      assert.equal(page.kitJs, FRAMEWORK_JS.trim());
      assert.equal(page.pageJs, PAGE_JS);
      assert.deepEqual(page.warnings, []);
    }
  }
});

test("preparePage: andere kitversie blijft staan, met een waarschuwing", () => {
  const page = preparePage({
    html: STARTER_HTML,
    css: "/* PSV CAMPAIGN KIT — v0.9 */ #psvk-app { color: red; }",
    js: "/* PSV CAMPAIGN KIT — v0.9 */ (function(){})();",
  });
  assert.equal(page.kitJs, "");
  assert.ok(!page.css.includes(FRAMEWORK_CSS.trim()));
  assert.equal(page.warnings.length, 2);
});

test("preparePage: fouten en waarschuwingen", () => {
  assert.throws(() => preparePage({ html: "  ", css: "", js: "" }), /HTML is leeg/);
  assert.throws(
    () => preparePage({ html: STARTER_HTML, css: "", js: "document.addEventListener('psvk:ready', function () {" }),
    (err: unknown) => err instanceof PageSourceError && /JavaScript bevat een fout/.test(err.message)
  );
  assert.throws(
    () => preparePage({ html: "x".repeat(MAX_FIELD_CHARS + 1), css: "", js: "" }),
    /HTML is te groot/
  );
  const zonderApp = preparePage({ html: "<p>Hallo</p>", css: "", js: "" });
  assert.match(zonderApp.warnings[0], /psvk-app/);
});

test("buildBundle: leesbaar JavaScript met de campagne erin", () => {
  const page = preparePage({ html: STARTER_HTML, css: PAGE_CSS, js: PAGE_JS });
  const bundle = buildBundle(page, { campaignId: 244347, publishedAt: "2026-11-11T13:00:00.000Z" });
  assert.doesNotThrow(() => new Function(bundle));
  assert.ok(bundle.includes("campagne: 244347"));
  assert.ok(bundle.includes('data-psvk-bundel="244347"'));
  assert.equal(count(bundle, "PSV CAMPAIGN KIT"), 3); // kop van de CSS en van de JS, plus de eigen kop
});

test("buildBundle: lastige tekens in HTML en CSS breken de bundel niet", () => {
  const page = preparePage({
    html: '<div id="psvk-app"><p>Quote " en \' en </script> en ${x} en `backtick` en \u2028</p></div>',
    css: "#psvk-app::after { content: \"\\201C\"; }",
    js: "",
  });
  const bundle = buildBundle(page, { campaignId: 1, publishedAt: "2026-11-11T13:00:00.000Z" });
  assert.doesNotThrow(() => new Function(bundle));
});

test("loaderFields: drie velden, de JavaScript laadt de bundel met een minuut-versie", () => {
  const url = "https://psveindhoven.b-cdn.net/playable/pages/244347/page.js";
  const fields = loaderFields(244347, url);
  assert.equal(fields.html, '<div id="psvk-mount"></div>');
  assert.match(fields.css, /#psvk-mount/);
  assert.doesNotThrow(() => new Function(fields.js));
  assert.ok(fields.js.includes(JSON.stringify(url)));
  assert.match(fields.js, /\?v=" \+ Math\.floor\(Date\.now\(\) \/ 60000\)/);
});

test("bundlePath en parseCampaignId", () => {
  assert.equal(bundlePath(244347), "playable/pages/244347/page.js");
  assert.equal(parseCampaignId(" 244347 "), 244347);
  assert.equal(parseCampaignId("#244347"), 244347);
  assert.equal(parseCampaignId(244347), 244347);
  assert.equal(parseCampaignId("0"), null);
  assert.equal(parseCampaignId("../244347"), null);
  assert.equal(parseCampaignId("abc"), null);
  assert.equal(parseCampaignId(undefined), null);
});

test("buildBundle: alleen ASCII, en speciale tekens komen er hetzelfde uit", () => {
  const html = '<div id="psvk-app"><p>Één — Kovář 😀</p></div>';
  const page = preparePage({ html, css: "#psvk-app::after { content: '—'; }", js: "var naam = 'Kovář'; var r = /[é]/;" });
  const bundle = buildBundle(page, { campaignId: 1, publishedAt: "2026-11-11T13:00:00.000Z" });
  assert.ok(/^[\x00-\x7f]*$/.test(bundle));
  assert.doesNotThrow(() => new Function(bundle));
  // De escape betekent in JavaScript hetzelfde als het teken.
  assert.equal(new Function(`return ${asciiOnly(JSON.stringify(html))};`)(), html);
  assert.equal(new Function(asciiOnly("var s = 'Kovář 😀'; return s + /[é]/.test('é');"))(), "Kovář 😀true");
});
