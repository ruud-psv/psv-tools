import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import type { ModelProfiel } from "@/lib/replicate/schema";
import type { Basisfoto } from "./index";
import {
  bouwConfig,
  heeftOngepubliceerdeWijzigingen,
  slugVan,
  STANDAARD_LIMIETEN,
  STANDAARD_ORIGINS,
  valideerCampagne,
  type Campagne,
} from "./campagne";
import { bunnyCampagneConfig, haalVanBunny, zetOpBunny } from "./campagne-opslag";

const GELDIG = {
  slug: "kerst-2026",
  naam: "Kerst 2026",
  basisfotoId: "m1abc-x1y2z",
  model: "google/nano-banana",
  posities: ["automatisch", "links"],
  kleding: ["passend"],
  limieten: { ...STANDAARD_LIMIETEN },
  origins: [...STANDAARD_ORIGINS],
};

const PROFIEL: ModelProfiel = {
  id: "google/nano-banana",
  promptVeld: "prompt",
  referentieVeld: "image_input",
  referentieIsLijst: true,
  verhoudingVeld: "aspect_ratio",
  verhoudingOpties: ["match_input_image", "1:1", "4:3"],
  formaatVeld: "output_format",
  formaatOpties: ["jpg", "png"],
  levertBestand: true,
  velden: ["prompt", "image_input", "aspect_ratio", "output_format"],
};

const BASISFOTO: Basisfoto = {
  id: "m1abc-x1y2z",
  pad: "groepsfoto/basisfotos/beelden/m1abc-x1y2z.jpg",
  label: "Kerst bij de boom",
  gelegenheid: "kerst",
  breedte: 2048,
  hoogte: 1536,
  kleding: "a red Christmas jumper",
  toegevoegdDoor: "test@psv.nl",
  toegevoegdOp: "2026-11-01T00:00:00.000Z",
};

function campagne(extra: Partial<Campagne> = {}): Campagne {
  const { campagne: invoer } = valideerCampagne(GELDIG) as { campagne: Campagne };
  return {
    ...invoer,
    actief: true,
    aangemaaktDoor: "test@psv.nl",
    aangemaaktOp: "2026-11-20T10:00:00.000Z",
    gewijzigdDoor: "test@psv.nl",
    gewijzigdOp: "2026-11-20T10:00:00.000Z",
    ...extra,
  };
}

function config(profiel = PROFIEL) {
  return bouwConfig({
    campagne: campagne(),
    basisfoto: BASISFOTO,
    profiel,
    basisfotoPad: "campagnes/kerst-2026/basisfoto.jpg",
    contentType: "image/jpeg",
    nu: "2026-11-24T12:00:00.000Z",
  });
}

/* ---------------- valideren ---------------- */

test("valideerCampagne: geldige invoer komt schoon terug", () => {
  const r = valideerCampagne({ ...GELDIG, naam: "  Kerst   2026 ", origins: ["https://club.psv.nl/"] });
  assert.ok("campagne" in r);
  assert.equal(r.campagne.naam, "Kerst 2026");
  assert.deepEqual(r.campagne.origins, ["https://club.psv.nl"]);
});

test("valideerCampagne: onbekende keuzes vallen af, en zonder keuze is het een fout", () => {
  const r = valideerCampagne({ ...GELDIG, posities: ["links", "achterin"] });
  assert.ok("campagne" in r);
  assert.deepEqual(r.campagne.posities, ["links"]);
  assert.ok("fout" in valideerCampagne({ ...GELDIG, kleding: ["badpak"] }));
});

test("valideerCampagne: limieten buiten de grenzen worden geweigerd", () => {
  assert.ok("fout" in valideerCampagne({ ...GELDIG, limieten: { ...STANDAARD_LIMIETEN, perDag: 1_000_000 } }));
  assert.ok("fout" in valideerCampagne({ ...GELDIG, limieten: { ...STANDAARD_LIMIETEN, perIpPerUur: 0 } }));
  assert.ok("fout" in valideerCampagne({ ...GELDIG, limieten: { ...STANDAARD_LIMIETEN, perAccount: 2.5 } }));
});

test("valideerCampagne: alleen https-origins zonder pad", () => {
  assert.ok("fout" in valideerCampagne({ ...GELDIG, origins: ["http://club.psv.nl"] }));
  assert.ok("fout" in valideerCampagne({ ...GELDIG, origins: ["https://club.psv.nl/kerst"] }));
  assert.ok("fout" in valideerCampagne({ ...GELDIG, origins: [] }));
});

test("valideerCampagne: de sleutel moet in een pad passen", () => {
  assert.ok("fout" in valideerCampagne({ ...GELDIG, slug: "../geheim" }));
  assert.ok("fout" in valideerCampagne({ ...GELDIG, slug: "Kerst" }));
  assert.equal(slugVan("Kerst 2026: bij de boom!"), "kerst-2026-bij-de-boom");
});

