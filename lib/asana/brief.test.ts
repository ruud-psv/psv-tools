import { test } from "node:test";
import assert from "node:assert/strict";

import { briefNaarMail, copyNaarBlokken, dmidVan, leesBrief, maakMailnaam, onderwerpUitTaaknaam } from "./brief";
import { KNVB_VITESSE, REAL_MADRID, WINTERITEMS } from "./brief.fixtures";

const VANDAAG = "2026-11-20";

/* ---------- Velden ---------- */

test("leesBrief: Real Madrid", () => {
  const v = leesBrief(REAL_MADRID.notes);
  assert.equal(v.gevonden, true);
  assert.equal(v.doelgroep, "Alle meereizende supporters Real Madrid");
  assert.equal(v.optIn, "");
  assert.equal(v.ctaLink, "https://www.psv.nl/ticketinfo/persoonsgegevens-real-madrid");
  assert.deepEqual(v.dynamisch, { keuze: "onbekend", velden: ["Relatienummer", "Voornaam", "Tusenvoegsel", "Achternaam", "geboortedatum"] });
  assert.equal(v.onderwerp, "🎟️ Belangrijke ticketinformatie Real Madrid - PSV");
  assert.equal(v.snippet, "Lees deze informatie goed door");
  assert.equal(v.footer, "Je ontvangt deze e-mail omdat je een ticket hebt gekocht voor Real Madrid - PSV");
  assert.match(v.header, /get_asset/);
  assert.ok(v.copy.startsWith(" Hi (voornaam),"));
  assert.ok(v.copy.endsWith("PSV Kaartverkoop"));
});

test("leesBrief: KNVB, met link zonder https en een separator na de snippet", () => {
  const v = leesBrief(KNVB_VITESSE.notes);
  assert.equal(v.optIn, "PSV1");
  assert.equal(v.ctaLink, "www.psv.nl/groepsactie-vitesse");
  assert.equal(v.snippet, "Scoor tickets met de speciale actiecode voor jouw vereniging!");
  assert.deepEqual(v.dynamisch, { keuze: "onbekend", velden: [] });
  assert.match(v.doelgroep, /sharepoint/);
});

test("leesBrief: stopt bij de creative brief (die heeft ook een kopje Copy)", () => {
  const v = leesBrief(WINTERITEMS.notes);
  assert.equal(v.copy, "");
  assert.equal(v.onderwerp, "");
  assert.match(v.footer, /\{NAAM OPT-IN\}/);
});

test("leesBrief: zonder content brief", () => {
  assert.equal(leesBrief("Gewoon een taak").gevonden, false);
});

/* ---------- Copy naar blokken ---------- */

test("copyNaarBlokken: Real Madrid", () => {
  const c = copyNaarBlokken(leesBrief(REAL_MADRID.notes).copy);
  assert.equal(c.aanhef, "Hi {VOORNAAM}");
  assert.equal(c.blocks.length, 5);

  const [een, twee, drie, vier, vijf] = c.blocks;
  assert.match(een.content, /^In aanloop naar Real Madrid/);
  assert.match(een.content, /<b>Relatienummer:<\/b> \[\[% contact 'MEMBERNUMBERPRIOR' ''\]\]/);
  assert.match(een.content, /<b>Tussenvoegsel:<\/b> \[onbekend veld\]/);
  assert.match(een.content, /We verzoeken je de gegevens te controleren/);
  assert.equal(een.heeftCta, true);
  assert.equal(een.ctaLabel, "GEGEVENS CONTROLEREN EN BEVESTIGEN");
  assert.equal(een.ctaUrl, "https://www.psv.nl/ticketinfo/persoonsgegevens-real-madrid");
  assert.equal(een.blockBg, "wit");

  assert.match(twee.content, /^Zorg ervoor/);
  assert.equal(twee.titel, undefined);

  assert.equal(drie.titel, "Ontvangst van je ticket");
  assert.equal(drie.blockBg, "grijs");
  assert.match(drie.content, /spamfolder terechtkomt\.<br>Het ticket wordt/);

  assert.equal(vier.titel, "Ondersteuning bij het stadion");
  assert.equal(vier.blockBg, "wit");

  assert.equal(vijf.titel, "Overige belangrijke informatie");
  assert.equal(vijf.blockBg, "grijs");
  assert.equal((vijf.content.match(/• /g) ?? []).length, 3);

  assert.equal(c.afsluiting, "Met vriendelijke groet,<br><br>PSV Kaartverkoop");
  assert.deepEqual(c.onbekendeVelden, ["Tussenvoegsel"]);
  assert.deepEqual(c.teControlerenVelden, ["geboortedatum"]);
});

test("copyNaarBlokken: KNVB, knop zonder 'Button:' en placeholders geëscapet", () => {
  const c = copyNaarBlokken(leesBrief(KNVB_VITESSE.notes).copy);
  assert.equal(c.aanhef, "Hi");
  assert.equal(c.blocks.length, 3);
  const [een, twee, drie] = c.blocks;
  assert.equal(een.ctaLabel, "BESTEL TICKETS!");
  assert.equal(een.ctaUrl, "www.psv.nl/groepsactie-vitesse");
  assert.match(een.content, /&lt;KORTINGSCODE&gt;/);
  assert.equal((een.content.match(/<br><br>/g) ?? []).length, 2);
  assert.equal(twee.ctaLabel, "ALLE INFORMATIE");
  assert.match(twee.content, /^Belangrijk!/);
  assert.match(twee.content, /&lt;kortingscode&gt;/);
  assert.equal(drie.content, "Hopelijk tot ziens bij PSV - Vitesse!");
  assert.equal(drie.heeftCta, false);
  assert.equal(c.afsluiting, undefined);
});

