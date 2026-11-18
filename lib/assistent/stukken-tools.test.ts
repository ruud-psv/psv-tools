import { test } from "node:test";
import assert from "node:assert/strict";

import { ToolFout } from "./toegang";
import { stukTools } from "./stukken-tools";
import type { Stuk } from "../stukken/model";

function opzet(begin: Stuk | null = null) {
  let opgeslagen = begin;
  const meldingen: Stuk[] = [];
  const tools = stukTools({
    gesprekId: "c".repeat(32),
    email: "maker@psv.nl",
    opslag: {
      get: async () => opgeslagen,
      save: async (stuk) => {
        await new Promise((r) => setTimeout(r, 5)); // een trage opslag, om races te zien
        opgeslagen = stuk;
      },
    },
    vandaag: "2026-11-18",
    nu: () => "2026-11-18T12:00:00.000Z",
    onGewijzigd: (stuk) => meldingen.push(stuk),
  });
  const tool = (naam: string) => tools.find((t) => t.name === naam)!;
  return { tool, meldingen, opgeslagen: () => opgeslagen };
}

const maken = {
  soort: "rapport",
  titel: "Coen Dillen",
  blokken: [
    { type: "kop", tekst: "Verkoop" },
    { type: "kerngetallen", items: [{ label: "Omzet", waarde: "€ 374.610" }], bron: "GA psvfanstore.nl, 60 dagen" },
  ],
};

test("maken: versie 1 bij dit gesprek en deze collega, en de chat hoort het", async () => {
  const { tool, meldingen, opgeslagen } = opzet();
  const uitkomst = await tool("stuk_maken").run(maken);
  assert.match(uitkomst, /^Stuk gemaakt\. Rapport "Coen Dillen", versie 1, 2 blokken:\nb1 kop: Verkoop\nb2 kerngetallen: Omzet/);
  const stuk = opgeslagen()!;
  assert.equal(stuk.id, "c".repeat(32));
  assert.equal(stuk.eigenaar, "maker@psv.nl");
  assert.equal(stuk.peildatum, "2026-11-18");
  assert.equal(meldingen.length, 1);
  assert.equal(tool("stuk_maken").geenBron, true);
});

test("bijwerken: nieuwe versie; peildatum schuift alleen op bij nieuwe cijfers", async () => {
  const { tool, opgeslagen } = opzet();
  await tool("stuk_maken").run(maken);
  const oud = { ...opgeslagen()!, peildatum: "2026-11-01" };
  const tweede = opzet(oud);
  await tweede.tool("stuk_bijwerken").run({ titel: "Coen Dillen, eerbetoon" });
  assert.equal(tweede.opgeslagen()!.versie, 2);
  assert.equal(tweede.opgeslagen()!.peildatum, "2026-11-01");
  await tweede.tool("stuk_bijwerken").run({
    acties: [{ actie: "toevoegen", blok: { type: "tabel", kolommen: ["a"], rijen: [["1"]], bron: "GA" } }],
  });
  assert.equal(tweede.opgeslagen()!.peildatum, "2026-11-18");
});

test("fouten gaan als leesbare ToolFout naar het model, en er verandert niets", async () => {
  const { tool, opgeslagen } = opzet();
  await assert.rejects(tool("stuk_bijwerken").run({ titel: "x" }), (err: Error) => err instanceof ToolFout && /eerst een met stuk_maken/.test(err.message));
  await assert.rejects(tool("stuk_maken").run({ ...maken, soort: "presentatie" }), ToolFout);
  assert.equal(opgeslagen(), null);
  await tool("stuk_maken").run(maken);
  await assert.rejects(tool("stuk_bijwerken").run({ acties: [{ actie: "verwijderen", blok_id: "b7" }] }), /b7" bestaat niet/);
  assert.equal(opgeslagen()!.versie, 1);
});

test("parallelle bewerkingen gaan na elkaar: geen wijziging gaat verloren", async () => {
  const { tool, opgeslagen } = opzet();
  await tool("stuk_maken").run(maken);
  await Promise.all([
    tool("stuk_bijwerken").run({ acties: [{ actie: "toevoegen", blok: { type: "kop", tekst: "Een" } }] }),
    tool("stuk_bijwerken").run({ acties: [{ actie: "toevoegen", blok: { type: "kop", tekst: "Twee" } }] }),
  ]);
  const stuk = opgeslagen()!;
  assert.equal(stuk.versie, 3);
  assert.deepEqual(stuk.blokken.map((b) => b.id), ["b1", "b2", "b3", "b4"]);
});
