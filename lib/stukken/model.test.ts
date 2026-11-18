import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LIMIETEN,
  StukFout,
  bronnenVan,
  leesBlok,
  nieuweInhoud,
  nieuweVersie,
  pasToe,
  samenvatting,
  vorigeVersie,
  type Stuk,
} from "./model";

const kerngetallen = {
  type: "kerngetallen",
  items: [
    { label: "Omzet", waarde: "€ 374.610" },
    { label: "Artikelen", waarde: 5304, toelichting: "laatste 60 dagen" },
  ],
  bron: "Google Analytics psvfanstore.nl, 19 sep t/m 17 nov 2026",
};

const invoer = {
  soort: "onepager",
  titel: "Coen Dillen campagne",
  ondertitel: " Speciaal tenue ",
  blokken: [
    kerngetallen,
    { type: "conclusie", punten: ["Het lange-mouwshirt verkoopt het best."] },
    { type: "tekst", tekst: "De landingspagina trok **3.832** weergaven." },
  ],
};

function stuk(): Stuk {
  return {
    id: "a".repeat(32),
    eigenaar: "maker@psv.nl",
    ...nieuweInhoud(invoer),
    versie: 1,
    peildatum: "2026-11-18",
    vorige: [],
    createdAt: "2026-11-18T10:00:00.000Z",
    updatedAt: "2026-11-18T10:00:00.000Z",
  };
}

test("blokken: elk type wordt gelezen en schoongemaakt", () => {
  assert.deepEqual(leesBlok({ type: "kop", tekst: " Verkoop " }), { type: "kop", tekst: "Verkoop" });
  const k = leesBlok(kerngetallen);
  assert.ok(k.type === "kerngetallen");
  assert.equal(k.items[1].waarde, "5304"); // getallen worden tekst zoals het model ze aanlevert
  assert.equal(k.items[1].toelichting, "laatste 60 dagen");

  const tabel = leesBlok({ type: "tabel", kolommen: ["Artikel", "Stuks"], rijen: [["Shirt", 2600]], bron: "GA" });
  assert.ok(tabel.type === "tabel");
  assert.deepEqual(tabel.rijen, [["Shirt", "2600"]]);

  const grafiek = leesBlok({
    type: "grafiek",
    titel: "Per dag",
    soort: "lijn",
    labels: ["1 okt", "2 okt"],
    reeksen: [{ naam: "Weergaven", waarden: [120, "80"] }],
    bron: "GA",
  });
  assert.ok(grafiek.type === "grafiek");
  assert.deepEqual(grafiek.reeksen[0].waarden, [120, 80]);
});

test("blokken: duidelijke fouten voor het model", () => {
  assert.throws(() => leesBlok({ type: "video" }), /onbekend type "video"/);
  assert.throws(() => leesBlok({ ...kerngetallen, bron: "" }), /bron ontbreekt/);
  assert.throws(() => leesBlok({ type: "tabel", kolommen: ["a", "b"], rijen: [["1"]], bron: "x" }), /rij 1 moet minstens 2/);
  assert.throws(
    () => leesBlok({ type: "grafiek", titel: "x", soort: "lijn", labels: ["a", "b"], reeksen: [{ naam: "r", waarden: [1] }], bron: "x" }),
    /waarden moet minstens 2/
  );
  assert.throws(
    () => leesBlok({ type: "grafiek", titel: "x", soort: "taart", labels: ["a"], reeksen: [{ naam: "r", waarden: [1] }], bron: "x" }),
    /lijn" of "staaf/
  );
  assert.throws(() => leesBlok({ type: "tekst", tekst: "x".repeat(LIMIETEN.tekst + 1) }), /te lang/);
});

test("nieuw stuk: ids b1, b2, …; een one-pager heeft hooguit 8 blokken", () => {
  const inhoud = nieuweInhoud(invoer);
  assert.deepEqual(inhoud.blokken.map((b) => b.id), ["b1", "b2", "b3"]);
  assert.equal(inhoud.ondertitel, "Speciaal tenue");
  const teVeel = { ...invoer, blokken: Array.from({ length: 9 }, () => ({ type: "kop", tekst: "x" })) };
  assert.throws(() => nieuweInhoud(teVeel), /hooguit 8 blokken/);
  assert.equal(nieuweInhoud({ ...teVeel, soort: "rapport" }).blokken.length, 9);
  assert.throws(() => nieuweInhoud({ ...invoer, soort: "presentatie" }), StukFout);
});

