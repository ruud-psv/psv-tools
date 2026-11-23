import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LIMIETEN,
  StukFout,
  bronnenVan,
  leesBlok,
  nieuweInhoud,
  inhoudVan,
  isLegeAfbeelding,
  normaliseer,
  slidesVan,
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

test("nieuw stuk: ids b1, b2, …; rapport of deck, een one-pager wordt een rapport", () => {
  const inhoud = nieuweInhoud(invoer);
  assert.deepEqual(inhoud.blokken.map((b) => b.id), ["b1", "b2", "b3"]);
  assert.equal(inhoud.ondertitel, "Speciaal tenue");
  assert.equal(inhoud.soort, "rapport"); // invoer zegt "onepager"
  assert.equal(nieuweInhoud({ ...invoer, soort: "deck" }).soort, "deck");
  const teVeel = { ...invoer, blokken: Array.from({ length: LIMIETEN.blokken + 1 }, () => ({ type: "kop", tekst: "x" })) };
  assert.throws(() => nieuweInhoud(teVeel), /hooguit 40/);
  assert.throws(() => nieuweInhoud({ ...invoer, soort: "presentatie" }), StukFout);
});

test("opslag van vroeger: een one-pager wordt bij het lezen een rapport, ook in de versies", () => {
  const oud = { ...stuk(), soort: "onepager", vorige: [{ ...stuk(), soort: "onepager", versie: 0 }] };
  const nu = normaliseer(oud);
  assert.equal(nu.soort, "rapport");
  assert.equal(nu.vorige[0].soort, "rapport");
  assert.equal(normaliseer({ soort: "deck" }).soort, "deck");
});

const grafiek = {
  type: "grafiek",
  titel: "Losse verkoop",
  soort: "lijn",
  labels: ["10 dagen", "9 dagen"],
  reeksen: [
    { naam: "Go Ahead Eagles", waarden: [2883, 2887] },
    { naam: "Willem II", waarden: [2699, 2721] },
  ],
  bron: "Ticketing",
};

test("opmaak: alleen huisstijlkeuzes, en nadruk moet in het blok bestaan", () => {
  const g = leesBlok({ ...grafiek, opmaak: { grootte: "groot", achtergrond: "zwart", nadruk: "Go Ahead Eagles", kernboodschap: " Voor op de rest " } });
  assert.deepEqual(g.opmaak, { grootte: "groot", achtergrond: "zwart", nadruk: "Go Ahead Eagles", kernboodschap: "Voor op de rest" });
  assert.equal(leesBlok({ ...grafiek, opmaak: {} }).opmaak, undefined);
  assert.throws(() => leesBlok({ ...grafiek, opmaak: { achtergrond: "blauw" } }), /achtergrond moet "wit", "grijs", "rood", "zwart" zijn/);
  assert.throws(() => leesBlok({ ...grafiek, opmaak: { grootte: "enorm" } }), /grootte/);
  assert.throws(() => leesBlok({ ...grafiek, opmaak: { nadruk: "PSV" } }), /Kies uit: Go Ahead Eagles, Willem II/);
  assert.throws(() => leesBlok({ type: "tekst", tekst: "x", opmaak: { nadruk: "x" } }), /geen nadruk/);
  // Tabel: op de eerste cel van een rij; kerngetallen: op het label.
  assert.equal(leesBlok({ type: "tabel", kolommen: ["Wedstrijd", "Tickets"], rijen: [["PSV - GAE", "2887"]], bron: "x", opmaak: { nadruk: "PSV - GAE" } }).opmaak?.nadruk, "PSV - GAE");
  assert.equal(leesBlok({ ...kerngetallen, opmaak: { nadruk: "Omzet" } }).opmaak?.nadruk, "Omzet");
});

