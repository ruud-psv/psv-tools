import { test } from "node:test";
import assert from "node:assert/strict";

import { conceptReactie } from "./reactie";

test("conceptReactie: link, naam en punten, met geëscapete tekst", () => {
  const html = conceptReactie({
    mailingId: 4317,
    naam: "TEST 2026.11.25 PSV Kaartverkoop - KNVB Beker PSV - DMID26-22461",
    nieuw: true,
    voorbeeldUrl: "https://tools.psv.nl/share/mail/abc",
    punten: [
      { soort: "nodig", tekst: "Nog in te vullen: <KORTINGSCODE>." },
      { soort: "let-op", tekst: "Onderwerp is 78 tekens & lang." },
    ],
  });
  assert.ok(html.startsWith("<body>") && html.endsWith("</body>"));
  assert.match(html, /Concept in Maileon gezet/);
  assert.match(html, /Mailing 4317/);
  assert.match(html, /<a href="https:\/\/tools\.psv\.nl\/share\/mail\/abc">/);
  assert.match(html, /<li>Nog in te vullen: &lt;KORTINGSCODE&gt;\.<\/li>/);
  assert.match(html, /<li>Onderwerp is 78 tekens &amp; lang\.<\/li>/);
  // Alleen tags die Asana in een reactie toestaat.
  const tags = new Set([...html.matchAll(/<\/?([a-z]+)/g)].map((m) => m[1]));
  for (const tag of tags) assert.ok(["body", "strong", "code", "a", "ul", "li"].includes(tag), tag);
});

test("conceptReactie: bijgewerkt en zonder punten", () => {
  const html = conceptReactie({ mailingId: 1, naam: "x", nieuw: false, voorbeeldUrl: "https://x", punten: [] });
  assert.match(html, /bijgewerkt/);
  assert.doesNotMatch(html, /Nog nodig|Let op/);
});
