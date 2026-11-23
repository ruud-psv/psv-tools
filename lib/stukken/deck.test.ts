import { test } from "node:test";
import assert from "node:assert/strict";

import { leesSlide, naarBlokken, vanBlokken, wachtOpFoto, wijzigSlide, type DeckSlide } from "./deck";
import { bronnenVan, handmatigBewerken, nieuweInhoud, normaliseer, pasToe, samenvatting, type Stuk } from "./model";

const grafiek = {
  titel: "Losse verkoop",
  soort: "lijn",
  labels: ["10 dagen", "9 dagen"],
  reeksen: [
    { naam: "Go Ahead Eagles", waarden: [2883, 2887] },
    { naam: "Willem II", waarden: [2699, 2721] },
  ],
  bron: "Ticketing, stand 19 november 2026",
};

const slides = [
  { layout: "welkom", titel: "Ticketverkoop PSV - Go Ahead Eagles" },
  { layout: "hoofdstuk", titel: "Verkoop" },
  { layout: "grafiek", titel: "Voor op de rest", tekst: "- 2.887 losse tickets", grafiek, nadruk: "Go Ahead Eagles" },
  { layout: "beeld", titel: "Bijna uitverkocht", tekst: "Nog 312 stoelen", foto: { wens: "Vol Philips Stadion" }, fotoBreedte: 3 },
  { layout: "quote", quote: "Wat een sfeer", naam: "Supporter" },
  { layout: "afsluiting" },
];

function deck(): Stuk {
  return {
    id: "a".repeat(32),
    eigenaar: "maker@psv.nl",
    ...nieuweInhoud({ soort: "deck", titel: "Ticketverkoop", slides }),
    versie: 1,
    peildatum: "2026-11-19",
    vorige: [],
    createdAt: "",
    updatedAt: "",
  };
}

test("slides: layouts uit het template, ids s1, s2, …; data verplicht waar de layout erom vraagt", () => {
  const d = deck();
  assert.deepEqual(d.slides!.map((s) => `${s.id}:${s.layout}`), ["s1:welkom", "s2:hoofdstuk", "s3:grafiek", "s4:beeld", "s5:quote", "s6:afsluiting"]);
  assert.equal(d.blokken.length, 0);
  assert.equal(d.slides![2].grafiek?.reeksen.length, 2);
  assert.throws(() => leesSlide({ layout: "powerpoint" }, "s1"), /onbekende layout/);
  assert.throws(() => leesSlide({ layout: "grafiek", titel: "x" }, "s1"), /heeft grafiek nodig/);
  assert.throws(() => leesSlide({ layout: "quote" }, "s1"), /heeft quote nodig/);
  assert.throws(() => leesSlide({ layout: "beeld", fotoBreedte: 7 }, "s1"), /1 t\/m 5/);
  assert.throws(() => leesSlide({ layout: "grafiek", grafiek, nadruk: "Ajax" }, "s1"), /Kies uit: Go Ahead Eagles, Willem II/);
  process.env.BUNNY_CDN_URL = "https://cdn.psv.example";
  try {
    assert.throws(() => leesSlide({ layout: "beeld", foto: { url: "https://elders.example/a.jpg" } }, "s1"), /geüpload/);
    assert.equal(leesSlide({ layout: "beeld", foto: { url: "https://cdn.psv.example/stukken/a.jpg" } }, "s1").foto?.url, "https://cdn.psv.example/stukken/a.jpg");
  } finally {
    delete process.env.BUNNY_CDN_URL;
  }
});

test("slides bewerken: toevoegen (vóór de afsluiting), wijzigen (samenvoegen), verplaatsen, verwijderen", () => {
  const d = deck();
  const na = pasToe(d, {
    acties: [
      { actie: "slide_toevoegen", slide: { layout: "tekst", titel: "Wat we nog doen", tekst: "- E-mail" } },
      { actie: "slide_wijzigen", slide_id: "s4", slide: { titel: "Uitverkocht", foto: { url: null }, fotoBreedte: 5 } },
      { actie: "slide_verplaatsen", slide_id: "s5", na: "begin" },
      { actie: "slide_verwijderen", slide_id: "s2" },
    ],
  });
  assert.deepEqual(na.slides!.map((s) => `${s.id}:${s.layout}`), ["s5:quote", "s1:welkom", "s3:grafiek", "s4:beeld", "s7:tekst", "s6:afsluiting"]);
  const beeld = na.slides!.find((s) => s.id === "s4")!;
  assert.equal(beeld.titel, "Uitverkocht");
  assert.equal(beeld.tekst, "Nog 312 stoelen"); // niet meegegeven: blijft staan
  assert.deepEqual(beeld.foto, { wens: "Vol Philips Stadion" }); // de foto samengevoegd, niet vervangen
  assert.equal(beeld.fotoBreedte, 5);
  assert.throws(() => pasToe(d, { acties: [{ actie: "slide_wijzigen", slide_id: "s9", slide: {} }] }), /Bestaande slides: s1, s2/);
  assert.throws(() => pasToe(d, { acties: d.slides!.map((s) => ({ actie: "slide_verwijderen", slide_id: s.id })) }), /minstens één slide/);
});

