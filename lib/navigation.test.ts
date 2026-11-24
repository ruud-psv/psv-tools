import { test } from "node:test";
import assert from "node:assert/strict";
import { activeHref, ALL_LINKS, NAV_SECTIONS, sectionForPath, sectionsFor } from "@/lib/navigation";

test("elke pagina hangt precies één keer in de navigatie", () => {
  const placed = NAV_SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.links.map((l) => l.href)));
  assert.equal(new Set(placed).size, placed.length, "een pagina staat dubbel");
  for (const href of ALL_LINKS.keys()) assert.ok(placed.includes(href), `${href} staat niet in de navigatie`);
});

test("beta tools krijgen het label Beta", () => {
  assert.equal(ALL_LINKS.get("/dashboard/assistent")?.beta, true);
  assert.equal(ALL_LINKS.get("/dashboard/kennisbank")?.beta, true);
  assert.equal(ALL_LINKS.get("/dashboard/utm-builder")?.beta, false);
});

test("onderdelen zonder toegestane pagina's vallen weg", () => {
  const sections = sectionsFor(["/dashboard/fanstore"]);
  assert.deepEqual(sections.map((s) => s.id), ["merchandise"]);
});

test("het onderdeel volgt het pad, ook op subpagina's", () => {
  const sections = sectionsFor([...ALL_LINKS.keys()]);
  assert.equal(sectionForPath(sections, "/dashboard/ticketing-stadion/123")?.id, "ticketing");
  assert.equal(sectionForPath(sections, "/dashboard/kennisbank/documentatie")?.id, "assistent");
  assert.equal(sectionForPath(sections, "/dashboard"), null);
});

test("instroom en wachtlijst staan onder Ticketing, met het recht van Ticketing Stadion", () => {
  const sections = sectionsFor(["/dashboard/ticketing-stadion"]);
  const hrefs = sections[0].groups.flatMap((g) => g.links.map((l) => l.href));
  assert.ok(hrefs.includes("/dashboard/ticketing-stadion/instroom"));
  assert.ok(hrefs.includes("/dashboard/wachtlijst"));
  assert.equal(sectionsFor(["/dashboard/fanstore"]).some((s) => s.id === "ticketing"), false);
  assert.equal(sectionForPath(sections, "/dashboard/wachtlijst")?.id, "ticketing");
});

test("alleen de meest specifieke link licht op", () => {
  const sections = sectionsFor([...ALL_LINKS.keys()]);
  assert.equal(activeHref(sections, "/dashboard/ticketing-stadion/instroom"), "/dashboard/ticketing-stadion/instroom");
  assert.equal(activeHref(sections, "/dashboard/ticketing-stadion/123"), "/dashboard/ticketing-stadion");
});

test("mijn documenten staat onder Assistent, met het recht van de assistent", () => {
  const sections = sectionsFor(["/dashboard/assistent"]);
  const hrefs = sections[0].groups.flatMap((g) => g.links.map((l) => l.href));
  assert.deepEqual(hrefs, ["/dashboard/assistent", "/dashboard/assistent/documenten"]);
  assert.equal(activeHref(sections, "/dashboard/assistent/documenten"), "/dashboard/assistent/documenten");
  assert.equal(activeHref(sections, "/dashboard/assistent"), "/dashboard/assistent");
  assert.equal(sectionsFor(["/dashboard/fanstore"]).some((s) => s.id === "assistent"), false);
});
