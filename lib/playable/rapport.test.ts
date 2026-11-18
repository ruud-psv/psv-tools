import { test } from "node:test";
import assert from "node:assert/strict";

import {
  campagnesTekst,
  normaliseerCampagne,
  normaliseerStatistieken,
  perDagTekst,
  playableConfig,
  statistiekenTekst,
  zoekCampagnes,
  type PlayableCampagne,
} from "./rapport";

const campagnes: PlayableCampagne[] = [
  normaliseerCampagne({ id: 1, name: "Fanstore - Coen Dillen tenue - 26/27 - DMID26-17577", type: "landingpage", active: true, live_url: "https://club.psv.nl/coendillen", created_on: "2026-10-01" }),
  normaliseerCampagne({ id: 2, name: "Ticketing - Wachtlijst SCC - 26/27 - DMID26-11224", type: "landingpage", active: false, live_url: "https://club.psv.nl/wachtlijst", created_on: "2026-05-06" }),
  normaliseerCampagne({ id: 3, name: "Mijn PSV+ - Winactie - 26/27 - DMID26-18000", type: "wheel_of_fortune", active: true, live_url: null, created_on: "2026-11-10" }),
];

test("config: de app-sleutels van Landingspagina's", () => {
  assert.deepEqual(playableConfig({ PLAYABLE_CLIENT_ID: "id", PLAYABLE_SECRET: "geheim" }), { clientId: "id", clientSecret: "geheim" });
  assert.throws(() => playableConfig({ PLAYABLE_CLIENT_ID: "id" }), /PLAYABLE_SECRET/);
});

test("zoeken: naam, DMID en URL, zonder spaties of hoofdletters", () => {
  const ids = (zoek: string) => zoekCampagnes(campagnes, { zoek }).map((c) => c.id);
  assert.deepEqual(ids("Coen Dillen"), [1]);
  assert.deepEqual(ids("coendillen"), [1]);
  assert.deepEqual(ids("17577"), [1]);
  assert.deepEqual(ids("DMID26-11224"), [2]);
  assert.deepEqual(ids("wachtlijst"), [2]);
  assert.deepEqual(ids("bestaat niet"), []);
  // Actieve eerst, dan de nieuwste.
  assert.deepEqual(zoekCampagnes(campagnes, {}).map((c) => c.id), [3, 1, 2]);
  assert.deepEqual(zoekCampagnes(campagnes, { alleen_actief: true }).map((c) => c.id), [3, 1]);
});

test("campagnes als tekst, met een tip als er niets is", () => {
  const tekst = campagnesTekst(zoekCampagnes(campagnes, { zoek: "coen" }), campagnes.length, { zoek: "coen" });
  assert.match(tekst, /^PLAYABLE · campagnes \(met "coen"\) · 1 gevonden van 3/);
  assert.match(tekst, /1 \| Fanstore - Coen Dillen tenue - 26\/27 - DMID26-17577 \| landingpage \| ja \|  \|  \| https:\/\/club\.psv\.nl\/coendillen \| 2026-10-01/);
  assert.match(campagnesTekst([], 3, { zoek: "x" }), /Geen campagnes gevonden\. Probeer/);
  assert.match(campagnesTekst(campagnes, 3, { limiet: 1 }), /Er zijn er meer \(3\)/);
});

test("statistieken: dezelfde velden als Landingspagina's, en een fout per campagne", () => {
  const stats = normaliseerStatistieken({
    data: {
      sessions: "3832",
      registrations: 410,
      unique_registration: 398,
      conversion: 10.386,
      devices: { desktop: 900, tablet: 32, mobile: 2900 },
      engagement: { time_spent_average: 47.6 },
      facebook: { shares: 12, sessions_from_shares: 40 },
    },
  });
  assert.equal(stats.sessions, 3832);
  assert.equal(stats.devices.mobile, 2900);
  const tekst = statistiekenTekst([
    { id: 1, campagne: campagnes[0], stats },
    { id: 99, fout: "404 Not found" },
  ]);
  assert.match(tekst, /1 \| Fanstore - Coen Dillen tenue - 26\/27 - DMID26-17577 \| ja \| 3832 \| 410 \| 398 \| 10\.4 \| 900 \| 32 \| 2900 \| 48 \| 12 \| 40/);
  assert.match(tekst, /99 \| onbekend \| fout: 404 Not found/);
  assert.equal(normaliseerStatistieken(null).sessions, 0);
});

test("per dag: een lijst wordt een tabel, de rest compacte JSON", () => {
  const tabel = perDagTekst(1, campagnes[0], { data: [{ date: "2026-10-01", registrations: 120 }, { date: "2026-10-02", registrations: 80 }] });
  assert.match(tabel, /aanmeldingen per dag · Fanstore - Coen Dillen/);
  assert.ok(tabel.includes("date | registrations\n2026-10-01 | 120\n2026-10-02 | 80"));
  assert.match(perDagTekst(1, undefined, { data: { "2026-10-01": 120 } }), /\{"2026-10-01":120\}/);
  assert.match(perDagTekst(1, undefined, { data: [] }), /Geen aanmeldingen per dag/);
});