test("bewerken: toevoegen, wijzigen, verwijderen en verplaatsen", () => {
  const s = stuk();
  const na = pasToe(s, {
    acties: [
      { actie: "toevoegen", blok: { type: "kop", tekst: "Samenvatting" }, na: "begin" },
      { actie: "wijzigen", blok_id: "b3", blok: { type: "tekst", tekst: "Korter." } },
      { actie: "verplaatsen", blok_id: "b2", na: "b4" },
      { actie: "verwijderen", blok_id: "b1" },
    ],
    titel: "Coen Dillen",
  });
  assert.equal(na.titel, "Coen Dillen");
  assert.deepEqual(
    na.blokken.map((b) => `${b.id}:${b.type}`),
    // b2 staat direct na b4; b1 is weg.
    ["b4:kop", "b2:conclusie", "b3:tekst"]
  );
  assert.equal((na.blokken[2] as { tekst: string }).tekst, "Korter.");
  // Het oorspronkelijke stuk is niet aangeraakt.
  assert.equal(s.blokken.length, 3);
});

test("bewerken: alles of niets, met de bestaande ids in de melding", () => {
  const s = stuk();
  assert.throws(
    () =>
      pasToe(s, {
        acties: [
          { actie: "verwijderen", blok_id: "b1" },
          { actie: "wijzigen", blok_id: "b9", blok: { type: "kop", tekst: "x" } },
        ],
      }),
    /blok "b9" bestaat niet\. Bestaande blokken: b2, b3/
  );
  assert.equal(s.blokken.length, 3);
  assert.throws(() => pasToe(s, { acties: [{ actie: "verwijderen", blok_id: "b1" }, { actie: "verwijderen", blok_id: "b2" }, { actie: "verwijderen", blok_id: "b3" }] }), /minstens één blok/);
  // Een lege ondertitel haalt hem weg.
  assert.equal(pasToe(s, { ondertitel: "" }).ondertitel, undefined);
});

test("versies: elke wijziging een nieuwe, terug werkt als ongedaan maken", () => {
  const v1 = stuk();
  const v2 = nieuweVersie(v1, pasToe(v1, { titel: "Twee" }), "2026-11-18", "2026-11-18T11:00:00.000Z");
  const v3 = nieuweVersie(v2, pasToe(v2, { titel: "Drie", ondertitel: "" }), "2026-11-19", "2026-11-19T09:00:00.000Z");
  assert.equal(v3.versie, 3);
  assert.equal(v3.ondertitel, undefined);
  assert.deepEqual(v3.vorige.map((v) => v.titel), ["Twee", "Coen Dillen campagne"]);

  const terug1 = vorigeVersie(v3, "2026-11-19T10:00:00.000Z");
  assert.equal(terug1.titel, "Twee");
  assert.equal(terug1.versie, 4); // het nummer loopt door
  assert.equal(terug1.peildatum, "2026-11-18");
  const terug2 = vorigeVersie(terug1, "2026-11-19T10:01:00.000Z");
  assert.equal(terug2.titel, "Coen Dillen campagne");
  assert.equal(terug2.ondertitel, "Speciaal tenue");
  assert.throws(() => vorigeVersie(terug2, ""), /geen vorige versie/);
});

test("de geschiedenis is begrensd", () => {
  let s = stuk();
  for (let i = 0; i < LIMIETEN.vorigeVersies + 5; i++) s = nieuweVersie(s, pasToe(s, { titel: `v${i}` }), "2026-11-18", "");
  assert.equal(s.vorige.length, LIMIETEN.vorigeVersies);
});

test("bronnen en samenvatting", () => {
  const s = stuk();
  assert.deepEqual(bronnenVan(s), ["Google Analytics psvfanstore.nl, 19 sep t/m 17 nov 2026"]);
  const tekst = samenvatting(s);
  assert.match(tekst, /^One-pager "Coen Dillen campagne", versie 1, 3 blokken:/);
  assert.match(tekst, /b1 kerngetallen: Omzet, Artikelen/);
  assert.match(tekst, /b2 conclusie: 1 punten/);
});