test("opmaken: alleen de vorm verandert; null haalt een veld weg; wijzigen laat de opmaak staan", () => {
  const s = { ...stuk(), ...nieuweInhoud({ soort: "deck", titel: "T", blokken: [grafiek, { type: "tekst", tekst: "x" }] }) };
  const a = pasToe(s, { acties: [{ actie: "opmaken", blok_id: "b1", opmaak: { achtergrond: "rood", nadruk: "Willem II" } }] });
  assert.deepEqual(a.blokken[0].opmaak, { achtergrond: "rood", nadruk: "Willem II" });
  assert.deepEqual((a.blokken[0] as { reeksen: unknown[] }).reeksen, (s.blokken[0] as { reeksen: unknown[] }).reeksen);
  const b = pasToe(a, { acties: [{ actie: "opmaken", blok_id: "b1", opmaak: { achtergrond: null, grootte: "half" } }] });
  assert.deepEqual(b.blokken[0].opmaak, { grootte: "half", nadruk: "Willem II" });
  assert.equal(pasToe(b, { acties: [{ actie: "opmaken", blok_id: "b1", opmaak: { grootte: "", nadruk: null } }] }).blokken[0].opmaak, undefined);
  assert.throws(() => pasToe(a, { acties: [{ actie: "opmaken", blok_id: "b1", opmaak: { nadruk: "Sparta" } }] }), /bestaat niet/);

  // Nieuwe inhoud zonder opmaak: de opmaak blijft, een nadruk die niet meer bestaat valt weg.
  const c = pasToe(a, { acties: [{ actie: "wijzigen", blok_id: "b1", blok: { ...grafiek, reeksen: [{ naam: "Sparta", waarden: [1, 2] }] } }] });
  assert.deepEqual(c.blokken[0].opmaak, { achtergrond: "rood" });
  // Met opmaak in het nieuwe blok telt die.
  const d = pasToe(a, { acties: [{ actie: "wijzigen", blok_id: "b1", blok: { ...grafiek, opmaak: { grootte: "groot" } } }] });
  assert.deepEqual(d.blokken[0].opmaak, { grootte: "groot" });
});

test("slides: een kop wordt een hoofdstukslide, twee halve blokken delen een slide", () => {
  const inhoud = nieuweInhoud({
    soort: "deck",
    titel: "T",
    blokken: [
      kerngetallen,
      { type: "conclusie", punten: ["a"] },
      { type: "kop", tekst: "Verkoop" },
      { ...grafiek, opmaak: { kernboodschap: "Voor op de rest", grootte: "groot" } },
      { type: "tekst", tekst: "x", opmaak: { grootte: "half" } },
      { type: "tekst", tekst: "y", opmaak: { grootte: "half", achtergrond: "zwart" } },
      { type: "tekst", tekst: "z", opmaak: { grootte: "half" } },
      { type: "kop", tekst: "Aanbod" },
      { type: "tabel", titel: "Vakken", kolommen: ["Vak"], rijen: [["UU"]], bron: "x", opmaak: { grootte: "half" } },
    ],
  });
  const slides = slidesVan(inhoud);
  assert.deepEqual(
    slides.filter((s) => s.soort === "inhoud").map((s) => [s.sectie ?? "", s.titel ?? "", s.blokken.map((b) => b.id).join("+"), s.achtergrond, s.groot]),
    [
      ["", "In cijfers", "b1", "wit", false],
      ["", "Conclusie", "b2", "rood", false], // een conclusie is standaard rood
      ["Verkoop", "Voor op de rest", "b4", "wit", true],
      ["Verkoop", "", "b5+b6", "wit", false], // samen: de achtergrond van het eerste blok
      ["Verkoop", "", "b7", "wit", false], // een half blok zonder partner: een eigen slide
      ["Aanbod", "Vakken", "b9", "wit", false], // een kop ertussen breekt het paar
    ]
  );
  assert.deepEqual(
    slides.filter((s) => s.soort === "hoofdstuk").map((s) => [s.titel, s.blokken[0].id, s.achtergrond]),
    [
      ["Verkoop", "b3", "rood"],
      ["Aanbod", "b8", "rood"],
    ]
  );
  assert.deepEqual(slides.map((s) => s.soort[0]).join(""), "iihiiihi");
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
  assert.match(tekst, /^Rapport "Coen Dillen campagne", versie 1, 3 blokken:/);
  assert.match(tekst, /b1 kerngetallen: Omzet, Artikelen/);
  assert.match(tekst, /b2 conclusie: 1 punten/);
});

test("zelf bewerken: dezelfde regels, op de versie die je voor je had", async () => {
  const { handmatigBewerken, StukConflict } = await import("./model");
  const s = { ...stuk(), peildatum: "2026-11-01" };
  const nieuw = handmatigBewerken(
    s,
    { basisVersie: 1, titel: "Eigen titel", acties: [{ actie: "wijzigen", blok_id: "b3", blok: { type: "tekst", tekst: "Zelf geschreven." } }], eigenaar: "iemand@anders.nl" },
    "2026-11-18T13:00:00.000Z"
  );
  assert.equal(nieuw.versie, 2);
  assert.equal(nieuw.titel, "Eigen titel");
  assert.equal(nieuw.eigenaar, "maker@psv.nl"); // alleen titel, ondertitel, soort en acties tellen
  assert.equal(nieuw.peildatum, "2026-11-01"); // de peildatum gaat over het ophalen
  assert.equal(nieuw.vorige[0].titel, "Coen Dillen campagne");

  // De assistent was intussen bezig: geen wijziging eroverheen, wel de nieuwste versie terug.
  assert.throws(
    () => handmatigBewerken(nieuw, { basisVersie: 1, titel: "Te laat" }, ""),
    (err: Error) => err instanceof StukConflict && err.stuk.versie === 2
  );
  assert.throws(() => handmatigBewerken(nieuw, { basisVersie: 2, titel: "" }, ""), /titel ontbreekt/);
  assert.throws(() => handmatigBewerken(nieuw, {}, ""), StukConflict);
});

