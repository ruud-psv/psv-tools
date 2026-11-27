import { test } from "node:test";
import assert from "node:assert/strict";

import { normaliseerCreative } from "../meta-ads/creative";
import { creativeTools, eerdereCreativesContext, leesCreatives, type AssistentCreative } from "./creative-tools";
import { ToolFout } from "./toegang";

const details = normaliseerCreative({
  object_story_spec: {
    video_data: { message: "Romário kwam twee dagen te laat.", title: "Bekijk het interview", video_id: "77", call_to_action: { type: "WATCH_MORE" } },
  },
});

function maak(bekend: string[] = ["11"]) {
  const getoond: AssistentCreative[][] = [];
  const gevraagd: string[][] = [];
  const [tool] = creativeTools({
    async haal(ids) {
      gevraagd.push(ids);
      return new Map(ids.filter((id) => bekend.includes(id)).map((id) => [id, { id, naam: "Snack | 3", campagne: "PSV Play Guus Hiddink", details }]));
    },
    onGetoond: (c) => getoond.push(c),
  });
  return { tool, getoond, gevraagd };
}

test("toont de advertenties als kaart en geeft de copy aan het model", async () => {
  const { tool, getoond, gevraagd } = maak(["11"]);
  assert.equal(tool.page, "/dashboard/paid-ads");
  const gelezen = tool.lees({ advertentie_ids: ["11", "12", "11"] });
  assert.ok("invoer" in gelezen);
  const tekst = await tool.run(gelezen.invoer);

  assert.deepEqual(gevraagd, [["11", "12"]]);
  assert.equal(getoond.length, 1);
  assert.equal(getoond[0][0].adId, "11");
  assert.equal(getoond[0][0].details.videoLijst[0].id, "77");
  assert.match(tekst, /1 advertentie staat als kaart in de chat/);
  assert.match(tekst, /Niet gevonden bij Meta: 12/);
  assert.match(tekst, /Tekst: Romário kwam twee dagen te laat\./);
});

test("weigert ongeldige invoer en meldt als niets bekend is", async () => {
  const { tool, getoond } = maak([]);
  assert.ok("fout" in tool.lees({ advertentie_ids: ["../me"] }));
  assert.ok("fout" in tool.lees({ advertentie_ids: [] }));
  assert.ok("fout" in tool.lees({ advertentie_ids: ["1", "2", "3", "4", "5", "6", "7"] }));
  await assert.rejects(tool.run({ advertentie_ids: ["99"] }), ToolFout);
  assert.equal(getoond.length, 0);
});

test("leesCreatives laat alleen geldige kaarten door", () => {
  const goed: AssistentCreative = { platform: "meta", adId: "11", naam: null, campagne: null, details };
  assert.deepEqual(leesCreatives([goed, { platform: "meta", adId: "x/../", details }, null, "x"]), [goed]);
  assert.deepEqual(leesCreatives(undefined), []);
});

test("beeld voor een stuk: één kopie per advertentie, mislukte meldt een wens", async () => {
  const gekopieerd: string[] = [];
  const tools = creativeTools({
    haal: async () => new Map(),
    onGetoond: () => undefined,
    async beeldVoorStuk(id) {
      gekopieerd.push(id);
      if (id === "2") throw new Error("geen beeld");
      return `https://cdn.example/stukken/${id}.jpg`;
    },
  });
  const beeld = tools.find((t) => t.name === "meta_creative_beelden")!;
  assert.equal(beeld.geenBron, true);
  const tekst = await beeld.run({ advertentie_ids: ["1", "2"] });
  assert.match(tekst, /1: https:\/\/cdn\.example\/stukken\/1\.jpg/);
  assert.match(tekst, /2: geen beeld/);
  await beeld.run({ advertentie_ids: ["1"] });
  assert.deepEqual(gekopieerd, ["1", "2"]);
  await assert.rejects(beeld.run({ advertentie_ids: ["2"] }), ToolFout);
});

test("zonder beeldVoorStuk geen beeldtool", () => {
  const tools = creativeTools({ haal: async () => new Map(), onGetoond: () => undefined });
  assert.deepEqual(tools.map((t) => t.name), ["meta_creatives_tonen"]);
});

test("eerdere kaarten als context voor het model", () => {
  const c = (adId: string, naam: string): AssistentCreative => ({ platform: "meta", adId, naam, campagne: "Guus", details });
  assert.equal(eerdereCreativesContext([{}, { creatives: [] }]), null);
  const tekst = eerdereCreativesContext([{ creatives: [c("11", "Snack | 3")] }, { creatives: [c("12", "Tess"), c("11", "Snack | 3")] }])!;
  assert.match(tekst, /- 11: Snack \| 3, campagne Guus\n- 12: Tess/);
});
