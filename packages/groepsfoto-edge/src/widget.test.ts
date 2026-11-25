import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { splitKit } from "../../../lib/playable-loader/bundle.ts";
import { FRAMEWORK_CSS, FRAMEWORK_JS } from "../../../lib/playable-loader/kit.ts";

const lees = (naam: string) => readFileSync(new URL(`../widget/${naam}`, import.meta.url), "utf8");

/**
 * De Playable loader laat de Kit weg als hij denkt dat die al in de code
 * staat. Noemt de widget de Kit bij naam, dan mist de pagina zijn huisstijl en
 * scripts (gebeurd bij de eerste test op club.psv.nl).
 */
test("de widget wordt door de loader niet aangezien voor de Kit", () => {
  assert.equal(splitKit(lees("pagina.css"), FRAMEWORK_CSS).kit, "geen");
  assert.equal(splitKit(lees("pagina.js"), FRAMEWORK_JS).kit, "geen");
});