test("afbeelding: een lege plek met een wens; een url alleen van onze CDN, map stukken", () => {
  const vorige = process.env.BUNNY_CDN_URL;
  process.env.BUNNY_CDN_URL = "https://cdn.psv.example/";
  try {
    assert.deepEqual(leesBlok({ type: "afbeelding", wens: " Vol stadion " }), { type: "afbeelding", wens: "Vol stadion" });
    assert.throws(() => leesBlok({ type: "afbeelding" }), /wens ontbreekt/);
    const goed = "https://cdn.psv.example/stukken/0a1b2c.jpg";
    assert.equal((leesBlok({ type: "afbeelding", wens: "x", url: goed }) as { url?: string }).url, goed);
    for (const fout of [
      "https://elders.example/stukken/a.jpg",
      "https://cdn.psv.example/mail-builder/a.jpg",
      "https://cdn.psv.example/stukken/../geheim.jpg",
      "javascript:alert(1)",
    ]) {
      assert.throws(() => leesBlok({ type: "afbeelding", wens: "x", url: fout }), /alleen een foto die in PSV Tools is geüpload/, fout);
    }
    delete process.env.BUNNY_CDN_URL;
    assert.throws(() => leesBlok({ type: "afbeelding", wens: "x", url: goed }), /niet ingesteld/);
  } finally {
    if (vorige === undefined) delete process.env.BUNNY_CDN_URL;
    else process.env.BUNNY_CDN_URL = vorige;
  }
});

test("titelbeeld: gaat mee in versies en kan weg", () => {
  const s = { ...stuk(), ...nieuweInhoud({ ...invoer, titelbeeld: { wens: "Spelers vieren een doelpunt" } }) };
  assert.deepEqual(s.titelbeeld, { wens: "Spelers vieren een doelpunt" });
  const titelGewijzigd = pasToe(s, { titel: "Nieuw" });
  assert.deepEqual(titelGewijzigd.titelbeeld, s.titelbeeld); // weglaten laat het staan
  const zonder = nieuweVersie(s, pasToe(s, { titelbeeld: null }), "2026-11-19", "");
  assert.equal(zonder.titelbeeld, undefined);
  assert.equal(zonder.vorige[0].titelbeeld?.wens, "Spelers vieren een doelpunt");
  assert.deepEqual(vorigeVersie(zonder, "").titelbeeld, { wens: "Spelers vieren een doelpunt" });
  assert.deepEqual(Object.keys(inhoudVan(s)), ["soort", "titel", "ondertitel", "titelbeeld", "blokken"]);
});

test("slides: bij twee halve blokken telt de kernboodschap van het tweede als het eerste er geen heeft", () => {
  const inhoud = nieuweInhoud({
    soort: "deck",
    titel: "T",
    blokken: [
      { type: "tekst", tekst: "x", opmaak: { grootte: "half" } },
      { ...grafiek, opmaak: { grootte: "half", kernboodschap: "Nog 312 stoelen te koop" } },
    ],
  });
  assert.equal(slidesVan(inhoud)[0].titel, "Nog 312 stoelen te koop");
});

test("slides: een afbeelding krijgt een eigen slide, of deelt er een als half blok", () => {
  const inhoud = nieuweInhoud({
    soort: "deck",
    titel: "T",
    blokken: [
      { type: "afbeelding", wens: "Stadion", opmaak: { kernboodschap: "Uitverkocht" } },
      { ...kerngetallen, opmaak: { grootte: "half" } },
      { type: "afbeelding", wens: "Shirt", opmaak: { grootte: "half" } },
    ],
  });
  const slides = slidesVan(inhoud);
  assert.deepEqual(slides.map((s) => [s.titel ?? "", s.blokken.map((b) => b.id).join("+")]), [["Uitverkocht", "b1"], ["", "b2+b3"]]);
  assert.ok(isLegeAfbeelding(inhoud.blokken[0]));
  assert.ok(!isLegeAfbeelding(inhoud.blokken[1]));
});
