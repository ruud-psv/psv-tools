import { test } from "node:test";
import assert from "node:assert/strict";

import { apiBase, parseOpenApi } from "./spec";
import { SAMPLE_SPEC_YAML } from "./fixtures";

test("YAML: rechten met omschrijving", () => {
  const spec = parseOpenApi(SAMPLE_SPEC_YAML);
  assert.deepEqual(
    spec.scopes.map((s) => s.name),
    [
      "campaigns.list",
      "campaigns.view",
      "campaigns.modify",
      "campaigns.copy",
      "campaigns.sections.list",
      "campaigns.sections.view",
      "campaigns.sections.form-fields.list",
      "campaigns.prizes.list",
      "campaigns.prizes.view",
      "campaigns.registrations.list",
    ]
  );
  assert.equal(spec.scopes[9].description, "Grant right to list registrations");
});

test("YAML: endpoints met methode, omschrijving en rechten", () => {
  const spec = parseOpenApi(SAMPLE_SPEC_YAML);
  const ops = spec.operations.map((o) => `${o.method} ${o.path} [${o.scopes.join(",")}] ${o.summary}`);
  assert.deepEqual(ops, [
    "post /oauth/token [campaigns.list,campaigns.modify,campaigns.copy] Authentication",
    "get /v1/campaigns [campaigns.list] List campaigns",
    "get /v1/campaign/{campaign} [campaigns.view] View a campaign",
    "post /v1/campaign/{campaign} [campaigns.modify] Update Campaign",
    "post /v1/campaign/copy/{campaign} [campaigns.copy] copyCampaign",
    "get /v1/campaign/{campaign}/sections [campaigns.sections.list] List sections",
    "get /v1/campaign/{campaign}/section/{section} [campaigns.sections.view] View a section",
    "get /v1/campaign/{campaign}/section/{section}/form-fields [campaigns.sections.form-fields.list] List form fields",
    "get /v1/campaign/{campaign}/prizes [campaigns.prizes.list] List prizes",
    "get /v1/campaign/{campaign}/prize/{prize} [campaigns.prizes.view] View a prize",
    "get /v1/campaign/{campaign}/registrations [campaigns.registrations.list] List registrations",
  ]);
});

test("YAML: de bron van een endpoint, met de schema's waar hij naar verwijst", () => {
  const spec = parseOpenApi(SAMPLE_SPEC_YAML);
  const update = spec.operations.find((o) => o.summary === "Update Campaign")!;
  assert.ok(update.source?.startsWith("post:\n  summary: Update Campaign"));
  assert.ok(update.source?.includes("# #/components/schemas/CampaignUpdate\nCampaignUpdate:"));
  assert.ok(update.source?.includes("active_from:"));

  // Ook een verwijzing binnen een verwijzing.
  const section = spec.operations.find((o) => o.summary === "View a section")!;
  assert.ok(section.source?.includes("# #/components/schemas/Section\n"));
  assert.ok(section.source?.includes("# #/components/schemas/SectionContent\n"));
  assert.ok(!section.source?.includes("CampaignUpdate"));
});

test("YAML: tekst in een omschrijving telt niet als endpoint", () => {
  const spec = parseOpenApi(SAMPLE_SPEC_YAML);
  assert.ok(!spec.operations.some((o) => o.path === "/niet-echt"));
});

test("YAML met vier spaties inspringing", () => {
  const wide = SAMPLE_SPEC_YAML.replace(/^( +)/gm, (spaces) => spaces + spaces);
  const spec = parseOpenApi(wide);
  assert.equal(spec.scopes.length, 10);
  assert.equal(spec.operations.length, 11);
  assert.ok(spec.operations[3].source?.includes("CampaignUpdate:"));
});

test("alleen het servers-blok telt als server", () => {
  const spec = parseOpenApi(SAMPLE_SPEC_YAML);
  assert.deepEqual(spec.servers, ["https://api.playable.com", "https://api.dev.playable.com"]);
});

test("JSON-beschrijving", () => {
  const spec = parseOpenApi(
    JSON.stringify({
      openapi: "3.0.0",
      servers: [{ url: "https://api.playable.com/v1" }],
      paths: {
        "/campaign/{id}": {
          get: { summary: "View", security: [{ oauth: ["campaigns.view"] }] },
          patch: { operationId: "modify", security: [{ oauth: ["campaigns.modify"] }] },
        },
      },
      components: {
        securitySchemes: {
          oauth: {
            type: "oauth2",
            flows: { clientCredentials: { scopes: { "campaigns.view": "View", "campaigns.modify": "Modify" } } },
          },
        },
      },
    })
  );
  assert.deepEqual(spec.scopes.map((s) => s.name), ["campaigns.view", "campaigns.modify"]);
  assert.deepEqual(
    spec.operations.map((o) => `${o.method} ${o.path} ${o.scopes.join(",")}`),
    ["get /campaign/{id} campaigns.view", "patch /campaign/{id} campaigns.modify"]
  );
  assert.equal(apiBase(spec.servers), "https://api.playable.com/v1");
});

test("apiBase: alleen api.playable.com via https, anders het vaste adres", () => {
  assert.equal(apiBase(["https://api.dev.playable.com", "https://api.playable.com"]), "https://api.playable.com");
  assert.equal(apiBase(["https://elders.example.com/v1"]), "https://api.playable.com");
  assert.equal(apiBase(["http://api.playable.com"]), "https://api.playable.com");
  assert.equal(apiBase([]), "https://api.playable.com");
});

test("niets te lezen geeft lege lijsten", () => {
  const spec = parseOpenApi("<html>niet gevonden</html>");
  assert.deepEqual(spec, { scopes: [], operations: [], servers: [] });
});