test("heeftOngepubliceerdeWijzigingen", () => {
  assert.equal(heeftOngepubliceerdeWijzigingen(campagne()), true);
  const gepubliceerd = {
    op: "2026-11-21T00:00:00.000Z",
    door: "test@psv.nl",
    configPad: "campagnes/kerst-2026/config.json",
    basisfotoPad: "campagnes/kerst-2026/basisfoto.jpg",
  };
  assert.equal(heeftOngepubliceerdeWijzigingen(campagne({ gepubliceerd })), false);
  assert.equal(
    heeftOngepubliceerdeWijzigingen(campagne({ gepubliceerd, gewijzigdOp: "2026-11-22T00:00:00.000Z" })),
    true
  );
});

/* ---------------- config ---------------- */

test("bouwConfig: één prompt per combinatie, met de kleding van de foto", () => {
  const c = config();
  assert.deepEqual(Object.keys(c.prompts).sort(), ["automatisch|passend", "links|passend"]);
  assert.match(c.prompts["links|passend"], /leftmost player/);
  assert.match(c.prompts["links|passend"], /red Christmas jumper/);
});

test("bouwConfig: vaste invoer zonder prompt en beelden, met match_input_image", () => {
  const c = config();
  assert.equal(c.replicate.pad, "/models/google/nano-banana/predictions");
  assert.equal(c.replicate.promptVeld, "prompt");
  assert.equal(c.replicate.referentieVeld, "image_input");
  assert.deepEqual(c.replicate.vasteInvoer, { aspect_ratio: "match_input_image", output_format: "png" });
});

test("bouwConfig: gepind model via /predictions met versie", () => {
  const c = config({ ...PROFIEL, versie: "abc123" });
  assert.equal(c.replicate.pad, "/predictions");
  assert.equal(c.replicate.versie, "abc123");
});

test("bouwConfig: geen e-mailadressen in de config", () => {
  assert.doesNotMatch(JSON.stringify(config()), /@psv\.nl/);
});

test("bouwConfig: een model met één beeld wordt geweigerd", () => {
  assert.throws(() => config({ ...PROFIEL, referentieIsLijst: false }));
});

/* ---------------- Bunny ---------------- */

const realFetch = globalThis.fetch;
const ENV = ["GROEPSFOTO_BUNNY_STORAGE_ZONE", "GROEPSFOTO_BUNNY_STORAGE_KEY", "GROEPSFOTO_BUNNY_STORAGE_HOST", "BUNNY_STORAGE_ZONE"];

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const naam of ENV) delete process.env[naam];
});

test("bunnyCampagneConfig: zonder zone of sleutel een melding", () => {
  assert.throws(() => bunnyCampagneConfig(), /GROEPSFOTO_BUNNY_STORAGE_ZONE/);
});

test("bunnyCampagneConfig: de openbare zone van de Playable loader wordt geweigerd", () => {
  process.env.BUNNY_STORAGE_ZONE = "psveindhoven";
  process.env.GROEPSFOTO_BUNNY_STORAGE_ZONE = "psveindhoven";
  process.env.GROEPSFOTO_BUNNY_STORAGE_KEY = "sleutel";
  assert.throws(() => bunnyCampagneConfig(), /openbaar/);
});

test("zetOpBunny: PUT naar de privé zone met de eigen sleutel", async () => {
  process.env.GROEPSFOTO_BUNNY_STORAGE_ZONE = "psv-campagnes";
  process.env.GROEPSFOTO_BUNNY_STORAGE_KEY = "sleutel";
  let verzoek: { url: string; method?: string; key: string | null; type: string | null } | null = null;
  globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    verzoek = { url: String(input), method: init?.method, key: headers.get("AccessKey"), type: headers.get("Content-Type") };
    return new Response(null, { status: 201 });
  };
  await zetOpBunny("campagnes/kerst-2026/config.json", "{}", "application/json");
  assert.deepEqual(verzoek, {
    url: "https://storage.bunnycdn.com/psv-campagnes/campagnes/kerst-2026/config.json",
    method: "PUT",
    key: "sleutel",
    type: "application/json",
  });
});

test("haalVanBunny: een bestand dat al weg is, is geen fout; een andere fout wel", async () => {
  process.env.GROEPSFOTO_BUNNY_STORAGE_ZONE = "psv-campagnes";
  process.env.GROEPSFOTO_BUNNY_STORAGE_KEY = "sleutel";
  globalThis.fetch = async () => new Response(null, { status: 404 });
  await haalVanBunny("campagnes/kerst-2026/config.json");
  globalThis.fetch = async () => new Response("nope", { status: 401 });
  await assert.rejects(haalVanBunny("campagnes/kerst-2026/config.json"), /401/);
});
