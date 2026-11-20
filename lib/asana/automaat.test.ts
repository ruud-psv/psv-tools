import { test } from "node:test";
import assert from "node:assert/strict";

import { ConceptFout, type SchoneInvoer } from "@/lib/maileon/concept";
import { MaileonFout } from "@/lib/maileon/rapport";

import { draaiRonde, type AutomaatDeps } from "./automaat";
import type { TaakStatus } from "./automaat-opslag";
import { KNVB_VITESSE, REAL_MADRID } from "./brief.fixtures";
import { TESTPROJECT, type AsanaApi, type AsanaTaak } from "./client";
import { mailUitOpzet } from "./mail";

const SECTIES = [
  { gid: "s-nieuw", naam: "Nieuwe aanvraag" },
  { gid: "s-wachten", naam: "Wachten op input" },
  { gid: "s-productie", naam: "Productie" },
  { gid: "s-feedback", naam: "Feedback" },
];

function taak(gid: string, bron: { naam: string; notes: string; dueOn: string }): AsanaTaak {
  return { gid, naam: bron.naam, notes: bron.notes, dueOn: bron.dueOn, projecten: [TESTPROJECT], velden: {} };
}

/** Een nagebootst testproject: taken per sectie, reacties en verplaatsingen. */
function opzet(begin: { taak: AsanaTaak; sectie: string }[]) {
  const taken = new Map(begin.map((t) => [t.taak.gid, { ...t }]));
  const reacties: { gid: string; html: string }[] = [];
  const asana: AsanaApi = {
    async takenInProject() {
      return [];
    },
    async takenInSectie(sectie) {
      return [...taken.values()].filter((t) => t.sectie === sectie).map((t) => t.taak);
    },
    async taak(gid) {
      return taken.get(gid)!.taak;
    },
    async bijlagen() {
      return [];
    },
    async plaatsReactie(gid, html) {
      reacties.push({ gid, html });
    },
    async secties() {
      return SECTIES;
    },
    async naarSectie(sectie, gid) {
      taken.get(gid)!.sectie = sectie;
    },
  };
  const opgeslagen = new Map<string, TaakStatus>();
  const concepten: SchoneInvoer[] = [];
  let conceptFout: unknown = null;
  const deps: AutomaatDeps = {
    asana,
    status: {
      async get(gid) {
        return opgeslagen.get(gid) ?? null;
      },
      async save(s) {
        opgeslagen.set(s.gid, s);
      },
    },
    maakMail: (o) => {
      const mail = mailUitOpzet(o);
      return { html: mail.html, problemen: mail.problemen };
    },
    async maakConcept(invoer) {
      if (conceptFout) throw conceptFout;
      concepten.push(invoer);
      return { mailingId: 4300 + concepten.length, nieuw: concepten.length === 1, naam: invoer.naam, voorbeeldUrl: "https://tools.psv.nl/share/mail/abc" };
    },
    nu: () => "2026-11-20T12:00:00.000Z",
  };
  return {
    deps,
    taken,
    reacties,
    opgeslagen,
    concepten,
    sectieVan: (gid: string) => taken.get(gid)!.sectie,
    zetConceptFout: (err: unknown) => {
      conceptFout = err;
    },
    wijzigBrief: (gid: string, notes: string) => {
      const t = taken.get(gid)!;
      t.taak = { ...t.taak, notes };
    },
    zetIn: (gid: string, sectie: string) => {
      taken.get(gid)!.sectie = sectie;
    },
  };
}

const ZONDER_TUSSENVOEGSEL = REAL_MADRID.notes.replace("Voornaam, Tussenvoegsel, Achternaam", "Voornaam, Achternaam");

test("automaat: Real Madrid van Nieuwe aanvraag via Wachten op input naar een concept in Feedback", async () => {
  const t = opzet([{ taak: taak("1", REAL_MADRID), sectie: "s-nieuw" }]);

  // Ronde 1: het dynamische veld Tussenvoegsel kent Maileon niet → wachten.
  let verslag = await draaiRonde(t.deps);
  assert.deepEqual(verslag.verwerkt.map((v) => v.actie), ["wachten"]);
  assert.equal(t.sectieVan("1"), "s-wachten");
  assert.equal(t.reacties.length, 1);
  assert.match(t.reacties[0].html, /Nog niet klaar voor Maileon/);
  assert.match(t.reacties[0].html, /Tussenvoegsel/);
  assert.equal(t.concepten.length, 0);

  // Ronde 2: niets veranderd → geen nieuwe reactie.
  verslag = await draaiRonde(t.deps);
  assert.equal(verslag.verwerkt.length, 0);
  assert.equal(t.reacties.length, 1);

  // De aanvrager haalt Tussenvoegsel weg → concept, reactie met link, naar Feedback.
  t.wijzigBrief("1", ZONDER_TUSSENVOEGSEL);
  verslag = await draaiRonde(t.deps);
  assert.deepEqual(verslag.verwerkt.map((v) => v.actie), ["concept"]);
  assert.equal(t.sectieVan("1"), "s-feedback");
  assert.equal(t.concepten.length, 1);
  const invoer = t.concepten[0];
  assert.equal(invoer.naam, "TEST 2026.11.27 PSV Kaartverkoop - Real Madrid - DMID26-22619");
  assert.equal(invoer.dmid, "DMID26-22619");
  assert.equal(invoer.onderwerp, "🎟️ Belangrijke ticketinformatie Real Madrid - PSV");
  assert.equal(invoer.previewTekst, "Lees deze informatie goed door");
  assert.match(invoer.html, /GEGEVENS CONTROLEREN EN BEVESTIGEN/);
  assert.doesNotMatch(invoer.html, /Tussenvoegsel/);
  assert.equal(t.reacties.length, 2);
  assert.match(t.reacties[1].html, /Concept in Maileon gezet/);
  assert.match(t.reacties[1].html, /https:\/\/tools\.psv\.nl\/share\/mail\/abc/);
  assert.equal(t.opgeslagen.get("1")?.status, "concept");
  assert.equal(t.opgeslagen.get("1")?.mailingId, 4301);
});

