import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";

import {
  AssistentError,
  codeBericht,
  leesAntwoord,
  pasToe,
  systemPrompt,
  vraagAanpassing,
  zonderKit,
  type Wijziging,
} from "./assistent";
import { FRAMEWORK_CSS, FRAMEWORK_JS } from "./kit";

const BRON = {
  html: '<div id="psvk-app">\n  <h2 class="psvk-title">Vooruitblik Boszie</h2>\n  <p>Tekst</p>\n  <p>Tekst</p>\n</div>',
  css: "#psvk-app .psvk-pm-label { color: var(--psvk-ink); }",
  js: "document.addEventListener('psvk:ready', function () {});",
};

test("pasToe: zoek en vervang, achteraan toevoegen", () => {
  const { bron, fouten } = pasToe(BRON, [
    { veld: "html", zoek: "Vooruitblik Boszie", vervang: "Vooruitblik NEC" },
    { veld: "css", zoek: "", vervang: "#psvk-app .psvk-pm-x { margin: 0; }" },
  ]);
  assert.deepEqual(fouten, []);
  assert.ok(bron.html.includes("Vooruitblik NEC"));
  assert.ok(bron.css.endsWith("\n\n#psvk-app .psvk-pm-x { margin: 0; }"));
  assert.equal(bron.js, BRON.js);
});

test("pasToe: alles of niets, met duidelijke fouten", () => {
  const wijzigingen: Wijziging[] = [
    { veld: "html", zoek: "Vooruitblik Boszie", vervang: "Vooruitblik NEC" },
    { veld: "html", zoek: "<p>Tekst</p>", vervang: "<p>Nieuw</p>" },
    { veld: "css", zoek: "bestaat niet", vervang: "x" },
  ];
  const { bron, fouten } = pasToe(BRON, wijzigingen);
  assert.equal(bron, BRON);
  assert.deepEqual(fouten, [
    "Wijziging 2 (HTML): de zoektekst staat 2 keer in de code; neem meer omringende tekst mee.",
    "Wijziging 3 (CSS): de zoektekst staat niet in de code.",
  ]);
});

test("pasToe: $-tekens in de vervanging blijven letterlijk", () => {
  const { bron } = pasToe(BRON, [{ veld: "html", zoek: "<p>Tekst</p>\n</div>", vervang: "<p>€ 5 of $& $1</p>\n</div>" }]);
  assert.ok(bron.html.includes("<p>€ 5 of $& $1</p>"));
});

test("zonderKit: de Kit gaat eruit, de rest blijft", () => {
  const bron = zonderKit({
    html: BRON.html,
    css: `${FRAMEWORK_CSS}\n${BRON.css}`,
    js: `${FRAMEWORK_JS}\n${BRON.js}`,
  });
  assert.equal(bron.css, BRON.css);
  assert.equal(bron.js, BRON.js);
});

test("leesAntwoord en codeBericht", () => {
  assert.deepEqual(leesAntwoord('{"antwoord":"Klaar","wijzigingen":[{"veld":"html","zoek":"a","vervang":"b"}]}'), {
    antwoord: "Klaar",
    wijzigingen: [{ veld: "html", zoek: "a", vervang: "b" }],
  });
  assert.equal(leesAntwoord("geen json"), null);
  assert.equal(leesAntwoord('{"antwoord":1}'), null);
  const bericht = codeBericht(BRON, "Maak de kop rood");
  assert.ok(bericht.startsWith("<pagina_html>\n"));
  assert.ok(bericht.endsWith("Vraag van de collega:\nMaak de kop rood"));
});

test("systemPrompt: de regels en de naslag van de Kit zitten erin", () => {
  const prompt = systemPrompt();
  assert.ok(prompt.includes("## Uitgangspunten"));
  assert.ok(prompt.includes("psvk:ready"));
  assert.ok(prompt.includes("PSV CAMPAIGN KIT"));
});

/** Een nagebootste Claude die de antwoorden in volgorde teruggeeft. */
function fakeClient(antwoorden: { json: unknown; stop?: string }[]) {
  const verzoeken: Anthropic.MessageCreateParams[] = [];
  const client = {
    messages: {
      stream(params: Anthropic.MessageCreateParams) {
        // Kopie: de assistent vult de berichten daarna nog aan.
        verzoeken.push(structuredClone(params));
        const volgende = antwoorden.shift();
        if (!volgende) throw new Error("Geen antwoord meer");
        return {
          finalMessage: async () => ({
            stop_reason: volgende.stop ?? "end_turn",
            usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 50 },
            content: [
              { type: "thinking", thinking: "", signature: "x" },
              { type: "text", text: JSON.stringify(volgende.json) },
            ],
          }),
        };
      },
    },
  };
  return { client: client as unknown as Anthropic, verzoeken };
}