/* ---------- Naam en DMID ---------- */

test("onderwerpUitTaaknaam haalt TEST, exploitatie en E-mail weg", () => {
  assert.equal(onderwerpUitTaaknaam(REAL_MADRID.naam), "Real Madrid-PSV Bezoekersinfo ticketing");
  assert.equal(onderwerpUitTaaknaam(KNVB_VITESSE.naam), "KNVB Beker PSV-Vitesse Verenigingen al eerder gebruikt");
  assert.equal(onderwerpUitTaaknaam("MKT | Winteritems | E-mail"), "Winteritems");
});

test("maakMailnaam: conventie, TEST ervoor, ingekort tot 64 op een woordgrens", () => {
  const naam = maakMailnaam({ dueOn: "2026-11-27", exploitatie: "PSV Kaartverkoop", taaknaam: REAL_MADRID.naam, dmid: "DMID26-22619", test: true });
  assert.equal(naam, "TEST 2026.11.27 PSV Kaartverkoop - Real Madrid - DMID26-22619");
  assert.ok(naam.length <= 64);
  const kort = maakMailnaam({ dueOn: "2026-11-27", exploitatie: "PSV Kaartverkoop", taaknaam: "TICKETING | Wachtlijst SCC", dmid: "DMID26-1", test: false });
  assert.equal(kort, "2026.11.27 PSV Kaartverkoop - Wachtlijst SCC - DMID26-1");
});

test("dmidVan: custom field gaat voor de tekst", () => {
  assert.equal(dmidVan({ naam: "", notes: REAL_MADRID.notes }), "DMID26-22619");
  assert.equal(dmidVan({ naam: "", notes: "DMID26-1", velden: { DMID26: "DMID26-22619" } }), "DMID26-22619");
  assert.equal(dmidVan({ naam: "", notes: "niets" }), undefined);
});

/* ---------- Alles samen ---------- */

function soorten(punten: { soort: string; tekst: string }[], soort: string): string[] {
  return punten.filter((p) => p.soort === soort).map((p) => p.tekst);
}

test("briefNaarMail: Real Madrid geeft een opzet, één ding nodig (tussenvoegsel)", () => {
  const u = briefNaarMail(REAL_MADRID, { test: true, vandaag: VANDAAG });
  assert.ok(u.opzet);
  assert.equal(u.opzet.template, "kaartverkoop");
  assert.equal(u.opzet.dmid, "DMID26-22619");
  assert.equal(u.opzet.utmCampaign, "dmid26-22619");
  assert.equal(u.opzet.heroLink, "https://www.psv.nl/ticketinfo/persoonsgegevens-real-madrid");
  assert.equal(u.opzet.preheaderTekst, "Lees deze informatie goed door");
  assert.equal(u.opzet.heroAlt, "Belangrijke ticketinformatie Real Madrid - PSV");
  assert.equal(u.opzet.disclaimerTekst, "Je ontvangt deze e-mail omdat je een ticket hebt gekocht voor Real Madrid - PSV");
  assert.equal(u.opzet.heeftAfsluitRegel, true);
  assert.equal(u.onderwerp, "🎟️ Belangrijke ticketinformatie Real Madrid - PSV");

  const nodig = soorten(u.punten, "nodig");
  assert.equal(nodig.length, 1);
  assert.match(nodig[0], /Tussenvoegsel/);
  const letOp = soorten(u.punten, "let-op").join("\n");
  assert.match(letOp, /Opt-in is leeg/);
  assert.match(letOp, /Ja \/ Nee/);
  assert.match(letOp, /header/);
  assert.match(letOp, /geboortedatum/);
});

test("briefNaarMail: KNVB heeft de kortingscode nodig en waarschuwt voor SharePoint en de lengte", () => {
  const u = briefNaarMail(KNVB_VITESSE, { test: true, vandaag: VANDAAG });
  assert.ok(u.opzet);
  const nodig = soorten(u.punten, "nodig").join("\n");
  assert.match(nodig, /<KORTINGSCODE>, <kortingscode>/);
  const letOp = soorten(u.punten, "let-op").join("\n");
  assert.match(letOp, /SharePoint/);
  assert.match(letOp, /78 tekens/);
});

test("briefNaarMail: Winteritems (Merch, lege brief) geeft geen opzet", () => {
  const u = briefNaarMail(WINTERITEMS, { test: true, vandaag: VANDAAG });
  assert.equal(u.opzet, null);
  const nodig = soorten(u.punten, "nodig").join("\n");
  assert.match(nodig, /Alleen Ticketing/);
  assert.match(nodig, /Onderwerp ontbreekt/);
  assert.match(nodig, /Copy ontbreekt/);
  assert.match(nodig, /NAAM OPT-IN/);
});

test("briefNaarMail: verzenddatum in het verleden", () => {
  const u = briefNaarMail({ ...REAL_MADRID, dueOn: "2026-11-18" }, { test: true, vandaag: VANDAAG });
  assert.match(soorten(u.punten, "let-op").join("\n"), /in het verleden/);
});
