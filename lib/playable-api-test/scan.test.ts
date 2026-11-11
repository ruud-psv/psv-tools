import { test } from "node:test";
import assert from "node:assert/strict";

import {
  fillPath,
  findCodeFields,
  idsFromList,
  isReadScope,
  isWriteScope,
  listPathCandidates,
  normalizeUrl,
  parseCampaignInput,
  planReads,
} from "./scan";
import { parseOpenApi } from "./spec";
import { SAMPLE_SPEC_YAML } from "./fixtures";

test("planReads: alleen GET op een campagne, zonder persoonsgegevens", () => {
  const plan = planReads(parseOpenApi(SAMPLE_SPEC_YAML).operations);
  assert.deepEqual(
    plan.single.map((o) => o.path),
    ["/v1/campaign/{campaign}", "/v1/campaign/{campaign}/sections"]
  );
  // De lijst staat in het meervoud, de losse sectie in het enkelvoud.
  assert.deepEqual(
    plan.nested.map((n) => [n.operation.path, n.listPath]),
    [["/v1/campaign/{campaign}/section/{section}", "/v1/campaign/{campaign}/sections"]]
  );
  assert.deepEqual(
    plan.skipped.map((s) => `${s.path} · ${s.reason}`),
    [
      "/v1/campaign/{campaign}/section/{section}/form-fields · Niet nodig voor deze vraag",
      "/v1/campaign/{campaign}/prizes · Niet nodig voor deze vraag",
      "/v1/campaign/{campaign}/prize/{prize} · Niet nodig voor deze vraag",
      "/v1/campaign/{campaign}/registrations · Mogelijk persoonsgegevens",
    ]
  );
});

test("listPathCandidates: enkelvoud en meervoud", () => {
  assert.deepEqual(listPathCandidates("/v1/campaign/{c}/section/{s}"), [
    "/v1/campaign/{c}/section",
    "/v1/campaign/{c}/sections",
    "/v1/campaign/{c}/sectiones",
  ]);
  assert.ok(listPathCandidates("/v1/campaign/{c}/sections/{s}").includes("/v1/campaign/{c}/sections"));
  assert.ok(listPathCandidates("/v1/campaign/{c}/categories/{s}").includes("/v1/campaign/{c}/category"));
  assert.deepEqual(listPathCandidates("/v1/campaign/{c}"), []);
});

test("planReads: genest endpoint zonder lijst wordt overgeslagen", () => {
  const plan = planReads([
    { method: "get", path: "/v1/campaign/{c}/pages/{p}", summary: "", scopes: [] },
  ]);
  assert.equal(plan.nested.length, 0);
  assert.equal(plan.skipped[0].reason, "Geen lijst om een ID uit te halen");
});

test("planReads: persoonsgegevens ook herkend aan het recht", () => {
  const plan = planReads([
    { method: "get", path: "/v1/campaign/{c}/data", summary: "", scopes: ["campaigns.registrations.view"] },
  ]);
  assert.equal(plan.single.length, 0);
  assert.equal(plan.skipped[0].reason, "Mogelijk persoonsgegevens");
});

test("fillPath en idsFromList", () => {
  assert.equal(fillPath("/v1/campaign/{c}/sections/{s}", [123, "a b"]), "/v1/campaign/123/sections/a%20b");
  assert.deepEqual(idsFromList({ data: [{ id: 5 }, { id: "x" }, { naam: "geen id" }] }), [5, "x"]);
  assert.deepEqual(idsFromList({ data: [{ uuid: "a-b" }] }), ["a-b"]);
  assert.deepEqual(idsFromList([{ id: 1 }, { id: 2 }], 1), [1]);
  assert.deepEqual(idsFromList({ data: { id: 1 } }), []);
  assert.deepEqual(idsFromList(undefined), []);
});

test("lees- en schrijfrechten", () => {
  assert.ok(isReadScope("campaigns.view"));
  assert.ok(isReadScope("campaigns.sections.list"));
  assert.ok(!isReadScope("campaigns.modify"));
  assert.ok(isWriteScope("campaigns.modify"));
  assert.ok(isWriteScope("campaigns.copy"));
  assert.ok(!isWriteScope("campaigns.view"));
});

test("findCodeFields: PSV-code eerst, gewone tekst niet", () => {
  const fields = findCodeFields({
    data: {
      name: "Seizoenkaarten 2026-2027",
      description: "Een gewone omschrijving van de campagne zonder code erin, maar wel lang genoeg.",
      theme: { css: "body { margin: 0; padding: 0; } @media (max-width: 600px) { body { margin: 4px; } }" },
      sections: [
        { type: "text", content: "Hallo" },
        {
          type: "custom",
          settings: {
            html: '<div id="psvk-app" class="psvk-app"><section class="psvk-section psvk-red"><h1>Titel</h1></section></div>',
            js: "",
          },
        },
      ],
    },
  });
  assert.deepEqual(
    fields.map((f) => [f.path, f.signals.join(",")]),
    [
      ["data.sections[1].settings.html", "psvk,html,veldnaam"],
      ["data.theme.css", "css,veldnaam"],
      ["data.sections[1].settings.js", "veldnaam"],
    ]
  );
  assert.equal(fields[2].length, 0);
});

test("findCodeFields: JS herkend, voorbeeld op één regel", () => {
  const js = "document.addEventListener('psvk:ready', function (e) {\n  var root = e.detail.root;\n});";
  const [field] = findCodeFields({ block: { value: js } });
  assert.equal(field.path, "block.value");
  assert.deepEqual(field.signals, ["psvk", "js"]);
  assert.ok(!field.preview.includes("\n"));
});

test("findCodeFields: een antwoord dat zelf HTML is", () => {
  const [field] = findCodeFields("<div class=\"psvk-app\"><p>Een stuk tekst dat lang genoeg is</p></div>");
  assert.equal(field.path, "(antwoord)");
});

test("parseCampaignInput", () => {
  assert.deepEqual(parseCampaignInput(" 189777 "), { kind: "id", id: 189777 });
  assert.deepEqual(parseCampaignInput("#189777"), { kind: "id", id: 189777 });
  assert.deepEqual(parseCampaignInput("https://club.psv.nl/actie?utm=x"), {
    kind: "url",
    url: "https://club.psv.nl/actie?utm=x",
  });
  assert.deepEqual(parseCampaignInput("javascript:alert(1)"), { kind: "invalid" });
  assert.deepEqual(parseCampaignInput("seizoenkaarten"), { kind: "invalid" });
});

test("normalizeUrl: protocol, www, query en slash maken niet uit", () => {
  assert.equal(normalizeUrl("https://www.Club.psv.nl/Actie/?utm=1#top"), normalizeUrl("http://club.psv.nl/actie"));
});
