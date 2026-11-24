import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

/**
 * `dist/groepsfoto.js` staat in de repo, zodat iemand zonder npm hem in de
 * editor van Bunny kan plakken. Deze test faalt als de code is aangepast maar
 * het bestand niet opnieuw is gebouwd (`npm run edge:build`).
 */
test("dist/groepsfoto.js is bijgewerkt met de code", async () => {
  const root = new URL("../../../", import.meta.url);
  const resultaat = await build({
    entryPoints: [new URL("packages/groepsfoto-edge/src/main.ts", root).pathname],
    absWorkingDir: root.pathname,
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    external: ["https://*"],
    write: false,
    logLevel: "silent",
  });
  const verwacht = resultaat.outputFiles[0].text;
  const bestand = readFileSync(new URL("packages/groepsfoto-edge/dist/groepsfoto.js", root), "utf8");
  assert.equal(bestand, verwacht, "Draai npm run edge:build en commit dist/groepsfoto.js.");
});
