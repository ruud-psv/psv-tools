import { test } from "node:test";
import assert from "node:assert/strict";

import { UploadFout, editorPad, isAfbeelding, leesCampagneMappen } from "./bunny";
import { bundlePath } from "./bundle";

test("leesCampagneMappen: alleen mappen met een campagne-ID", () => {
  assert.deepEqual(
    leesCampagneMappen([
      { ObjectName: "244347", IsDirectory: true },
      { ObjectName: "12", IsDirectory: true },
      { ObjectName: "12", IsDirectory: true },
      { ObjectName: "page.js", IsDirectory: false },
      { ObjectName: "999", IsDirectory: false },
      { ObjectName: "oud", IsDirectory: true },
      { ObjectName: "0", IsDirectory: true },
      null,
    ]),
    [12, 244347]
  );
  assert.deepEqual(leesCampagneMappen({ HttpCode: 404 }), []);
});

test("editorPad: in playable/editor, met campagne, tijd en een nette naam", () => {
  const nu = new Date("2026-11-20T14:30:05.123Z");
  assert.deepEqual(editorPad(244347, "Hero Foto (1) Eindhoven.JPEG", nu, "A1b2C3d4"), {
    pad: "playable/editor/244347-20261120-143005-a1b2c3-hero-foto-1-eindhoven.jpg",
    type: "image/jpeg",
  });
  assert.equal(editorPad(1, "Één €.png", nu, "ff").pad, "playable/editor/1-20261120-143005-ff-een.png");
  assert.equal(editorPad(1, ".png", nu, "ff").pad, "playable/editor/1-20261120-143005-ff-bestand.png");
  assert.throws(() => editorPad(1, "pagina.html", nu, "ff"), UploadFout);
  assert.throws(() => editorPad(1, "zonder-extensie", nu, "ff"), UploadFout);
});

test("isAfbeelding en bundlePath", () => {
  assert.equal(isAfbeelding("a.webp"), true);
  assert.equal(isAfbeelding("a.pdf"), false);
  assert.equal(bundlePath(244347), "playable/pages/244347/page.js");
});