test("een andere layout houdt de velden vast; een nadruk die niet meer past valt weg", () => {
  const s = leesSlide(slides[2], "s3");
  const tekst = wijzigSlide(s, { layout: "tekst" }, "x");
  assert.equal(tekst.grafiek?.titel, "Losse verkoop"); // bewaard voor als je terugwisselt
  assert.equal(tekst.nadruk, undefined); // een tekstslide heeft niets om uit te lichten
  const terug = wijzigSlide(tekst, { layout: "grafiek", nadruk: "Willem II" }, "x");
  assert.equal(terug.nadruk, "Willem II");
});

test("foto's: welke slides op een foto wachten", () => {
  const d = deck();
  assert.deepEqual(d.slides!.filter(wachtOpFoto).map((s) => s.id), ["s4", "s5"]);
});

test("rapport → deck: welkom, hoofdstukken, tekst naast grafiek of foto op één slide, afsluiting", () => {
  const inhoud = nieuweInhoud({
    soort: "rapport",
    titel: "Ticketverkoop",
    ondertitel: "9 dagen voor de aftrap",
    blokken: [
      { type: "kerngetallen", items: [{ label: "Bezetting", waarde: "95%" }], bron: "Ticketing" },
      { type: "conclusie", punten: ["Bijna uitverkocht"] },
      { type: "kop", tekst: "Verkoop" },
      { type: "tekst", tekst: "Voor op de rest", opmaak: { grootte: "half" } },
      { type: "grafiek", ...grafiek, opmaak: { grootte: "half", kernboodschap: "Voor op de rest", nadruk: "Willem II" } },
      { type: "afbeelding", wens: "Sfeer", opmaak: { grootte: "half" } },
      { type: "tekst", tekst: "Supporters", opmaak: { grootte: "half" } },
    ],
  });
  const d = vanBlokken(inhoud);
  assert.deepEqual(
    d.map((s) => [s.layout, s.titel ?? ""]),
    [
      ["welkom", "Ticketverkoop"],
      ["cijfers", "In cijfers"],
      ["tekst", "Conclusie"],
      ["hoofdstuk", "Verkoop"],
      ["grafiek", "Voor op de rest"],
      ["beeld", ""],
      ["afsluiting", ""],
    ]
  );
  assert.equal(d[0].subkop, "9 dagen voor de aftrap");
  assert.equal(d[4].tekst, "Voor op de rest");
  assert.equal(d[4].nadruk, "Willem II");
  assert.equal(d[5].foto?.wens, "Sfeer");
  assert.equal(d[5].tekst, "Supporters");
});

test("omzetten: naar deck maakt slides als ze er niet zijn; slides_opnieuw bouwt ze opnieuw op; terug naar rapport", () => {
  const rapport = nieuweInhoud({ soort: "rapport", titel: "T", blokken: [{ type: "tekst", tekst: "x" }] });
  const alsDeck = pasToe(rapport, { soort: "deck" });
  assert.deepEqual(alsDeck.slides!.map((s) => s.layout), ["welkom", "tekst", "afsluiting"]);
  const bewerkt = pasToe(alsDeck, { acties: [{ actie: "slide_wijzigen", slide_id: "s2", slide: { titel: "Eigen titel" } }] });
  const terugRapport = pasToe(bewerkt, { soort: "rapport" });
  assert.equal(terugRapport.blokken.length, 1); // het rapport is er nog
  assert.equal(pasToe(terugRapport, { soort: "deck" }).slides![1].titel, "Eigen titel"); // de slides ook
  assert.equal(pasToe(terugRapport, { soort: "deck", slides_opnieuw: true }).slides![1].titel, undefined);

  const alleenDeck = deck();
  const alsRapport = pasToe(alleenDeck, { soort: "rapport" });
  assert.deepEqual(alsRapport.blokken.map((b) => b.type), ["kop", "tekst", "grafiek", "tekst", "afbeelding", "tekst"]);
});

test("oude decks (alleen blokken) krijgen slides bij het lezen; bronnen en samenvatting komen uit de slides", () => {
  const oud = { ...nieuweInhoud({ soort: "rapport", titel: "T", blokken: [{ type: "grafiek", ...grafiek }] }), soort: "deck" };
  const nu = normaliseer(oud);
  assert.deepEqual(nu.slides!.map((s: DeckSlide) => s.layout), ["welkom", "grafiek", "afsluiting"]);
  const d = deck();
  assert.deepEqual(bronnenVan(d), ["Ticketing, stand 19 november 2026"]);
  const tekst = samenvatting(d);
  assert.match(tekst, /^Slide deck "Ticketverkoop", versie 1, 6 slides:/);
  assert.match(tekst, /s4 beeld: Bijna uitverkocht \[wacht op foto\]/);
});

test("zelf bewerken: ook slides, met slides_opnieuw", () => {
  const d = deck();
  const nieuw = handmatigBewerken(d, { basisVersie: 1, acties: [{ actie: "slide_wijzigen", slide_id: "s2", slide: { titel: "Wedstrijddag" } }] }, "");
  assert.equal(nieuw.slides![1].titel, "Wedstrijddag");
  assert.equal(nieuw.versie, 2);
  assert.equal(nieuw.vorige[0].slides![1].titel, "Verkoop");
  // Terug naar rapport heeft geen eigen blokken: dan uit de slides.
  assert.ok(naarBlokken(nieuw.slides!).length > 0);
});
