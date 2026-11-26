import { test } from "node:test";
import assert from "node:assert/strict";
import { activeStand, engagedStand, maakOverzicht, maandWaarden, tabelPunten, activePunten } from "./bereken";
import { DOELEN, doelenVoor, niveauVan } from "./doelen";
import { HANDMATIG, type Handmatig } from "./handmatig";
import { amsterdamDag, amsterdamMiddernacht, laatsteDag, maandenTussen } from "./tijd";
import { legeHistorie, type DagStand } from "./types";

const SEIZOEN = DOELEN[0];

function dag(datum: string, engaged: Partial<DagStand["engaged"]>, active: Partial<DagStand["active"]> = {}): DagStand {
  return {
    datum,
    engaged: { maand: datum.slice(0, 7), maileon: 0, mijnpsv: null, overlap: null, totaal: null, ...engaged },
    active: { maileon: 0, mijnpsv: null, overlap: null, totaal: null, ...active },
  };
}

test("een dag en middernacht lopen in Nederlandse tijd, ook rond de zomertijd", () => {
  assert.equal(amsterdamDag(Date.parse("2026-10-31T23:30:00Z")), "2026-11-01");
  assert.equal(amsterdamDag(Date.parse("2026-07-31T22:30:00Z")), "2026-08-01");
  assert.equal(new Date(amsterdamMiddernacht("2026-11-01")).toISOString(), "2026-10-31T23:00:00.000Z");
  assert.equal(new Date(amsterdamMiddernacht("2026-07-01")).toISOString(), "2026-06-30T22:00:00.000Z");
  // De nacht van de wintertijd: 25 oktober begint nog in zomertijd.
  assert.equal(new Date(amsterdamMiddernacht("2026-10-25")).toISOString(), "2026-10-24T22:00:00.000Z");
  assert.equal(new Date(amsterdamMiddernacht("2026-10-26")).toISOString(), "2026-10-25T23:00:00.000Z");
});