test("automaat: brief aangepast in Feedback → hetzelfde concept bijwerken", async () => {
  const t = opzet([{ taak: taak("1", { ...REAL_MADRID, notes: ZONDER_TUSSENVOEGSEL }), sectie: "s-nieuw" }]);
  await draaiRonde(t.deps);
  assert.equal(t.sectieVan("1"), "s-feedback");

  t.wijzigBrief("1", ZONDER_TUSSENVOEGSEL.replace("vanuit PSV-medewerkers", "vanuit PSV medewerkers"));
  const verslag = await draaiRonde(t.deps);
  assert.deepEqual(verslag.verwerkt.map((v) => v.actie), ["concept"]);
  assert.equal(t.concepten.length, 2);
  assert.match(t.concepten[1].html, /vanuit PSV medewerkers/);
  assert.equal(t.sectieVan("1"), "s-feedback");
});

test("automaat: taken buiten Nieuwe aanvraag die hij niet kent, blijven onaangeroerd", async () => {
  const t = opzet([
    { taak: taak("1", REAL_MADRID), sectie: "s-feedback" },
    { taak: taak("2", KNVB_VITESSE), sectie: "s-wachten" },
  ]);
  const verslag = await draaiRonde(t.deps);
  assert.equal(verslag.bekeken, 2);
  assert.equal(verslag.verwerkt.length, 0);
  assert.equal(t.reacties.length, 0);
});

test("automaat: zonder wijziging teruggezet in Nieuwe aanvraag → terug, zonder reactie", async () => {
  const t = opzet([{ taak: taak("1", { ...REAL_MADRID, notes: ZONDER_TUSSENVOEGSEL }), sectie: "s-nieuw" }]);
  await draaiRonde(t.deps);
  t.zetIn("1", "s-nieuw");
  const verslag = await draaiRonde(t.deps);
  assert.deepEqual(verslag.verwerkt.map((v) => v.actie), ["teruggezet"]);
  assert.equal(t.sectieVan("1"), "s-feedback");
  assert.equal(t.reacties.length, 1);
  assert.equal(t.concepten.length, 1);
});

test("automaat: KNVB wacht op de kortingscode", async () => {
  const t = opzet([{ taak: taak("2", KNVB_VITESSE), sectie: "s-nieuw" }]);
  await draaiRonde(t.deps);
  assert.equal(t.sectieVan("2"), "s-wachten");
  assert.match(t.reacties[0].html, /&lt;KORTINGSCODE&gt;/);
});

test("automaat: Maileon weigert → één reactie met de reden, niet opnieuw zonder wijziging", async () => {
  const t = opzet([{ taak: taak("1", { ...REAL_MADRID, notes: ZONDER_TUSSENVOEGSEL }), sectie: "s-nieuw" }]);
  t.zetConceptFout(new ConceptFout("Mailing 12 is in Maileon aangepast.", 409, "aangepast"));
  let verslag = await draaiRonde(t.deps);
  assert.deepEqual(verslag.verwerkt.map((v) => v.actie), ["fout"]);
  assert.match(t.reacties[0].html, /Concept niet gezet/);
  assert.equal(t.opgeslagen.get("1")?.status, "fout");
  verslag = await draaiRonde(t.deps);
  assert.equal(verslag.verwerkt.length, 0);
  assert.equal(t.reacties.length, 1);
});

test("automaat: storing bij Maileon → geen reactie, volgende ronde opnieuw", async () => {
  const t = opzet([{ taak: taak("1", { ...REAL_MADRID, notes: ZONDER_TUSSENVOEGSEL }), sectie: "s-nieuw" }]);
  t.zetConceptFout(new MaileonFout("Service Unavailable", 503));
  let verslag = await draaiRonde(t.deps);
  assert.deepEqual(verslag.verwerkt.map((v) => v.actie), ["storing"]);
  assert.equal(t.reacties.length, 0);
  assert.equal(t.opgeslagen.size, 0);
  t.zetConceptFout(null);
  verslag = await draaiRonde(t.deps);
  assert.deepEqual(verslag.verwerkt.map((v) => v.actie), ["concept"]);
});

test("automaat: hooguit `max` taken per ronde", async () => {
  const t = opzet([
    { taak: taak("1", KNVB_VITESSE), sectie: "s-nieuw" },
    { taak: taak("2", KNVB_VITESSE), sectie: "s-nieuw" },
    { taak: taak("3", KNVB_VITESSE), sectie: "s-nieuw" },
  ]);
  const verslag = await draaiRonde({ ...t.deps, max: 2 });
  assert.equal(verslag.verwerkt.length, 2);
  assert.equal(t.sectieVan("3"), "s-nieuw");
});
