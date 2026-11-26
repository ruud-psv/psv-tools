import { test } from "node:test";
import assert from "node:assert/strict";
import { fansRun, type MijnpsvBron } from "./run";
import type { MaileonKlikken } from "./maileon";
import { geheugenOpslag, leesHistorie, leesSet, paden } from "./store";
import type { SeizoenDoelen } from "./doelen";
import { DOELEN } from "./doelen";

// Een kort seizoen, zodat de eerste vulling een handvol dagen is.
const KORT: SeizoenDoelen[] = [{ ...DOELEN[0], start: "2026-10-30" }];

/** 30 okt tot en met 2 nov: steeds wat nieuwe en terugkerende klikkers. */
const KLIKKEN: Record<string, string[]> = {
  "2026-10-30": ["a", "b"],
  "2026-10-31": ["b", "c"],
  "2026-11-01": ["c", "d"],
  "2026-11-02": ["D", "e "],
};

function nepMaileon(gelezen: string[] = []): MaileonKlikken {
  return {
    async klikkersOpDag(dag) {
      gelezen.push(dag);
      return (KLIKKEN[dag] ?? []).map((x) => x.trim().toLowerCase());
    },
    endpoint: () => "/reports/clicks/unique",
  };
}

function nepMijnpsv(profielen: { sso: string; laatsteLogin: string }[], vragen: string[] = []): MijnpsvBron {
  return {
    async profielenSinds(sinds) {
      vragen.push(sinds);
      return profielen.filter((p) => p.laatsteLogin >= sinds);
    },
  };
}

// 2 november, 22.30 uur in Nederland.
const NU = new Date("2026-11-02T21:30:00Z");

test("eerste run: Maileon vanaf het begin, MijnPSV erbij, en een ontdubbelde stand", async () => {
  const opslag = geheugenOpslag();
  const gelezen: string[] = [];
  const vragen: string[] = [];
  const mijnpsv = nepMijnpsv(
    [
      { sso: "E", laatsteLogin: "2026-11-02" },
      { sso: "f", laatsteLogin: "2026-11-01" },
      { sso: "g", laatsteLogin: "2026-10-31" },
    ],
    vragen
  );
  const v = await fansRun({ opslag, maileon: nepMaileon(gelezen), mijnpsv, nu: NU, budgetMs: 60_000, doelen: KORT });

  assert.deepEqual(gelezen, ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  assert.equal(v.maileon.tot, "2026-11-01", "vandaag blijft open");
  assert.deepEqual(vragen, ["2026-10-30"]);
  // November: Maileon c, d, e; MijnPSV e, f; overlap e.
  assert.deepEqual(v.stand?.engaged, { maand: "2026-11", maileon: 3, mijnpsv: 2, overlap: 1, totaal: 4 });
  // Seizoen: Maileon a–e; MijnPSV e, f, g; overlap e.
  assert.deepEqual(v.stand?.active, { maileon: 5, mijnpsv: 3, overlap: 1, totaal: 7 });

  const h = await leesHistorie(opslag, "2026-27");
  assert.deepEqual(h?.mijnpsv, { maanden: ["2026-11"], laatste: "2026-11-02" });
  assert.deepEqual(h?.maileonMaanden, { "2026-10": 3, "2026-11": 3 });
  assert.equal(h?.dagen.length, 1);
  assert.equal((await leesSet(opslag, "2026-27", "maileon", "2026-10")).count, 3);
  // Er staat geen SSO-id in de opslag, alleen hashes en aantallen.
  for (const [pad, bytes] of opslag.inhoud) assert.ok(!/"[a-g]"/.test(bytes.toString("latin1")), `${pad} bevat een SSO-id`);
});

test("volgende run: alleen vandaag opnieuw, MijnPSV vanaf de vorige keer, één stand per dag", async () => {
  const opslag = geheugenOpslag();
  await fansRun({ opslag, maileon: nepMaileon(), mijnpsv: null, nu: NU, budgetMs: 60_000, doelen: KORT });

  const gelezen: string[] = [];
  const v = await fansRun({ opslag, maileon: nepMaileon(gelezen), mijnpsv: null, nu: NU, budgetMs: 60_000, doelen: KORT });
  assert.deepEqual(gelezen, ["2026-11-02"]);
  assert.deepEqual(v.stand?.engaged, { maand: "2026-11", maileon: 3, mijnpsv: null, overlap: null, totaal: null });
  assert.equal((await leesHistorie(opslag, "2026-27"))?.dagen.length, 1);
});

test("op budget stoppen: geen stand, wel de voortgang, en de volgende run gaat verder", async () => {
  const opslag = geheugenOpslag();
  const v = await fansRun({ opslag, maileon: nepMaileon(), mijnpsv: nepMijnpsv([]), nu: NU, budgetMs: -1, doelen: KORT });
  assert.equal(v.maileon.klaar, false);
  assert.equal(v.stand, null);
  assert.equal(v.mijnpsv, null, "MijnPSV wacht tot Maileon bij is");

  const gelezen: string[] = [];
  const v2 = await fansRun({ opslag, maileon: nepMaileon(gelezen), mijnpsv: null, nu: NU, budgetMs: 60_000, doelen: KORT });
  assert.equal(gelezen[0], "2026-10-30");
  assert.equal(v2.maileon.klaar, true);
});

test("een fout bij MijnPSV laat Maileon en de stand van de vorige keer staan", async () => {
  const opslag = geheugenOpslag();
  await fansRun({ opslag, maileon: nepMaileon(), mijnpsv: nepMijnpsv([{ sso: "x", laatsteLogin: "2026-11-01" }]), nu: NU, budgetMs: 60_000, doelen: KORT });
  const kapot: MijnpsvBron = { profielenSinds: async () => Promise.reject(new Error("BlueConic onbereikbaar")) };
  const v = await fansRun({ opslag, maileon: nepMaileon(), mijnpsv: kapot, nu: NU, budgetMs: 60_000, doelen: KORT });
  assert.deepEqual(v.mijnpsv, { fout: "BlueConic onbereikbaar" });
  assert.equal(v.stand?.engaged.mijnpsv, 1);
  assert.ok(opslag.inhoud.has(paden.historie("2026-27")));
});

test("buiten een seizoen met doelen stopt de run met uitleg", async () => {
  await assert.rejects(
    fansRun({ opslag: geheugenOpslag(), maileon: nepMaileon(), mijnpsv: null, nu: new Date("2027-07-02T10:00:00Z"), budgetMs: 1, doelen: KORT }),
    /geen doelen/
  );
});