test("maanden en laatste dagen", () => {
  assert.deepEqual(maandenTussen("2026-11-15", "2027-02-01"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
  assert.equal(laatsteDag("2027-02"), "2027-02-28");
  assert.equal(laatsteDag("2026-11"), "2026-11-30");
});

test("niveaus: de hoogste gehaalde ondergrens, ook tussen twee grenzen in", () => {
  assert.equal(niveauVan(SEIZOEN.engaged, 42_749.5), 1);
  assert.equal(niveauVan(SEIZOEN.engaged, 44_549), 2);
  assert.equal(niveauVan(SEIZOEN.engaged, 44_550), 3);
  assert.equal(niveauVan(SEIZOEN.engaged, 47_346.25), 5);
  assert.equal(niveauVan(SEIZOEN.active, 104_494), 1);
  assert.equal(niveauVan(SEIZOEN.active, 141_750), 5);
  assert.equal(doelenVoor("2026-11-26")?.seizoen, "2026-27");
  assert.equal(doelenVoor("2027-07-01"), null);
});

test("handmatige maanden: gemiddelde alleen over volle maanden, de lopende apart", () => {
  const maanden = maandWaarden(SEIZOEN, HANDMATIG, [], "2026-11-26");
  assert.deepEqual(maanden.map((m) => [m.maand, m.status]), [
    ["2026-07", "volledig"],
    ["2026-08", "volledig"],
    ["2026-09", "volledig"],
    ["2026-10", "volledig"],
    ["2026-11", "lopend"],
  ]);
  const stand = engagedStand(SEIZOEN, maanden)!;
  assert.equal(Math.round(stand.gemiddelde), 47_346);
  assert.equal(stand.maanden, 4);
  assert.equal(stand.niveau, 5);
  assert.equal(stand.boven, 96);
  assert.equal(stand.volgende, null);
  assert.equal(Math.round(stand.inclLopend!.gemiddelde), 46_260);
  assert.equal(stand.inclLopend!.niveau, 4);
  assert.equal(stand.inclLopend!.tm, "2026-11-25");
});

test("een voorbije maand met een handmatige tussenstand telt niet mee", () => {
  const maanden = maandWaarden(SEIZOEN, HANDMATIG, [], "2026-12-03");
  const nov = maanden.find((m) => m.maand === "2026-11")!;
  assert.equal(nov.status, "onvolledig");
  assert.equal(engagedStand(SEIZOEN, maanden)!.inclLopend, null);
});

test("een automatische maand met beide bronnen gaat voor de handmatige, en is pas na de laatste dag volledig", () => {
  const dagen = [
    dag("2026-11-27", { maileon: 20_000, mijnpsv: 30_000, overlap: 5_000, totaal: 45_000 }),
    dag("2026-11-30", { maileon: 22_000, mijnpsv: 33_000, overlap: 6_000, totaal: 49_000 }),
  ];
  const lopend = maandWaarden(SEIZOEN, HANDMATIG, dagen.slice(0, 1), "2026-11-27").at(-1)!;
  assert.deepEqual([lopend.bron, lopend.status, lopend.totaal], ["automatisch", "lopend", 45_000]);

  const dec = maandWaarden(SEIZOEN, HANDMATIG, dagen, "2026-12-01");
  const nov = dec.find((m) => m.maand === "2026-11")!;
  assert.deepEqual([nov.bron, nov.status, nov.totaal, nov.tm], ["automatisch", "volledig", 49_000, null]);
});

test("zonder MijnPSV blijft de handmatige maand staan; zonder iets anders alleen Maileon", () => {
  const leeg: Handmatig = { engaged: [], active: [] };
  const dagen = [dag("2026-12-10", { maileon: 18_000 })];
  const [dec] = maandWaarden(SEIZOEN, leeg, dagen, "2026-12-10").filter((m) => m.maand === "2026-12");
  assert.deepEqual([dec.totaal, dec.maileon, dec.status], [null, 18_000, "lopend"]);

  const nov = maandWaarden(SEIZOEN, HANDMATIG, [dag("2026-11-27", { maileon: 20_000 })], "2026-11-27").at(-1)!;
  assert.deepEqual([nov.bron, nov.totaal], ["handmatig", 41_914]);
});

test("Active Fans: tempo over vier weken, prognose en wat er per dag nodig is", () => {
  const punten = activePunten(HANDMATIG, []);
  const stand = activeStand(SEIZOEN, punten)!;
  assert.equal(stand.laatste.totaal, 104_494);
  assert.equal(stand.niveau, 1);
  assert.deepEqual([stand.tempo!.van, stand.tempo!.dagen, stand.tempo!.groei], ["2026-10-13", 44, 8_879]);
  assert.equal(Math.round(stand.tempo!.perDag), 202);
  assert.equal(stand.dagenResterend, 216);
  assert.equal(stand.prognose, 148_100);
  assert.equal(stand.niveauPrognose, 5);
  assert.deepEqual(stand.nodig, [
    { niveau: 3, aantal: 29_156, perDag: 135 },
    { niveau: 5, aantal: 37_256, perDag: 173 },
  ]);
});

test("automatische dagstanden vullen de reeks aan; de tabel houdt per maand de laatste", () => {
  const dagen = [
    dag("2026-11-27", {}, { maileon: 74_000, mijnpsv: 65_000, overlap: 34_200, totaal: 104_800 }),
    dag("2026-11-28", {}, { maileon: 74_100, mijnpsv: 65_200, overlap: 34_250, totaal: 105_050 }),
    dag("2026-12-01", {}, { maileon: 74_500 }),
  ];
  const punten = activePunten(HANDMATIG, dagen);
  assert.deepEqual(punten.map((p) => p.datum), ["2026-09-15", "2026-10-13", "2026-11-26", "2026-11-27", "2026-11-28"]);
  assert.deepEqual(tabelPunten(punten).map((p) => p.datum), ["2026-09-15", "2026-10-13", "2026-11-26", "2026-11-28"]);
});

test("het overzicht neemt de peildatum en de automatische status mee", () => {
  const historie = { ...legeHistorie("2026-27"), bijgewerkt: "2026-11-26T21:35:00.000Z", maileon: { tot: "2026-11-25", endpoint: null } };
  const o = maakOverzicht({ seizoen: SEIZOEN, handmatig: HANDMATIG, historie, vandaag: "2026-11-26", mijnpsvGekoppeld: false });
  assert.equal(o.peildatum, "2026-11-26");
  assert.equal(o.automatisch.maileonTot, "2026-11-25");
  assert.equal(o.automatisch.mijnpsvGekoppeld, false);
  assert.equal(o.tabel.length, 3);
});