test("vraagAanpassing: wijziging toegepast, code alleen in de laatste beurt", async () => {
  const { client, verzoeken } = fakeClient([
    {
      json: {
        antwoord: "De kop is aangepast.",
        wijzigingen: [{ veld: "html", zoek: "Vooruitblik Boszie", vervang: "Vooruitblik NEC" }],
      },
    },
  ]);
  const resultaat = await vraagAanpassing({
    client,
    bron: { ...BRON, css: `${FRAMEWORK_CSS}\n${BRON.css}` },
    berichten: [
      { rol: "gebruiker", tekst: "Hoi" },
      { rol: "assistent", tekst: "Wat moet er anders?" },
      { rol: "gebruiker", tekst: "Tegenstander is NEC" },
    ],
  });
  assert.equal(resultaat.antwoord, "De kop is aangepast.");
  assert.ok(resultaat.bron?.html.includes("Vooruitblik NEC"));
  assert.equal(resultaat.bron?.css, BRON.css); // zonder Kit
  assert.deepEqual(resultaat.gebruik, { input: 100, output: 10, cacheRead: 50 });

  const verzoek = verzoeken[0];
  assert.equal(verzoek.model, "claude-opus-5-5");
  assert.equal(verzoek.messages.length, 3);
  assert.equal(verzoek.messages[0].content, "Hoi");
  assert.ok(String(verzoek.messages[2].content).includes("<pagina_html>"));
  assert.ok(!String(verzoek.messages[2].content).includes("PSV CAMPAIGN KIT"));
});

test("vraagAanpassing: past een wijziging niet, dan opnieuw met de fout erbij", async () => {
  const { client, verzoeken } = fakeClient([
    { json: { antwoord: "Gedaan.", wijzigingen: [{ veld: "html", zoek: "<p>Tekst</p>", vervang: "<p>X</p>" }] } },
    {
      json: {
        antwoord: "Gedaan.",
        wijzigingen: [{ veld: "html", zoek: "<p>Tekst</p>\n</div>", vervang: "<p>X</p>\n</div>" }],
      },
    },
  ]);
  const resultaat = await vraagAanpassing({ client, bron: BRON, berichten: [{ rol: "gebruiker", tekst: "Pas de laatste alinea aan" }] });
  assert.ok(resultaat.bron?.html.endsWith("<p>Tekst</p>\n  <p>X</p>\n</div>"));
  assert.equal(verzoeken.length, 2);
  const tweede = verzoeken[1].messages;
  assert.equal(tweede.length, 3);
  // Het eerste antwoord gaat letterlijk terug, met het denkblok.
  assert.ok(Array.isArray(tweede[1].content) && tweede[1].content[0].type === "thinking");
  assert.match(String(tweede[2].content), /staat 2 keer in de code/);
});

test("vraagAanpassing: kapotte JavaScript na de wijziging telt als fout", async () => {
  const { client, verzoeken } = fakeClient([
    { json: { antwoord: "x", wijzigingen: [{ veld: "js", zoek: "{});", vervang: "{" }] } },
    { json: { antwoord: "Ik heb meer nodig: welke knop?", wijzigingen: [] } },
  ]);
  const resultaat = await vraagAanpassing({ client, bron: BRON, berichten: [{ rol: "gebruiker", tekst: "Knop" }] });
  assert.equal(resultaat.bron, null);
  assert.equal(resultaat.antwoord, "Ik heb meer nodig: welke knop?");
  assert.match(String(verzoeken[1].messages[2].content), /JavaScript bevat een fout/);
});

test("vraagAanpassing: na drie mislukte pogingen een melding", async () => {
  const fout = { json: { antwoord: "x", wijzigingen: [{ veld: "css", zoek: "nergens", vervang: "y" }] } };
  const { client } = fakeClient([fout, fout, fout]);
  await assert.rejects(
    vraagAanpassing({ client, bron: BRON, berichten: [{ rol: "gebruiker", tekst: "a" }] }),
    (err: unknown) => err instanceof AssistentError && /niet om de wijziging precies/.test(err.message)
  );
});

test("vraagAanpassing: weigering en geen vraag", async () => {
  const { client } = fakeClient([{ json: {}, stop: "refusal" }]);
  await assert.rejects(
    vraagAanpassing({ client, bron: BRON, berichten: [{ rol: "gebruiker", tekst: "a" }] }),
    /wil deze vraag niet uitvoeren/
  );
  await assert.rejects(vraagAanpassing({ client, bron: BRON, berichten: [] }), /geen vraag/);
});
